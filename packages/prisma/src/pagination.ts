// Cursor pagination — the runtime half of `tryPaginate(...).withCursor(...)`,
// modeled on `prisma-extension-pagination` (same option names, same
// `[results, meta]` shape) with one behavioral fix folded in
// (deptyped/prisma-extension-pagination#35): a cursor pointing at a record that
// NO LONGER matches the query filter must not swallow the first element of the
// page. Instead of `skip: 1` past the cursor row — which skips a real result
// when the cursor row itself is filtered out — the page is over-fetched by two
// and the boundary row is dropped only when it IS the cursor row.

/**
 * The page metadata of `withCursor`.
 *
 * @remarks
 * `startCursor` / `endCursor` are the cursors of the page's boundary rows, so
 * they are `null` together exactly when the page is empty — checking one
 * narrows the other. They are deliberately NOT coupled to the flags: the last
 * page has `hasNextPage: false` with a non-null `endCursor`, and an empty page
 * past the end has `hasPreviousPage: true` with a null `startCursor`.
 */
export type CursorPaginationMeta = {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
} & ({ startCursor: string; endCursor: string } | { startCursor: null; endCursor: null });

/**
 * Options of `withCursor`, in the style of `prisma-extension-pagination`.
 *
 * @remarks
 * `limit: null` returns everything (from the `after` cursor when given).
 * Combining `limit: null` with `before` is a compile error — "everything
 * before the cursor, backwards, unbounded" is not something Prisma's negative
 * `take` can express.
 *
 * The default cursor is the record's `id` field, serialized with `String` and
 * parsed back to a number when it is all digits (autoincrement ids) — a bigint
 * once it exceeds `Number.MAX_SAFE_INTEGER`, so `BigInt` ids never lose
 * precision — or kept as a string otherwise (uuid / cuid ids). Provide
 * `getCursor` / `parseCursor` for composite keys, or when the selection omits
 * `id`.
 *
 * @typeParam Row - the (selection-narrowed) result row type.
 * @typeParam Cursor - the model's `cursor` input (its unique-where shape).
 */
export type CursorPaginationOptions<Row, Cursor> = {
  /** An opaque cursor: results strictly AFTER this record. */
  after?: string;
  /** Serialize a row into an opaque cursor. Defaults to `String(row.id)`. */
  getCursor?: (row: Row) => string;
  /** Parse an opaque cursor back into the model's `cursor` input. */
  parseCursor?: (cursor: string) => Cursor;
} & (
  | {
      /** Page size. */
      limit: number;
      /** An opaque cursor: results strictly BEFORE this record. */
      before?: string;
    }
  | {
      /** `null` returns all results. Cannot be combined with `before`. */
      limit: null;
      before?: never;
    }
);

// The one shape pagination needs from a delegate. The extension casts the
// untyped `getExtensionContext` result into it.
export type PaginationDelegate = {
  findMany: (args: object) => Promise<unknown[]>;
};

// The probe queries only check for existence — drop the caller's selection so
// they stay cheap and never fail on a selection that omits the cursor fields.
const resetSelection = { select: undefined, include: undefined, omit: undefined };

const defaultGetCursor = (row: unknown): string => {
  const id = (row as { id?: unknown }).id;
  if (id === undefined || id === null) {
    throw new Error(
      "@unthrown/prisma: the default cursor reads the `id` field — the row has none " +
        "(composite key, or a selection omitting `id`?). Provide getCursor/parseCursor.",
    );
  }
  return String(id);
};

// Preserve the id's type through the round-trip: an all-digits cursor parses
// back to a number (autoincrement ids) — or a bigint once it exceeds
// Number.MAX_SAFE_INTEGER, so a BigInt id never loses precision — and anything
// else stays a string (uuid / cuid).
const defaultParseCursor = (cursor: string): unknown => {
  if (!/^\d+$/.test(cursor)) return { id: cursor };
  const n = Number(cursor);
  return { id: Number.isSafeInteger(n) ? n : BigInt(cursor) };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Deep structural equality for parsed cursors: key-order independent, and safe
// for every value a Prisma unique input can carry — `bigint` ids, `Date`
// fields, nested composite-key records. (`JSON.stringify` would throw on
// `bigint` and is sensitive to key order.)
const cursorEquals = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => cursorEquals(value, b[i]))
    );
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && cursorEquals(a[key], b[key]))
    );
  }
  return false;
};

type RuntimeOptions = {
  limit: number | null;
  after?: string;
  before?: string;
  getCursor?: (row: never) => string;
  parseCursor?: (cursor: string) => unknown;
};

/**
 * The pagination engine. Exported for the typed `tryPaginate` surface (and its
 * edge-case unit tests); use `db.model.tryPaginate(...).withCursor(...)`.
 */
export const paginateWithCursor = async (
  model: PaginationDelegate,
  query: object | undefined,
  options: RuntimeOptions,
): Promise<[unknown[], CursorPaginationMeta]> => {
  const { limit, after, before } = options;
  const getCursor = (options.getCursor ?? defaultGetCursor) as (row: unknown) => string;
  const parseCursor = options.parseCursor ?? defaultParseCursor;

  // Is this row the cursor row? Compared through the cursor round-trip, so it
  // works for any serialization the caller chose.
  const sameCursor = (row: unknown, cursor: unknown): boolean =>
    cursorEquals(parseCursor(getCursor(row)), cursor);

  let results: unknown[];
  let hasPreviousPage = false;
  let hasNextPage = false;

  if (typeof before === "string") {
    const cursor = parseCursor(before);
    // Backwards from the cursor, over-fetched by two: one slot for the cursor
    // row itself (present only when it still matches the filter), one to know
    // whether a previous page exists. The forward probe answers hasNextPage —
    // the cursor row (or its closest matching successor) is the next page.
    const [rows, nextProbe] = await Promise.all([
      model.findMany({ ...query, cursor, take: limit === null ? undefined : -limit - 2 }),
      model.findMany({ ...query, ...resetSelection, cursor, take: 1 }),
    ]);
    results = rows;
    if (results.length > 0 && sameCursor(results[results.length - 1]!, cursor)) {
      results.pop(); // the cursor row itself — exclusive pagination
    } else if (limit !== null && results.length === limit + 2) {
      results.shift(); // cursor row filtered out: both extra slots hold real rows
    }
    if (limit !== null && results.length > limit) {
      hasPreviousPage = Boolean(results.shift());
    }
    hasNextPage = nextProbe.length > 0;
  } else if (typeof after === "string") {
    const cursor = parseCursor(after);
    // Forwards from the cursor, over-fetched by two (same slots as above,
    // mirrored). The backward probe answers hasPreviousPage.
    const [rows, previousProbe] = await Promise.all([
      model.findMany({ ...query, cursor, take: limit === null ? undefined : limit + 2 }),
      model.findMany({ ...query, ...resetSelection, cursor, take: -1 }),
    ]);
    results = rows;
    if (results.length > 0 && sameCursor(results[0]!, cursor)) {
      results.shift();
    } else if (limit !== null && results.length === limit + 2) {
      results.pop();
    }
    hasPreviousPage = previousProbe.length > 0;
    if (limit !== null && results.length > limit) {
      hasNextPage = Boolean(results.pop());
    }
  } else {
    results = await model.findMany({ ...query, take: limit === null ? undefined : limit + 1 });
    if (limit !== null && results.length > limit) {
      hasNextPage = Boolean(results.pop());
    }
  }

  // Boundary cursors travel together: both strings on a non-empty page, both
  // null on an empty one (see the CursorPaginationMeta union).
  const cursors =
    results.length > 0
      ? { startCursor: getCursor(results[0]!), endCursor: getCursor(results[results.length - 1]!) }
      : { startCursor: null, endCursor: null };

  return [results, { hasPreviousPage, hasNextPage, ...cursors }];
};
