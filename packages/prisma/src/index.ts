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
//   const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);
//
//   await db.user.tryCreate({ data }).match({ ok, err, defect });
//   // err is UniqueConstraintViolation | ForeignKeyViolation | DriverError
//
// The raw promise methods stay available on purpose: they are the escape hatch
// for batch `$transaction([...])`, which needs unexecuted `PrismaPromise`s.

import { Prisma } from "@prisma/client/extension";
import { type AsyncResult, fromPromise, TaggedError } from "unthrown";

import {
  type CursorPaginationMeta,
  type CursorPaginationOptions,
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
 * A record required by the operation does not exist (Prisma error `P2025`) —
 * the missing row of a `findUniqueOrThrow`, `update`, or `delete`.
 */
export class RecordNotFound extends TaggedError("RecordNotFound")<{ cause: unknown }> {}

/**
 * Any other query failure: connection drops, timeouts, unmapped P-codes,
 * driver-level errors.
 *
 * @remarks
 * Prisma validation errors land here too. Arguably a malformed query is a
 * programmer bug rather than an anticipated outcome; triage it further at the
 * call site if the distinction matters to you.
 */
export class DriverError extends TaggedError("DriverError")<{ cause: unknown }> {}

/**
 * The full union of tagged errors a Prisma query can surface.
 *
 * @remarks
 * This is the RUNTIME-side union: {@link qualifyPrismaError} maps into it. Each
 * `try*` method narrows the static type to the codes its operation can
 * actually hit (a read is typed `DriverError` only).
 */
export type PrismaQueryError =
  | UniqueConstraintViolation
  | ForeignKeyViolation
  | RecordNotFound
  | DriverError;

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
 * Qualify a Prisma rejection into a tagged error — the runtime half of the
 * bridge.
 *
 * @remarks
 * Recognized P-codes map to their dedicated errors (`P2002` →
 * {@link UniqueConstraintViolation}, `P2003` → {@link ForeignKeyViolation},
 * `P2025` → {@link RecordNotFound}); everything else — including non-Prisma
 * causes — folds into {@link DriverError} with the cause preserved.
 *
 * @param cause - the rejected value from a Prisma query.
 */
export const qualifyPrismaError = (cause: unknown): PrismaQueryError => {
  if (isKnownRequestError(cause)) {
    switch (cause.code) {
      case "P2002":
        return new UniqueConstraintViolation({ fields: constraintFields(cause.meta), cause });
      case "P2003":
        return new ForeignKeyViolation({ cause });
      case "P2025":
        return new RecordNotFound({ cause });
      default:
        break;
    }
  }
  return new DriverError({ cause });
};

// Per-operation error unions — the static half. Reads can only fail in the
// driver; writes add the constraint violations their SQL can raise; `*OrThrow`
// and mutations of a specific record add P2025. The batch mutations (`*Many`)
// and `upsert` never raise P2025: zero matches is `Ok({ count: 0 })`, and an
// upsert miss creates.
type ReadError = DriverError;
type CreateError = UniqueConstraintViolation | ForeignKeyViolation | DriverError;
type UpdateError = RecordNotFound | UniqueConstraintViolation | ForeignKeyViolation | DriverError;
type DeleteError = RecordNotFound | ForeignKeyViolation | DriverError;
type UpsertError = UniqueConstraintViolation | ForeignKeyViolation | DriverError;
type UpdateManyError = UniqueConstraintViolation | ForeignKeyViolation | DriverError;
type DeleteManyError = ForeignKeyViolation | DriverError;

// The untyped runtime call under the typed surface: `getExtensionContext`
// resolves the concrete delegate and the promise is qualified at the boundary,
// so a raw Promise never escapes. Each public method casts the result down to
// its per-operation payload and error union (the `$allModels` implementation
// side is untyped by design; the declared signatures carry the safety).
type UntypedDelegate = Record<string, (args?: unknown) => Promise<unknown>>;

const query = (self: unknown, op: string, args?: unknown): AsyncResult<unknown, PrismaQueryError> =>
  fromPromise(
    (Prisma.getExtensionContext(self) as unknown as UntypedDelegate)[op]!(args),
    qualifyPrismaError,
  );

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
 * runtime as a {@link DriverError}.
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
   * Run the paginated query: the page and its metadata, or a
   * {@link DriverError}.
   */
  readonly withCursor: (
    options: CursorPaginationOptions<Results[number], Cursor>,
  ) => AsyncResult<[Results, CursorPaginationMeta], DriverError>;
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
 * //    ^? AsyncResult<{ id: number }[], DriverError>
 * ```
 */
export const unthrownPrisma = Prisma.defineExtension({
  name: "@unthrown/prisma",
  model: {
    $allModels: {
      /** `findMany`, qualified: the list, or a {@link DriverError}. */
      tryFindMany<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "findMany">>,
      ): AsyncResult<Prisma.Result<T, A, "findMany">, ReadError> {
        return query(this, "findMany", args) as AsyncResult<
          Prisma.Result<T, A, "findMany">,
          ReadError
        >;
      },

      /** `findUnique`, qualified: the row or `null`, or a {@link DriverError}. */
      tryFindUnique<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "findUnique">>,
      ): AsyncResult<Prisma.Result<T, A, "findUnique">, ReadError> {
        return query(this, "findUnique", args) as AsyncResult<
          Prisma.Result<T, A, "findUnique">,
          ReadError
        >;
      },

      /**
       * `findUniqueOrThrow`, qualified: the missing row is a modeled
       * {@link RecordNotFound}, not a throw.
       */
      tryFindUniqueOrThrow<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "findUniqueOrThrow">>,
      ): AsyncResult<Prisma.Result<T, A, "findUniqueOrThrow">, RecordNotFound | DriverError> {
        return query(this, "findUniqueOrThrow", args) as AsyncResult<
          Prisma.Result<T, A, "findUniqueOrThrow">,
          RecordNotFound | DriverError
        >;
      },

      /** `findFirst`, qualified: the first match or `null`, or a {@link DriverError}. */
      tryFindFirst<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "findFirst">>,
      ): AsyncResult<Prisma.Result<T, A, "findFirst">, ReadError> {
        return query(this, "findFirst", args) as AsyncResult<
          Prisma.Result<T, A, "findFirst">,
          ReadError
        >;
      },

      /**
       * `findFirstOrThrow`, qualified: no match is a modeled
       * {@link RecordNotFound}, not a throw.
       */
      tryFindFirstOrThrow<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "findFirstOrThrow">>,
      ): AsyncResult<Prisma.Result<T, A, "findFirstOrThrow">, RecordNotFound | DriverError> {
        return query(this, "findFirstOrThrow", args) as AsyncResult<
          Prisma.Result<T, A, "findFirstOrThrow">,
          RecordNotFound | DriverError
        >;
      },

      /** `count`, qualified. */
      tryCount<T, A = Record<string, never>>(
        this: T,
        args?: Prisma.Exact<A, Prisma.Args<T, "count">>,
      ): AsyncResult<Prisma.Result<T, A, "count">, ReadError> {
        return query(this, "count", args) as AsyncResult<Prisma.Result<T, A, "count">, ReadError>;
      },

      /** `aggregate`, qualified. */
      tryAggregate<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "aggregate">>,
      ): AsyncResult<Prisma.Result<T, A, "aggregate">, ReadError> {
        return query(this, "aggregate", args) as AsyncResult<
          Prisma.Result<T, A, "aggregate">,
          ReadError
        >;
      },

      /** `groupBy`, qualified. */
      tryGroupBy<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "groupBy">>,
      ): AsyncResult<Prisma.Result<T, A, "groupBy">, ReadError> {
        return query(this, "groupBy", args) as AsyncResult<
          Prisma.Result<T, A, "groupBy">,
          ReadError
        >;
      },

      /**
       * `create`, qualified: constraint violations are modeled —
       * {@link UniqueConstraintViolation} and {@link ForeignKeyViolation}.
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
       * `createMany`, qualified: the batch count, or the same modeled
       * constraint violations as `tryCreate`.
       */
      tryCreateMany<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "createMany">>,
      ): AsyncResult<Prisma.Result<T, A, "createMany">, CreateError> {
        return query(this, "createMany", args) as AsyncResult<
          Prisma.Result<T, A, "createMany">,
          CreateError
        >;
      },

      /** `createManyAndReturn`, qualified: the created rows instead of a count. */
      tryCreateManyAndReturn<T, A>(
        this: T,
        args: Prisma.Exact<A, Prisma.Args<T, "createManyAndReturn">>,
      ): AsyncResult<Prisma.Result<T, A, "createManyAndReturn">, CreateError> {
        return query(this, "createManyAndReturn", args) as AsyncResult<
          Prisma.Result<T, A, "createManyAndReturn">,
          CreateError
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
       * `upsert`, qualified: no {@link RecordNotFound} in the union — a miss
       * *creates* — but the write can still hit the modeled constraint
       * violations.
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
       * cursor from an API client — surfaces as a {@link DriverError}.
       *
       * @example
       * ```ts
       * const page = await db.user
       *   .tryPaginate({ where: { active: true }, orderBy: { id: "asc" } })
       *   .withCursor({ limit: 20, after: req.query.cursor });
       * // Ok([users, { hasNextPage, endCursor, ... }]) | Err(DriverError)
       * ```
       */
      tryPaginate<T, A>(
        this: T,
        args?: Prisma.Exact<A, Omit<Prisma.Args<T, "findMany">, "cursor" | "take" | "skip">>,
      ): CursorPaginator<
        Prisma.Result<T, A, "findMany">,
        NonNullable<Prisma.Args<T, "findMany">["cursor"]>
      > {
        const delegate = Prisma.getExtensionContext(this) as unknown as PaginationDelegate;
        return {
          withCursor: (options: Parameters<typeof paginateWithCursor>[2]) =>
            fromPromise(
              paginateWithCursor(delegate, args as object | undefined, options),
              qualifyPrismaError,
            ),
        } as unknown as CursorPaginator<
          Prisma.Result<T, A, "findMany">,
          NonNullable<Prisma.Args<T, "findMany">["cursor"]>
        >;
      },
    },
  },
  client: {
    /**
     * An interactive transaction whose callback speaks `AsyncResult`: an `Err`
     * triggers a ROLLBACK and comes out as the same typed `Err`.
     *
     * @remarks
     * The callback's `Err` is thrown internally as a sentinel so Prisma aborts
     * the transaction, then unwrapped back into the typed error channel —
     * `AsyncResult<T, E | PrismaQueryError>`. A defect inside the callback also
     * rolls back and stays a defect. The `try*` methods are available on `tx`
     * (extensions propagate into the interactive transaction); the deny list
     * additionally removes `$tryTransaction` itself — no nesting.
     *
     * @example
     * ```ts
     * const moved = db.$tryTransaction((tx) =>
     *   tx.account.tryUpdate({ where: { id: from }, data: { balance: { decrement: amount } } })
     *     .flatMap(() =>
     *       tx.account.tryUpdate({ where: { id: to }, data: { balance: { increment: amount } } }),
     *     ),
     * );
     * // Err anywhere → both updates rolled back, and the Err is in `moved`.
     * ```
     */
    $tryTransaction<C, T, E>(
      this: C,
      fn: (tx: Omit<C, TxDenyList>) => AsyncResult<T, E>,
      options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: TransactionIsolationLevel;
      },
    ): AsyncResult<T, E | PrismaQueryError> {
      const client = Prisma.getExtensionContext(this) as unknown as {
        $transaction: <R>(f: (tx: unknown) => Promise<R>, opts?: unknown) => Promise<R>;
      };
      return fromPromise(
        client.$transaction(async (tx) => {
          const result = await fn(tx as Omit<C, TxDenyList>);
          if (result.isOk()) return result.value;
          throw result.isErr()
            ? new Rollback(result.error, false)
            : new Rollback(result.cause, true);
        }, options),
        (cause, defect) =>
          cause instanceof Rollback
            ? cause.wasDefect
              ? defect(cause.carried)
              : (cause.carried as E | PrismaQueryError)
            : qualifyPrismaError(cause),
      );
    },
  },
});
