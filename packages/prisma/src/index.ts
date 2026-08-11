// @unthrown/prisma — a Prisma Client extension that bridges Prisma queries into
// unthrown's `AsyncResult`.
//
// `$extends(unthrownPrisma)` adds `try`-prefixed variants of the model delegate
// operations ALONGSIDE the raw promise ones: each returns an `AsyncResult` whose
// error channel is the set of P-codes THAT operation can produce, mapped to
// tagged errors — a read cannot fail with `UniqueConstraintViolation` in the
// type. Qualification happens once, inside the extension (Thesis #3): no raw
// Promise ever crosses into a combinator.
//
// `E` carries ONLY domain outcomes — things a caller did, or a legitimate state
// conflict, that your code branches on:
//
//   UniqueConstraintViolation  P2002  → 409
//   ForeignKeyViolation        P2003  → 400
//   RecordNotFound             P2025/P2018 → 404
//
// Everything infrastructural — a dropped connection, a pool timeout, a deadlock,
// an unmapped P-code, a malformed query, an engine panic — is a DEFECT. Nobody
// branches on those in domain code; they are logged and turned into a 500 by the
// one `defect` arm you already write at the edge. Modelling them would have every
// call site carry an arm that does exactly what the `defect` arm beside it does.
//
//   const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);
//
//   await db.user.tryCreate({ data }).match({ ok, errCases, defect });
//   // errCases matches UniqueConstraintViolation | ForeignKeyViolation
//   //                | RecordNotFound  — and nothing else
//
// So a read has NO modeled failure: `tryFindMany` is `AsyncResult<User[], never>`
// (absence is `null`, not an error).
//
// The raw promise methods stay available on purpose: raw SQL goes through them,
// and a batch `$tryTransaction([...])` is composed FROM them — Prisma's batch
// form needs unexecuted `PrismaPromise`s, which a `try*` method (already
// executed, already an `AsyncResult`) cannot supply.

import { Prisma } from "@prisma/client/extension";
import { type AsyncResult, fromPromise, isResult, type Result, TaggedError } from "unthrown";

import {
  type CursorPaginationMeta,
  type CursorPaginationOptions,
  CursorParseFailure,
  type PaginationDelegate,
  paginateWithCursor,
} from "./pagination.js";

export type { CursorPaginationMeta, CursorPaginationOptions } from "./pagination.js";

/**
 * A unique constraint was violated (Prisma error `P2002`).
 *
 * @remarks
 * `fields` carries the offending column set from the error's `meta.target`
 * (empty when the driver does not report it).
 */
export class UniqueConstraintViolation extends TaggedError("UniqueConstraintViolation")<{
  fields: readonly string[];
  cause: unknown;
}> {}

/** A foreign key constraint was violated (Prisma error `P2003`). */
export class ForeignKeyViolation extends TaggedError("ForeignKeyViolation")<{ cause: unknown }> {}

/**
 * A record required by the operation does not exist (Prisma errors `P2025` and
 * `P2018`) — the missing row of a `findUniqueOrThrow`, `update`, or `delete`,
 * **or** the missing target of a nested `connect`.
 *
 * @remarks
 * The nested-`connect` case is why `tryCreate` and `tryUpsert` carry this error
 * despite never "missing" a row of their own: `create({ data: { author: {
 * connect: { id } } } })` raises `P2025` when that author does not exist (and
 * `P2018` for the to-many side of the same mistake). Both codes say the same
 * thing — a record the write depended on was not found — so both map here.
 */
export class RecordNotFound extends TaggedError("RecordNotFound")<{ cause: unknown }> {}

/**
 * The cursor handed to `withCursor` could not be used — the caller's
 * `parseCursor` rejected it, or the query it produced was one Prisma refuses.
 *
 * @remarks
 * The one anticipated failure of pagination, and the reason it is modeled at
 * all: a cursor is an **opaque string from the outside world** (a query
 * parameter), so a client sending garbage is input you answer with a 400 — not
 * a bug in your code. Every other pagination failure is a defect, like any other
 * query.
 */
export class InvalidCursor extends TaggedError("InvalidCursor")<{ cause: unknown }> {}

/**
 * The full union of domain errors a Prisma **query** can surface.
 *
 * @remarks
 * This is the RUNTIME-side union: {@link qualifyPrismaError} maps into it. Each
 * `try*` method narrows the static type to the codes its operation can actually
 * hit — a read hits none of them, so it is typed `never`.
 *
 * Infrastructure failures are deliberately absent: they are defects, not values
 * (see {@link qualifyPrismaError}). {@link InvalidCursor} is absent too — it
 * belongs to pagination, not to a query.
 */
export type PrismaQueryError = UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Recognized structurally rather than with `instanceof` against a class
// imported from a Prisma runtime entry: the runtime module path varies across
// Prisma versions (`runtime/library` in v4–v6, `runtime/client` in v7), and an
// `instanceof` against the wrong copy would silently fail. The `name` +
// string-`code` shape is stable across all of them.
type KnownRequestError = Error & { code: string; meta?: unknown };

const isKnownRequestError = (cause: unknown): cause is KnownRequestError =>
  cause instanceof Error &&
  cause.name === "PrismaClientKnownRequestError" &&
  typeof (cause as { code?: unknown }).code === "string";

// Recognized by `name` for the same reason as above.
const isValidationError = (cause: unknown): boolean =>
  cause instanceof Error && cause.name === "PrismaClientValidationError";

// The offending column set of a P2002, wherever this Prisma version put it:
// `meta.target` (the classic engine shape) or
// `meta.driverAdapterError.cause.constraint.fields` (the driver-adapter shape).
const constraintFields = (meta: unknown): readonly string[] => {
  if (!isRecord(meta)) return [];
  const target = meta["target"];
  if (Array.isArray(target)) return target.map(String);
  const adapterError = meta["driverAdapterError"];
  if (!isRecord(adapterError)) return [];
  const cause = adapterError["cause"];
  if (!isRecord(cause)) return [];
  const constraint = cause["constraint"];
  if (!isRecord(constraint)) return [];
  const fields = constraint["fields"];
  return Array.isArray(fields) ? fields.map(String) : [];
};

/**
 * Qualify a Prisma rejection — the runtime half of the bridge, and a ready-made
 * `qualify` for any boundary you build yourself (raw SQL).
 *
 * @remarks
 * The three P-codes that describe a **domain** outcome map to their tagged
 * errors — `P2002` → {@link UniqueConstraintViolation}, `P2003` →
 * {@link ForeignKeyViolation}, `P2025` / `P2018` → {@link RecordNotFound}.
 *
 * **Everything else is a defect**, with the original cause preserved: a dropped
 * connection, a pool timeout, a deadlock, an unmapped P-code, a malformed query,
 * a client that could not start, an engine panic. None of those is something
 * domain code branches on — they are logged and turned into a 500 at the edge,
 * which is precisely what the defect channel is for. Modelling them would force
 * every call site to carry an arm that duplicates its own `defect` arm.
 *
 * A defect is not a crash: it flows through the pipeline untouched and is folded
 * by `match`'s `defect` handler like any other unmodeled failure.
 *
 * @param cause - the rejected value from a Prisma query.
 * @param defect - the defect helper the boundary injects (never import it).
 *
 * @example
 * ```ts
 * // Pass it straight to a boundary — `defect` is injected for you.
 * const rows = fromPromise(db.$queryRaw`SELECT 1`, qualifyPrismaError);
 * ```
 */
export const qualifyPrismaError = <D>(
  cause: unknown,
  defect: (cause: unknown) => D,
): PrismaQueryError | D => {
  if (isKnownRequestError(cause)) {
    switch (cause.code) {
      case "P2002":
        return new UniqueConstraintViolation({ fields: constraintFields(cause.meta), cause });
      case "P2003":
        return new ForeignKeyViolation({ cause });
      // P2025 ("depends on records that were required but not found") and P2018
      // ("the required connected records were not found") are the same failure
      // reported from the to-one and to-many sides of a nested write.
      case "P2018":
      case "P2025":
        return new RecordNotFound({ cause });
      default:
        break;
    }
  }
  return defect(cause);
};

// Per-operation error unions — the static half, and only DOMAIN outcomes (every
// infrastructure failure is a defect, so it appears in none of these).
//
// A read therefore has NO modeled failure at all: absence is `null`, and a
// database that will not answer is a defect. Writes carry the constraint
// violations their SQL can raise; `*OrThrow` and mutations of a specific record
// add RecordNotFound for their missing row.
//
// RecordNotFound also reaches `create` and `upsert`, which have no row of their
// own to miss: a nested `connect` to a record that does not exist raises P2025
// (to-one) or P2018 (to-many). The BATCH mutations are the ones genuinely free
// of it — `createMany` / `updateMany` and their `*AndReturn` twins accept no
// nested writes, and zero matches is `Ok({ count: 0 })`, never an error.
type CreateError = UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound;
type CreateManyError = UniqueConstraintViolation | ForeignKeyViolation;
type UpdateError = RecordNotFound | UniqueConstraintViolation | ForeignKeyViolation;
type DeleteError = RecordNotFound | ForeignKeyViolation;
type UpsertError = UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound;
type UpdateManyError = UniqueConstraintViolation | ForeignKeyViolation;
type DeleteManyError = ForeignKeyViolation;

// The untyped runtime call under the typed surface: `getExtensionContext`
// resolves the concrete delegate and the promise is qualified at the boundary,
// so a raw Promise never escapes. Each public method casts the result down to
// its per-operation payload and error union (the `$allModels` implementation
// side is untyped by design; the declared signatures carry the safety).
type UntypedDelegate = Record<string, (args?: unknown) => Promise<unknown>>;

const query = (self: unknown, op: string, args?: unknown): AsyncResult<unknown, PrismaQueryError> =>
  // Passed as a THUNK: a delegate that throws synchronously (e.g. a validation
  // error out of untyped args) is absorbed by the boundary instead of escaping
  // the AsyncResult as a raw throw.
  fromPromise(
    () => (Prisma.getExtensionContext(self) as unknown as UntypedDelegate)[op]!(args),
    qualifyPrismaError,
  );

// Pagination's own triage — the one place a Prisma VALIDATION error is a value
// rather than a defect. A cursor is an OPAQUE STRING from the outside world (a
// query parameter), turned into a `where` input by caller-supplied
// `parseCursor`, so:
//
//   - `parseCursor` itself rejecting the string (flagged by the CursorParseFailure
//     sentinel — a throw out of `getCursor`, which reads rows WE fetched, is a bug
//     and is deliberately not flagged), and
//   - a query Prisma refuses to validate, which for a cursor-driven `findMany` is
//     overwhelmingly the cursor rather than the `Prisma.Exact`-typed query args
//
// are both anticipated bad input: an InvalidCursor you answer with a 400. Every
// other cause is triaged exactly as it is everywhere else — a defect.
const qualifyPaginationError = <D>(
  cause: unknown,
  defect: (cause: unknown) => D,
): InvalidCursor | D =>
  cause instanceof CursorParseFailure
    ? new InvalidCursor({ cause: cause.cause })
    : isValidationError(cause)
      ? new InvalidCursor({ cause })
      : defect(cause);

// The rollback sentinel: an `Err` (or defect) inside `$tryTransaction`'s
// callback is thrown so Prisma aborts the transaction, then unwrapped back out
// on the other side.
class Rollback extends Error {
  constructor(
    readonly carried: unknown,
    readonly wasDefect: boolean,
  ) {
    super("transaction rolled back");
  }
}

/**
 * The isolation levels Prisma accepts across databases, as a closed union.
 *
 * @remarks
 * The schema-derived `Prisma.TransactionIsolationLevel` of a generated client
 * is narrower (it lists only what YOUR database supports), but a shareable
 * extension cannot name a generated type — this union at least rejects typos
 * at compile time; a level your database does not support still fails at
 * runtime as a defect (an unsupported level is a bug, not an outcome).
 */
export type TransactionIsolationLevel =
  | "ReadUncommitted"
  | "ReadCommitted"
  | "RepeatableRead"
  | "Snapshot"
  | "Serializable";

/**
 * What `tryPaginate` returns: a builder holding the query, consumed by
 * `withCursor`.
 *
 * @typeParam Results - the (selection-narrowed) `findMany` payload.
 * @typeParam Cursor - the model's `cursor` input (its unique-where shape).
 */
export type CursorPaginator<Results extends readonly unknown[], Cursor> = {
  /**
   * Run the paginated query: the page and its metadata, or an
   * {@link InvalidCursor} — the only modeled failure, since the cursor is the
   * only part of the query that came from outside.
   */
  readonly withCursor: (
    options: CursorPaginationOptions<Results[number], Cursor>,
  ) => AsyncResult<[Results, CursorPaginationMeta], InvalidCursor>;
};

// Mirrors Prisma's `ITXClientDenyList` — what an interactive-transaction client
// cannot do — plus `$tryTransaction` itself: nested transactions are not a
// thing, and the itx client has no `$transaction` for the bridge to delegate to.
type TxDenyList =
  | "$connect"
  | "$disconnect"
  | "$on"
  | "$transaction"
  | "$use"
  | "$extends"
  | "$tryTransaction";

/**
 * The client an interactive `$tryTransaction` callback receives — the extended
 * client minus what a transaction cannot do.
 *
 * @remarks
 * Name the `tx` parameter of a helper factored out of a callback with this,
 * rather than restating the deny list: `$tryTransaction` uses the very same
 * alias, so the two cannot drift. Restating it by hand does drift silently —
 * `Omit` of a key that does not exist is not an error, so a hand-copied list
 * keeps compiling after the library's own list changes.
 *
 * Not to be confused with Prisma's own generated `Prisma.TransactionClient` —
 * that one is non-generic and, notably, does not remove `$tryTransaction`.
 *
 * @typeParam C - the extended client, usually `typeof db`.
 *
 * @example
 * ```ts
 * type Tx = TransactionClient<typeof db>;
 *
 * const chargeFees = (tx: Tx, id: number) =>
 *   tx.invoice.tryUpdate({ where: { id }, data: { charged: true } });
 *
 * db.$tryTransaction((tx) => chargeFees(tx, 1));
 * ```
 */
export type TransactionClient<C> = Omit<C, TxDenyList>;

// Prisma's own `UnwrapTuple` lives at `runtime.Types.Utils.UnwrapTuple`, behind a
// runtime entry path this package deliberately never imports (it moved between
// Prisma 6 and 7), so the mapping is written here. A fixed tuple keeps positional
// types; a dynamic `PrismaPromise<T>[]` collapses to `T[]` — the same duality as
// core's `all`.
type UnwrapPrismaTuple<P extends readonly unknown[]> = {
  -readonly [K in keyof P]: P[K] extends Prisma.PrismaPromise<infer X> ? X : never;
};

type TryTransaction = {
  /**
   * An interactive transaction whose callback speaks `AsyncResult`: an `Err`
   * triggers a ROLLBACK and comes out as the same typed `Err`.
   *
   * @remarks
   * The callback's `Err` is thrown internally as a sentinel so Prisma aborts the
   * transaction, then unwrapped back into the typed error channel —
   * `AsyncResult<T, E | PrismaQueryError>`. A defect inside the callback also
   * rolls back and stays a defect — including a callback that *throws* instead
   * of returning an `AsyncResult` (a bug, never downgraded to a modeled error).
   * The `try*` methods are available on `tx` (extensions propagate into the
   * interactive transaction); the deny list additionally removes
   * `$tryTransaction` itself — no nesting. Name a helper's `tx` parameter with
   * {@link TransactionClient}.
   *
   * The `| PrismaQueryError` is not merely defensive: a deferred constraint
   * surfaces its violation at COMMIT rather than at the statement, so the
   * transaction boundary itself can produce one. Prisma's own machinery failing
   * any other way (a `maxWait` / `timeout` expiry, a lost connection) is
   * infrastructure, and so a defect like everywhere else.
   *
   * @example
   * ```ts
   * const moved = db.$tryTransaction((tx) =>
   *   tx.account
   *     .tryUpdate({ where: { id: from }, data: { balance: { decrement: amount } } })
   *     .flatMap(() =>
   *       tx.account.tryUpdate({
   *         where: { id: to },
   *         data: { balance: { increment: amount } },
   *       }),
   *     ),
   * );
   * // Err anywhere → both updates rolled back, and the Err is in `moved`.
   * ```
   */
  <C, T, E>(
    this: C,
    fn: (tx: TransactionClient<C>) => AsyncResult<T, E>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: TransactionIsolationLevel;
    },
  ): AsyncResult<T, E | PrismaQueryError>;

  /**
   * A batch transaction: the operations run in one round trip, all or nothing,
   * with no application code held open in between.
   *
   * @remarks
   * Two things follow from Prisma's batch form taking **unexecuted**
   * `PrismaPromise`s, and both are deliberate:
   *
   * - The array holds the **raw** delegate methods — `db.user.create(...)`, not
   *   `tryCreate`. A `try*` method has already executed and returns an
   *   `AsyncResult`, so passing one is a compile error.
   * - `E` is the whole {@link PrismaQueryError} union rather than the
   *   per-operation narrowing the `try*` methods give: a raw `PrismaPromise`
   *   carries no error-type information. Every infrastructure failure is still
   *   a defect, exactly as everywhere else.
   *
   * A fixed tuple keeps positional types; a dynamic array (a `.map(...)`)
   * collapses to `AsyncResult<T[], PrismaQueryError>`.
   *
   * `maxWait` and `timeout` are absent by design — they govern an interactive
   * transaction's open window, which a single-round-trip batch does not have.
   *
   * @example
   * ```ts
   * const rows = db.$tryTransaction(
   *   inputs.map((data) => db.user.create({ data })),
   * );
   * //    ^? AsyncResult<User[], PrismaQueryError>
   * // Any constraint violation → nothing is written, and the Err is modeled.
   * ```
   */
  <C, P extends readonly Prisma.PrismaPromise<unknown>[]>(
    this: C,
    operations: readonly [...P],
    options?: { isolationLevel?: TransactionIsolationLevel },
  ): AsyncResult<UnwrapPrismaTuple<P>, PrismaQueryError>;
};

// Declared as a const rather than an object-literal method because it is
// OVERLOADED (Prisma's `$transaction` has two forms and the `try*` prefix maps
// one-to-one onto it). The implementation side is untyped, as it is for the
// `$allModels` methods: the declared signatures carry the safety.
const $tryTransaction = function <T, E>(this: unknown, arg: unknown, options?: unknown) {
  const client = Prisma.getExtensionContext(this) as unknown as {
    $transaction: (arg: unknown, opts?: unknown) => Promise<unknown>;
  };
  // The batch form needs none of the sentinel machinery below: there is no
  // callback whose `Err` has to travel out through a throw. Prisma runs the
  // array in one transaction and rejects with the first failure, which is
  // qualified exactly like any other query.
  if (Array.isArray(arg)) {
    return fromPromise(() => client.$transaction(arg, options), qualifyPrismaError);
  }
  const fn = arg as (tx: unknown) => AsyncResult<T, E>;
  // Passed as a THUNK so even a synchronous throw out of `$transaction` itself
  // (e.g. invalid options from untyped code) stays inside the boundary instead
  // of escaping as a raw throw.
  //
  // The triage runs with the concrete `PrismaQueryError` union — `qualify`'s
  // `NotThenable` return constraint cannot be proven over the unresolved `E`
  // parameter (the generic-`E` concession, as guards-over-match) — and the
  // callback's modeled `E` is re-attached by the declared signature.
  return fromPromise(
    () =>
      client.$transaction(async (tx: unknown) => {
        let result: Result<T, E>;
        try {
          const returned: unknown = await fn(tx);
          // A callback that resolves to a NON-Result (out of contract — e.g. a
          // raw value from untyped code) is a bug, exactly like a throwing
          // callback: the TypeError is caught below, so it rolls back as a
          // DEFECT — never downgraded to a modeled error.
          if (!isResult(returned)) {
            throw new TypeError(
              "@unthrown/prisma: the $tryTransaction callback did not return a Result.",
            );
          }
          result = returned as Result<T, E>;
        } catch (cause) {
          // A callback that throws (instead of returning an AsyncResult) is a
          // bug — roll back and keep it a DEFECT. Only rejections outside this
          // catch (Prisma's own BEGIN/COMMIT/timeout machinery) qualify as
          // query failures below.
          throw new Rollback(cause, true);
        }
        if (result.isOk()) return result.value;
        throw result.isErr() ? new Rollback(result.error, false) : new Rollback(result.cause, true);
      }, options),
    (cause, defect) =>
      cause instanceof Rollback
        ? cause.wasDefect
          ? defect(cause.carried)
          : (cause.carried as PrismaQueryError)
        : qualifyPrismaError(cause, defect),
  );
} as TryTransaction;

/**
 * The Prisma Client extension. Apply it with `$extends` to add the `try*`
 * methods to every model delegate, and `$tryTransaction` to the client.
 *
 * @remarks
 * Typing follows Prisma's documented `$allModels` pattern: `this: T` binds the
 * concrete delegate, `Prisma.Exact` checks args, and `Prisma.Result` computes
 * the payload — so `select` / `include` inference survives the wrap.
 *
 * @example
 * ```ts
 * import { PrismaClient } from "./generated/prisma/client.ts";
 * import { unthrownPrisma } from "@unthrown/prisma";
 *
 * const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);
 *
 * const users = db.user.tryFindMany({ select: { id: true } });
 * //    ^? AsyncResult<{ id: number }[], never>  — a read has no modeled failure
 * ```
 */
export const unthrownPrisma = Prisma.defineExtension({
  name: "@unthrown/prisma",
  model: {
    $allModels: {
      /** `findMany`, qualified: the list. A read has no modeled failure. */
      tryFindMany<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "findMany">>,
      ): AsyncResult<Prisma.Result<T, A, "findMany">, never> {
        return query(this, "findMany", args) as AsyncResult<Prisma.Result<T, A, "findMany">, never>;
      },

      /** `findUnique`, qualified: the row or `null` — absence is not an error. */
      tryFindUnique<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "findUnique">>,
      ): AsyncResult<Prisma.Result<T, A, "findUnique">, never> {
        return query(this, "findUnique", args) as AsyncResult<
          Prisma.Result<T, A, "findUnique">,
          never
        >;
      },

      /**
       * `findUniqueOrThrow`, qualified: the missing row is a modeled
       * {@link RecordNotFound}, not a throw.
       */
      tryFindUniqueOrThrow<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "findUniqueOrThrow">>,
      ): AsyncResult<Prisma.Result<T, A, "findUniqueOrThrow">, RecordNotFound> {
        return query(this, "findUniqueOrThrow", args) as AsyncResult<
          Prisma.Result<T, A, "findUniqueOrThrow">,
          RecordNotFound
        >;
      },

      /** `findFirst`, qualified: the first match or `null`. */
      tryFindFirst<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "findFirst">>,
      ): AsyncResult<Prisma.Result<T, A, "findFirst">, never> {
        return query(this, "findFirst", args) as AsyncResult<
          Prisma.Result<T, A, "findFirst">,
          never
        >;
      },

      /**
       * `findFirstOrThrow`, qualified: no match is a modeled
       * {@link RecordNotFound}, not a throw.
       */
      tryFindFirstOrThrow<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "findFirstOrThrow">>,
      ): AsyncResult<Prisma.Result<T, A, "findFirstOrThrow">, RecordNotFound> {
        return query(this, "findFirstOrThrow", args) as AsyncResult<
          Prisma.Result<T, A, "findFirstOrThrow">,
          RecordNotFound
        >;
      },

      /** `count`, qualified. */
      tryCount<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "count">>,
      ): AsyncResult<Prisma.Result<T, A, "count">, never> {
        return query(this, "count", args) as AsyncResult<Prisma.Result<T, A, "count">, never>;
      },

      /** `aggregate`, qualified. */
      tryAggregate<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "aggregate">>,
      ): AsyncResult<Prisma.Result<T, A, "aggregate">, never> {
        return query(this, "aggregate", args) as AsyncResult<
          Prisma.Result<T, A, "aggregate">,
          never
        >;
      },

      /** `groupBy`, qualified. */
      tryGroupBy<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "groupBy">>,
      ): AsyncResult<Prisma.Result<T, A, "groupBy">, never> {
        return query(this, "groupBy", args) as AsyncResult<Prisma.Result<T, A, "groupBy">, never>;
      },

      /**
       * `create`, qualified: constraint violations are modeled —
       * {@link UniqueConstraintViolation} and {@link ForeignKeyViolation} — and
       * so is a nested `connect` to a row that does not exist
       * ({@link RecordNotFound}).
       */
      tryCreate<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "create">>,
      ): AsyncResult<Prisma.Result<T, A, "create">, CreateError> {
        return query(this, "create", args) as AsyncResult<
          Prisma.Result<T, A, "create">,
          CreateError
        >;
      },

      /**
       * `createMany`, qualified: the batch count, or the constraint violations
       * the batch can raise. No {@link RecordNotFound} — `createMany` accepts
       * no nested writes, so there is no `connect` to miss.
       */
      tryCreateMany<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "createMany">>,
      ): AsyncResult<Prisma.Result<T, A, "createMany">, CreateManyError> {
        return query(this, "createMany", args) as AsyncResult<
          Prisma.Result<T, A, "createMany">,
          CreateManyError
        >;
      },

      /** `createManyAndReturn`, qualified: the created rows instead of a count. */
      tryCreateManyAndReturn<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "createManyAndReturn">>,
      ): AsyncResult<Prisma.Result<T, A, "createManyAndReturn">, CreateManyError> {
        return query(this, "createManyAndReturn", args) as AsyncResult<
          Prisma.Result<T, A, "createManyAndReturn">,
          CreateManyError
        >;
      },

      /**
       * `update`, qualified: the missing row is a modeled
       * {@link RecordNotFound}; constraint violations are modeled too.
       */
      tryUpdate<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "update">>,
      ): AsyncResult<Prisma.Result<T, A, "update">, UpdateError> {
        return query(this, "update", args) as AsyncResult<
          Prisma.Result<T, A, "update">,
          UpdateError
        >;
      },

      /**
       * `upsert`, qualified: a missing *target* is never an error — a miss
       * **creates** — but the write can still hit the modeled constraint
       * violations, and a nested `connect` in either branch can still raise
       * {@link RecordNotFound}.
       */
      tryUpsert<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "upsert">>,
      ): AsyncResult<Prisma.Result<T, A, "upsert">, UpsertError> {
        return query(this, "upsert", args) as AsyncResult<
          Prisma.Result<T, A, "upsert">,
          UpsertError
        >;
      },

      /**
       * `updateMany`, qualified: the batch count. Zero matches is `Ok({ count:
       * 0 })` — never {@link RecordNotFound} — but a constraint violation is
       * still modeled.
       */
      tryUpdateMany<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "updateMany">>,
      ): AsyncResult<Prisma.Result<T, A, "updateMany">, UpdateManyError> {
        return query(this, "updateMany", args) as AsyncResult<
          Prisma.Result<T, A, "updateMany">,
          UpdateManyError
        >;
      },

      /** `updateManyAndReturn`, qualified: the updated rows instead of a count. */
      tryUpdateManyAndReturn<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "updateManyAndReturn">>,
      ): AsyncResult<Prisma.Result<T, A, "updateManyAndReturn">, UpdateManyError> {
        return query(this, "updateManyAndReturn", args) as AsyncResult<
          Prisma.Result<T, A, "updateManyAndReturn">,
          UpdateManyError
        >;
      },

      /**
       * `delete`, qualified: the missing row is a modeled
       * {@link RecordNotFound}.
       */
      tryDelete<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "delete">>,
      ): AsyncResult<Prisma.Result<T, A, "delete">, DeleteError> {
        return query(this, "delete", args) as AsyncResult<
          Prisma.Result<T, A, "delete">,
          DeleteError
        >;
      },

      /**
       * `deleteMany`, qualified: the batch count. Zero matches is `Ok({ count:
       * 0 })` — never {@link RecordNotFound} — but deleting a still-referenced
       * parent is a modeled {@link ForeignKeyViolation}.
       */
      tryDeleteMany<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "deleteMany">>,
      ): AsyncResult<Prisma.Result<T, A, "deleteMany">, DeleteManyError> {
        return query(this, "deleteMany", args) as AsyncResult<
          Prisma.Result<T, A, "deleteMany">,
          DeleteManyError
        >;
      },

      /**
       * Cursor pagination, in the style of `prisma-extension-pagination`:
       * `tryPaginate(query).withCursor({ limit, after, before })` runs the
       * `findMany` and answers with `[results, meta]`, where `meta` carries
       * `hasPreviousPage` / `hasNextPage` / `startCursor` / `endCursor`.
       *
       * @remarks
       * `args` is the `findMany` query WITHOUT `cursor` / `take` / `skip` —
       * pagination owns those. A cursor pointing at a record that no longer
       * matches the query filter is handled correctly (the first element of
       * the page is not skipped). A throwing `parseCursor` — e.g. a malformed
       * cursor from an API client — surfaces as an {@link InvalidCursor}.
       *
       * @example
       * ```ts
       * const page = await db.user
       *   .tryPaginate({ where: { active: true }, orderBy: { id: "asc" } })
       *   .withCursor({ limit: 20, after: req.query.cursor });
       * // Ok([users, { hasNextPage, endCursor, ... }]) | Err(InvalidCursor)
       * ```
       */
      tryPaginate<T, A>(
        this: T,
        args?: Prisma.Exact<A, Omit<Prisma.Args<T, "findMany">, "cursor" | "take" | "skip">>,
      ): CursorPaginator<
        Prisma.Result<T, A, "findMany">,
        NonNullable<Prisma.Args<T, "findMany">["cursor"]>
      > {
        return {
          // Everything runs inside the THUNK, `getExtensionContext` included —
          // the same discipline as `query` above, so no synchronous throw can
          // escape the boundary as a raw throw.
          withCursor: (options: Parameters<typeof paginateWithCursor>[2]) =>
            fromPromise(
              () =>
                paginateWithCursor(
                  Prisma.getExtensionContext(this) as unknown as PaginationDelegate,
                  args as object | undefined,
                  options,
                ),
              qualifyPaginationError,
            ),
        } as unknown as CursorPaginator<
          Prisma.Result<T, A, "findMany">,
          NonNullable<Prisma.Args<T, "findMany">["cursor"]>
        >;
      },
    },
  },
  client: { $tryTransaction },
});
