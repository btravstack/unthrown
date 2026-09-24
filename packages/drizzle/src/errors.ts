import { TaggedError } from "unthrown";

/**
 * Fields every constraint violation carries, read straight off the driver
 * error. `constraint`, `table` and `column` are locale-independent; `detail` is
 * passed through verbatim and deliberately never parsed for a column list,
 * because PostgreSQL localizes message text. `detail` and `cause` are **not
 * enumerable** — see `concealDriverDetail`.
 */
type ConstraintFields = {
  constraint: string | undefined;
  table: string | undefined;
  detail: string | undefined;
  cause: unknown;
};

/**
 * Keep the driver's detail out of anything that enumerates the error.
 *
 * @remarks
 * `detail` quotes row values (`Key (email)=(a@b.c) already exists.`) and
 * `cause` is the `DrizzleQueryError` carrying the failing SQL and its bound
 * params. Left enumerable, `JSON.stringify(error)` — or a framework serialising
 * an error it was handed, or a logger spreading one — ships all of that to
 * wherever the error goes. Both stay readable (`error.detail`, `error.cause`);
 * `JSON.stringify`, `Object.keys` and spread merely skip them. The structural
 * fields (`_tag`, `constraint`, `table`, `column`) name schema, not data, and
 * stay enumerable.
 */
const concealDriverDetail = (error: object): void => {
  for (const key of ["detail", "cause"]) {
    Object.defineProperty(error, key, { enumerable: false });
  }
};

/** A unique constraint was violated (SQLSTATE `23505`). */
export class UniqueConstraintViolation extends TaggedError(
  "UniqueConstraintViolation",
)<ConstraintFields> {
  override message = "unique constraint violated";

  constructor(fields: ConstraintFields) {
    super(fields);
    concealDriverDetail(this);
  }
}

/** A foreign key constraint was violated (SQLSTATE `23503`). */
export class ForeignKeyViolation extends TaggedError("ForeignKeyViolation")<ConstraintFields> {
  override message = "foreign key constraint violated";

  constructor(fields: ConstraintFields) {
    super(fields);
    concealDriverDetail(this);
  }
}

/** A check constraint was violated (SQLSTATE `23514`). */
export class CheckViolation extends TaggedError("CheckViolation")<ConstraintFields> {
  override message = "check constraint violated";

  constructor(fields: ConstraintFields) {
    super(fields);
    concealDriverDetail(this);
  }
}

/** An exclusion constraint was violated (SQLSTATE `23P01`). */
export class ExclusionViolation extends TaggedError("ExclusionViolation")<ConstraintFields> {
  override message = "exclusion constraint violated";

  constructor(fields: ConstraintFields) {
    super(fields);
    concealDriverDetail(this);
  }
}

/** The fields a {@link NotNullViolation} carries. */
type NotNullFields = {
  column: string | undefined;
  table: string | undefined;
  detail: string | undefined;
  cause: unknown;
};

/**
 * A `NOT NULL` constraint was violated (SQLSTATE `23502`).
 *
 * @remarks
 * Carries `column` rather than `constraint`: `23502` names the offending column
 * and has no constraint name of its own. `detail` and `cause` are not
 * enumerable, as on the other four.
 */
export class NotNullViolation extends TaggedError("NotNullViolation")<NotNullFields> {
  override message = "not-null constraint violated";

  constructor(fields: NotNullFields) {
    super(fields);
    concealDriverDetail(this);
  }
}

/**
 * The full union of domain errors a Postgres query can surface.
 *
 * @remarks
 * Infrastructure failures are deliberately absent — they are defects, not
 * values. See {@link qualifyPgError}.
 */
export type PgQueryError =
  | UniqueConstraintViolation
  | ForeignKeyViolation
  | NotNullViolation
  | CheckViolation
  | ExclusionViolation;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

// Recognized structurally rather than with `instanceof DatabaseError`: a second
// copy of `pg` in the tree would defeat an identity check, the same dual-copy
// hazard `isResult` guards against. It also makes the qualifier driver-agnostic.
//
// A `code` alone is not enough: any value thrown with `{ code: "23505" }` — a
// transaction callback's own throw, say — became a modeled `Err` when it is a
// defect. What marks an error the SERVER reported is `severity`, which
// PostgreSQL sends with every error and node-postgres surfaces on every
// `DatabaseError`.
const isServerError = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && typeof value["code"] === "string" && typeof value["severity"] === "string";

const driverError = (cause: unknown): Record<string, unknown> | undefined => {
  if (isServerError(cause)) return cause;
  // Drizzle wraps driver failures in a DrizzleQueryError; the original is `cause`.
  const inner: unknown = isRecord(cause) ? cause["cause"] : undefined;
  return isServerError(inner) ? inner : undefined;
};

/**
 * Triage a Postgres driver failure into the modeled error channel or the defect
 * channel — a `qualify` in the Thesis-#3 sense, so it drops straight into a
 * `fromPromise` at a boundary of your own.
 *
 * @remarks
 * Only the five `23xxx` integrity-constraint codes are modeled: they are what a
 * request handler branches on. Everything else — serialization failure
 * (`40001`), deadlock (`40P01`), statement timeout (`57014`), connection loss,
 * syntax errors — is a defect. Retry belongs in one `recoverDefect` wrapper
 * that inspects the cause, not an arm at every write call site.
 *
 * Only an error the server reported is triaged — one carrying a `severity` as
 * well as a SQLSTATE `code`. Anything else with a `code` is a defect.
 *
 * @param cause - the rejected value from a Postgres query (a node-postgres
 * `DatabaseError`, a `DrizzleQueryError` wrapping one, or anything else).
 * @param defect - the defect helper the boundary injects (never import it).
 *
 * @example
 * ```ts
 * const rows = fromPromise(pool.query("select 1"), qualifyPgError);
 * ```
 */
export const qualifyPgError = <D>(
  cause: unknown,
  defect: (cause: unknown) => D,
): PgQueryError | D => {
  const err = driverError(cause);
  if (err === undefined) return defect(cause);

  const table = str(err["table"]);
  const detail = str(err["detail"]);
  const constraint = str(err["constraint"]);
  const shared = { constraint, table, detail, cause };

  switch (err["code"]) {
    case "23505":
      return new UniqueConstraintViolation(shared);
    case "23503":
      return new ForeignKeyViolation(shared);
    case "23514":
      return new CheckViolation(shared);
    case "23P01":
      return new ExclusionViolation(shared);
    case "23502":
      return new NotNullViolation({ column: str(err["column"]), table, detail, cause });
    default:
      return defect(cause);
  }
};
