import type { WithCacheConfig } from "drizzle-orm/cache/core/types";
import { entityKind } from "drizzle-orm/entity";
import type { Logger } from "drizzle-orm/logger";
import {
  PgBasePreparedQuery,
  type PgTransactionConfig,
  PgSession,
  type PreparedQueryConfig,
} from "drizzle-orm/pg-core/session";
import { fillPlaceholders, type Query, type SQL } from "drizzle-orm/sql/sql";
import { type AsyncResult, fromPromise, fromSafePromise } from "unthrown";

import { type PgQueryError, qualifyPgError } from "../errors.js";
import { runQuery } from "./awaitable.js";

/**
 * The row shapes a prepared query can be asked to produce.
 *
 * @category Session
 */
export type PgQueryMode = "arrays" | "objects" | "raw";

/**
 * A row mapper, as handed over by a drizzle query builder.
 *
 * @remarks
 * The parameter is `never[]` — the bottom array type — deliberately. The
 * session never inspects rows: it forwards whatever the driver produced to the
 * mapper the builder supplied, and each builder asks for a different row shape
 * (`unknown[][]` for a column-array select, `unknown[][] | Record<string,
 * unknown>[]` for a relational query). Under `strictFunctionTypes` a parameter
 * is checked contravariantly, so `never[]` is the one parameter type every such
 * mapper is assignable to. Spelling it `any[]` would accept exactly the same
 * set while giving up type-checking inside every mapper that reads it.
 *
 * @category Session
 */
export type PgRowMapper = (rows: never[]) => unknown;

/**
 * A prepared query whose execution yields an `AsyncResult`.
 *
 * @remarks
 * This is the single place in the package where a driver rejection is triaged.
 * Everything above it — the builder tree, the database facade — is type
 * plumbing; the container swap happens here, and only here, because drizzle
 * declares `PgBasePreparedQuery.execute()` as returning `unknown`.
 *
 * Every failure leaves {@link execute} as either a modeled {@link PgQueryError}
 * or a defect, so the returned `AsyncResult`'s internal promise never rejects
 * and awaiting it never throws.
 *
 * @typeParam T - drizzle's per-query config, whose `execute` member is the value
 * the query resolves to.
 *
 * @category Session
 */
export class UnthrownPgPreparedQuery<
  T extends PreparedQueryConfig = PreparedQueryConfig,
> extends PgBasePreparedQuery {
  static override readonly [entityKind]: string = "UnthrownPgPreparedQuery";

  /**
   * @param executor - runs the query against the driver with the given bound
   * parameters. Its rejection is what {@link execute} triages.
   * @param query - the compiled SQL and its parameter list.
   * @param mapper - maps the driver's rows to the query's declared result, or
   * `undefined` to pass the driver's value through untouched.
   * @param mode - the row shape the driver was asked for.
   * @param logger - drizzle's query logger.
   */
  constructor(
    private readonly executor: (params: unknown[]) => Promise<unknown>,
    query: Query,
    private readonly mapper: PgRowMapper | undefined,
    readonly mode: PgQueryMode,
    private readonly logger: Logger,
  ) {
    super(query);
  }

  /**
   * Run the query and return the raw, **still-rejecting** promise.
   *
   * @remarks
   * {@link execute} deliberately never rejects, which is right for a query — and
   * a trap for a transaction control statement. A `COMMIT` issued through
   * `execute` would resolve to an `Err` nobody reads, and the caller would
   * believe the transaction committed when it did not.
   *
   * So the transaction driver issues `begin` / `commit` / `rollback` through
   * this method instead, letting the rejection propagate and qualifying the
   * whole sequence exactly once at its own boundary.
   *
   * @internal
   */
  runUnqualified(placeholderValues: Record<string, unknown> = {}): Promise<T["execute"]> {
    const { mapper, query } = this;
    const params = fillPlaceholders(query.params, placeholderValues);
    this.logger.logQuery(query.sql, params);

    const rows = this.executor(params);
    // The `unknown` execution container is drizzle's own seam: the driver hands
    // back untyped rows and `T["execute"]` is the shape the builder that created
    // this query promised. Narrowing it is the assertion drizzle's async and
    // effect sessions each make in the same spot. The `never[]` argument is the
    // other half of that seam — see {@link PgRowMapper}: only the builder that
    // supplied the mapper knows which row shape it asked the driver for.
    return (
      mapper === undefined ? rows : rows.then((value) => mapper(value as never[]))
    ) as Promise<T["execute"]>;
  }

  /**
   * Run the query, triaging any driver failure into the error or defect channel.
   *
   * @remarks
   * The promise is started from a thunk so that a synchronous throw — a missing
   * placeholder value, a driver that validates its arguments eagerly — is caught
   * by the same boundary as a rejection. `execute` therefore neither throws nor
   * rejects: awaiting it always yields a `Result`.
   *
   * @param placeholderValues - values for the query's named placeholders.
   */
  override execute(
    placeholderValues: Record<string, unknown> = {},
  ): AsyncResult<T["execute"], PgQueryError> {
    return fromPromise(() => this.runUnqualified(placeholderValues), qualifyPgError);
  }

  /**
   * The same prepared query, with **every** failure routed to the defect
   * channel.
   *
   * @remarks
   * What a read builder's `prepare(name)` hands back. Reads declare `E = never`,
   * and `prepare()` is a third route to running one — alongside `execute()` and
   * `await` — so it has to reach the same boundary or the claim is false for a
   * prepared read. See {@link UnthrownPgSafePreparedQuery}.
   *
   * A fresh instance rather than a flag, so the failure boundary is fixed at
   * construction and cannot be flipped on a live query.
   *
   * @internal
   */
  asSafe(): UnthrownPgSafePreparedQuery<T> {
    return new UnthrownPgSafePreparedQuery<T>(
      this.executor,
      this.query,
      this.mapper,
      this.mode,
      this.logger,
    );
  }
}

/**
 * A prepared query whose every failure is a defect — the read builders' half of
 * {@link UnthrownPgPreparedQuery}.
 *
 * @remarks
 * A read has no modeled failure (see `runSafeQuery`), so the four read
 * builders declare `E = never`. Their `prepare(name)` returns one of these, so
 * running a *prepared* read reaches the same `fromSafePromise` boundary that
 * `execute()` and `await` do — all three routes agree, and none of them can put
 * a value in a channel the type calls empty.
 *
 * This is a subclass rather than a type parameter on
 * {@link UnthrownPgPreparedQuery} deliberately. A parameterised `E` would have
 * to pick its boundary from a constructor-injected function, and the injected
 * default (`fromPromise` + `qualifyPgError`, typed `PgQueryError`) is not
 * assignable to an unresolved `E` — so the single-class form needs a cast
 * exactly where the type and the runtime must not be allowed to drift apart.
 * Overriding `execute` needs none: `AsyncResult` is covariant in `E`, so
 * `AsyncResult<T, never>` already satisfies the base's declaration, and the
 * narrower type is reachable *only* through this class, whose `execute` is the
 * safe one. The weld is by construction.
 *
 * @typeParam T - drizzle's per-query config, whose `execute` member is the value
 * the query resolves to.
 *
 * @category Session
 */
export class UnthrownPgSafePreparedQuery<
  T extends PreparedQueryConfig = PreparedQueryConfig,
> extends UnthrownPgPreparedQuery<T> {
  static override readonly [entityKind]: string = "UnthrownPgSafePreparedQuery";

  /**
   * Run the query. Every failure — a constraint violation raised by a volatile
   * function the read called included — is a `Defect`; the error channel is
   * `never`.
   *
   * @param placeholderValues - values for the query's named placeholders.
   */
  override execute(
    placeholderValues: Record<string, unknown> = {},
  ): AsyncResult<T["execute"], never> {
    return fromSafePromise(() => this.runUnqualified(placeholderValues));
  }
}

/**
 * The session every unthrown Postgres driver implements.
 *
 * @remarks
 * The mirror of drizzle's own `PgAsyncSession` / `PgEffectSession`: `PgSession`
 * declares `execute` / `arrays` / `objects` as returning `unknown`, which is
 * precisely the seam that lets a fourth execution container — `AsyncResult` —
 * be plugged in alongside promises and Effects.
 *
 * @typeParam TTransaction - the transaction handle passed to a
 * {@link UnthrownPgSession.transaction} callback. It is a parameter rather than
 * a concrete type because the transaction class is built on top of the database
 * facade, which in turn is built on this session; the driver that owns both
 * supplies it.
 *
 * @category Session
 */
export abstract class UnthrownPgSession<TTransaction> extends PgSession {
  static override readonly [entityKind]: string = "UnthrownPgSession";

  abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: Query,
    mode: PgQueryMode,
    name: string | boolean,
    mapper?: PgRowMapper,
    queryMetadata?: { type: "select" | "update" | "delete" | "insert"; tables: string[] },
    cacheConfig?: WithCacheConfig,
  ): UnthrownPgPreparedQuery<T>;

  /**
   * Run `fn` inside a database transaction.
   *
   * @remarks
   * An `Err` from `fn` rolls back and re-surfaces typed; a defect rolls back and
   * stays a defect. The transaction's own control statements can fail too, so
   * {@link PgQueryError} joins the callback's error channel.
   */
  abstract transaction<A, E>(
    fn: (tx: TTransaction) => AsyncResult<A, E>,
    config?: PgTransactionConfig,
  ): AsyncResult<A, E | PgQueryError>;

  /**
   * Run a raw `SQL` fragment, returning the driver's own result object.
   *
   * @remarks
   * Compilation runs **inside** the failure boundary — see `runQuery`.
   * `dialect.sqlToQuery` throws for mistakes that are type-legal and reachable,
   * and a throw escaping here would land on a caller who has no `try`/`catch`,
   * because this method's contract is a `Result`.
   */
  override execute(query: SQL): AsyncResult<unknown, PgQueryError> {
    return runQuery(() => this.prepareQuery(this.dialect.sqlToQuery(query), "raw", false));
  }

  /** Run a raw `SQL` fragment, returning each row as an array of column values. */
  override arrays(query: SQL): AsyncResult<unknown, PgQueryError> {
    return runQuery(() => this.prepareQuery(this.dialect.sqlToQuery(query), "arrays", false));
  }

  /** Run a raw `SQL` fragment, returning each row as a column-keyed object. */
  override objects(query: SQL): AsyncResult<unknown, PgQueryError> {
    return runQuery(() => this.prepareQuery(this.dialect.sqlToQuery(query), "objects", false));
  }
}
