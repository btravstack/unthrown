import { entityKind } from "drizzle-orm/entity";
import { type Logger, NoopLogger } from "drizzle-orm/logger";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres/session";
import type { PgDialect } from "drizzle-orm/pg-core/dialect";
import type { PgTransactionConfig, PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import { preparedStatementName } from "drizzle-orm/query-name-generator";
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";
import { type Query, sql } from "drizzle-orm/sql/sql";
import pg from "pg";
import {
  type AsyncResult,
  fromPromise,
  isErr,
  isOk,
  isResult,
  OkAsync,
  type Result,
} from "unthrown";

import { type PgQueryError, qualifyPgError } from "../errors.js";
import { PgUnthrownDatabase } from "../pg-core/db.js";
import type { PgQueryMode, PgRowMapper } from "../pg-core/session.js";
import { PgUnthrownPreparedQuery, PgUnthrownSession } from "../pg-core/session.js";

const { Pool } = pg;

/**
 * A node-postgres client this package can drive: a pool, a client checked out of
 * one, or a standalone client.
 *
 * @category Session
 */
export type NodePgClient = pg.Pool | pg.PoolClient | pg.Client;

/**
 * The one method the session needs from a client, and the only shape it relies
 * on.
 *
 * @remarks
 * `NodePgClient` is a union of three classes whose `query` is a stack of six
 * overloads each, which TypeScript cannot call through a union. Widening to the
 * single signature actually used is an assignment, not a cast — and it states
 * the driver contract this package depends on.
 */
type PgQueryable = {
  query: (
    config: {
      name?: string | undefined;
      text: string;
      rowMode?: "array" | undefined;
      types?: pg.CustomTypesConfig | undefined;
    },
    values: unknown[],
  ) => Promise<{ rows: unknown[] }>;
};

const noop = (value: unknown): unknown => value;

/**
 * The OIDs drizzle parses itself, and so wants from the driver verbatim.
 *
 * @remarks
 * The four temporal scalars, plus the array OIDs pg-types does not name
 * (`_numeric`, `_timestamp`, `_timestamptz`, `_interval`, `_date`). Drizzle's
 * column codecs do this parsing themselves, and a driver that had already turned
 * a `timestamptz` into a `Date` would have thrown the offset away. The list is
 * drizzle's own — scalar `numeric` is absent from it because pg already hands
 * that back as a string; only its array parser would have mapped the elements.
 */
const rawOids: ReadonlySet<number> = new Set([
  pg.types.builtins.TIMESTAMPTZ,
  pg.types.builtins.TIMESTAMP,
  pg.types.builtins.DATE,
  pg.types.builtins.INTERVAL,
  1231,
  1115,
  1185,
  1187,
  1182,
]);

const typeConfig: pg.CustomTypesConfig = {
  getTypeParser: (typeId, format) =>
    rawOids.has(typeId) ? noop : pg.types.getTypeParser(typeId, format),
};

/**
 * Is this client a pool, and so a thing to check a connection out of?
 *
 * @remarks
 * The `instanceof` is the direct answer; the constructor-name check catches a
 * pool from a *second copy* of `pg` in the tree (pg's own pool class is named
 * `BoundPool`), the same dual-copy hazard `isResult` guards against. A checked-out
 * client is a plain `Client` instance, so it does not match either arm.
 */
const isPool = (client: NodePgClient): client is pg.Pool =>
  client instanceof Pool || client.constructor.name.includes("Pool");

/** Runs one transaction control statement on the raw, still-rejecting path. */
type Control = (statement: string) => Promise<unknown>;

/**
 * Issue control statements through `PgUnthrownPreparedQuery.runUnqualified`.
 *
 * @remarks
 * Not `execute()`: an `AsyncResult` never rejects, so a failed `COMMIT` run
 * through it would resolve to an `Err` nobody reads — the transaction would
 * report success having committed nothing. The raw promise is what lets the
 * failure reach {@link NodePgUnthrownSession.transaction}'s single boundary.
 */
const controlOn =
  (session: PgUnthrownSession<unknown>, dialect: PgDialect): Control =>
  (statement) =>
    session.prepareQuery(dialect.sqlToQuery(sql.raw(statement)), "raw", false).runUnqualified();

/**
 * Render a transaction config as the SQL clauses that follow `begin` or
 * `set transaction`, or `undefined` when it asks for nothing at all.
 *
 * @remarks
 * `undefined` rather than `""` because the empty config is the case that has to
 * be *omitted*, not interpolated: `begin ` and `set transaction ` are both
 * syntax errors, so `db.transaction(fn, {})` used to defect on its own BEGIN.
 * Postgres' grammar requires at least one mode after `set transaction` as well,
 * which is why an empty config issues no statement there at all.
 */
const transactionConfigSQL = (config: PgTransactionConfig): string | undefined => {
  const chunks: string[] = [];
  if (config.isolationLevel !== undefined) chunks.push(`isolation level ${config.isolationLevel}`);
  if (config.accessMode !== undefined) chunks.push(config.accessMode);
  if (typeof config.deferrable === "boolean") {
    chunks.push(config.deferrable ? "deferrable" : "not deferrable");
  }
  return chunks.length === 0 ? undefined : chunks.join(" ");
};

/** `begin`, with a config's clauses appended only when it renders any. */
const beginStatement = (config: PgTransactionConfig | undefined): string => {
  const clauses = config === undefined ? undefined : transactionConfigSQL(config);
  return clauses === undefined ? "begin" : `begin ${clauses}`;
};

/**
 * Undo a scope that is already failing.
 *
 * @returns `undefined` when the undo succeeded — the failure in hand is
 * unchanged — or the error to raise when the undo *itself* failed: an
 * `AggregateError` pairing what was being undone with the undo's own failure.
 *
 * @remarks
 * A `ROLLBACK` that fails leaves the transaction's state unknown, which is a
 * bigger fact than the domain error it was discarding, so it takes over the
 * outcome (as a defect — no SQLSTATE a caller branches on describes "the undo
 * broke"). It must not *destroy* what it was undoing, though, which is what the
 * aggregate is for — the same rule core applies to a throwing failure observer.
 *
 * The pair is ordered `[thrown, original]` — the undo's own failure first, then
 * the failure it was undoing — which is core's convention for exactly this
 * situation (a failure observer that throws aggregates `[thrown, original]`).
 */
const undoScope = async (
  control: Control,
  statement: string,
  pending: unknown,
): Promise<AggregateError | undefined> => {
  try {
    await control(statement);
    return undefined;
  } catch (cause) {
    return new AggregateError([cause, pending], `${statement} failed`);
  }
};

/** The statements that open, keep and undo one transactional scope. */
type Scope = { readonly begin: string; readonly keep: string; readonly undo: string };

/**
 * Run one transactional scope — a transaction, or a savepoint inside one.
 *
 * @remarks
 * The rule, and the only one: **`Ok` keeps the scope, `Err` and `Defect` both
 * undo it.** An `Err` still re-surfaces typed, so nothing is lost — you simply
 * cannot commit a partial write by accident. Rollback *is* returning an `Err`,
 * which is why there is no `tx.rollback()`.
 *
 * The returned promise **rejects** when a control statement fails or the
 * callback throws; the caller qualifies it once, at its own boundary.
 */
const runScope = async <A, E, TTx>(
  control: Control,
  scope: Scope,
  tx: TTx,
  fn: (tx: TTx) => AsyncResult<A, E>,
  // oxlint-disable-next-line unthrown/prefer-async-result -- a REJECTING promise is the point: unthrown has no public way to mint a Defect, so every failure here is left to reject and is qualified once, at the caller's `fromPromise` boundary. An AsyncResult would have swallowed it into a channel nobody reads.
): Promise<Result<A, E>> => {
  await control(scope.begin);

  let inner: Result<A, E>;
  try {
    // Awaiting an AsyncResult never throws, so a throw here is the callback
    // failing before it ever produced one — unmodeled, hence a defect.
    inner = await fn(tx);
  } catch (cause) {
    throw (await undoScope(control, scope.undo, cause)) ?? cause;
  }

  // `isResult` first, and not merely for tidiness: `isOk`/`isErr` read `.tag`,
  // which THROWS on `null`/`undefined` — the shape a JS (or `as`-cast) caller
  // produces by writing `async (tx) => { await tx.insert(…) }` and forgetting
  // the `return`. That TypeError was raised before any ROLLBACK was issued, so
  // the pooled client went back to the pool with BEGIN still open and the next
  // borrower ran inside a stale transaction. Anything that is not a `Result`
  // now takes the undo path and surfaces as a `Defect`, which is core's own
  // out-of-contract rule.
  if (isResult(inner) && isOk(inner)) {
    // A failed keep rejects and is qualified at the boundary — which is how a
    // DEFERRABLE constraint's 23505, raised by the COMMIT itself, still reaches
    // the modeled error channel.
    await control(scope.keep);
    return inner;
  }

  const pending = isResult(inner) ? (isErr(inner) ? inner.error : inner.cause) : inner;
  const raised = await undoScope(control, scope.undo, pending);
  if (raised !== undefined) throw raised;
  // A non-`Result` is out of contract: the scope is undone, and returning it
  // hands it to `transaction`'s `flatMap`, whose non-`Result` guard mints the
  // TypeError defect. One rule, one place.
  return inner;
};

/**
 * A node-postgres session whose every query resolves to an `AsyncResult`.
 *
 * @remarks
 * The unthrown sibling of drizzle's `NodePgSession`. Everything above it is type
 * plumbing; this is where a real driver is spoken to.
 *
 * @typeParam TRelations - the relational schema backing `db.query`.
 *
 * @category Session
 */
export class NodePgUnthrownSession<
  TRelations extends AnyRelations = EmptyRelations,
> extends PgUnthrownSession<NodePgUnthrownTransaction<TRelations>> {
  static override readonly [entityKind]: string = "NodePgUnthrownSession";

  /**
   * @param client - the pool or client to run statements against. A pool has a
   * connection checked out for the duration of a {@link transaction} and
   * released afterwards; a plain client is used as-is.
   * @param dialect - drizzle's Postgres dialect, which compiles the SQL.
   * @param relations - the relational schema, forwarded to every transaction.
   * @param logger - drizzle's query logger.
   */
  constructor(
    private readonly client: NodePgClient,
    dialect: PgDialect,
    private readonly relations: TRelations,
    private readonly logger: Logger = new NoopLogger(),
  ) {
    super(dialect);
  }

  override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: Query,
    mode: PgQueryMode,
    name: string | boolean,
    mapper?: PgRowMapper,
  ): PgUnthrownPreparedQuery<T> {
    const queryName =
      typeof name === "string"
        ? name
        : name === true
          ? preparedStatementName(query.sql, query.params)
          : undefined;

    // Widening, not a cast — see {@link PgQueryable}.
    const queryable: PgQueryable = this.client;

    const executor = (params: unknown[]): Promise<unknown> =>
      queryable
        .query(
          {
            name: queryName,
            rowMode: mode === "arrays" ? "array" : undefined,
            text: query.sql,
            types: typeConfig,
          },
          params,
        )
        // `raw` is what a write without `.returning()` asks for: the driver's own
        // result object, whose `rowCount` is the answer.
        .then((result) => (mode === "raw" ? result : result.rows));

    return new PgUnthrownPreparedQuery<T>(executor, query, mapper, mode, this.logger);
  }

  /**
   * Run `fn` inside a database transaction.
   *
   * @remarks
   * **`Ok` commits; `Err` and `Defect` both roll back.** An `Err` re-surfaces
   * typed in the error channel, so rolling back costs no information — and
   * because rollback *is* returning an `Err`, there is no `tx.rollback()`.
   *
   * {@link PgQueryError} joins the callback's own error channel because the
   * transaction's control statements can fail on their own account: a
   * `DEFERRABLE` constraint is checked at `COMMIT`, so a unique violation can
   * be raised by the commit rather than by any statement the callback ran.
   *
   * The whole sequence is qualified **once**, here, and nothing inside it is
   * left to a channel that could swallow it: the control statements run on the
   * raw rejecting path (see `PgUnthrownPreparedQuery.runUnqualified`), so
   * a failed `COMMIT` can never be mistaken for a successful one.
   *
   * The callback owes an `AsyncResult`, so each step ends in `.execute()` — a
   * builder is a thenable that resolves to a `Result`, not an `AsyncResult`
   * itself — and the steps compose with `flatMap`.
   *
   * @example
   * ```ts
   * const moved = await db.transaction((tx) =>
   *   tx
   *     .update(accounts)
   *     .set({ balance: sql`${accounts.balance} - 100` })
   *     .where(eq(accounts.id, from))
   *     .execute()
   *     .flatMap(() =>
   *       tx
   *         .update(accounts)
   *         .set({ balance: sql`${accounts.balance} + 100` })
   *         .where(eq(accounts.id, to))
   *         .execute(),
   *     ),
   * );
   * ```
   */
  override transaction<A, E>(
    fn: (tx: NodePgUnthrownTransaction<TRelations>) => AsyncResult<A, E>,
    config?: PgTransactionConfig,
  ): AsyncResult<A, E | PgQueryError> {
    // Qualify once, at the boundary; then flatten the callback's own Result.
    // `flatMap`'s callback is synchronous and returns a Result, so a Defect from
    // either layer passes through untouched.
    return fromPromise(() => this.#runTransaction(fn, config), qualifyPgError).flatMap(
      (inner) => inner,
    );
  }

  /**
   * The transaction as a promise that may reject — the shape
   * {@link transaction} qualifies.
   *
   * @remarks
   * Written this way because a defect has no public constructor: the only way to
   * mint one is to let a failure reach a `qualify` boundary, so every failure
   * here is left to reject and triaged once, above.
   */
  async #runTransaction<A, E>(
    fn: (tx: NodePgUnthrownTransaction<TRelations>) => AsyncResult<A, E>,
    config: PgTransactionConfig | undefined,
    // oxlint-disable-next-line unthrown/prefer-async-result -- see `runScope`: this promise must stay able to reject, so `transaction` can qualify the whole sequence exactly once.
  ): Promise<Result<A, E>> {
    // Checked out before the `try`, so a pool that cannot hand out a client
    // leaves nothing to release; everything after it is released whatever
    // happens, a rejecting control statement included.
    const pooled = isPool(this.client) ? await this.client.connect() : undefined;
    try {
      const session =
        pooled === undefined
          ? this
          : new NodePgUnthrownSession(pooled, this.dialect, this.relations, this.logger);
      const tx = new NodePgUnthrownTransaction(this.dialect, session, this.relations);

      return await runScope(
        controlOn(session, this.dialect),
        {
          begin: beginStatement(config),
          keep: "commit",
          undo: "rollback",
        },
        tx,
        fn,
      );
    } finally {
      pooled?.release();
    }
  }
}

/**
 * The handle a {@link NodePgUnthrownSession.transaction} callback receives: a
 * database whose statements all run inside the open transaction.
 *
 * @remarks
 * There is deliberately **no `rollback()`**. Drizzle needs one because its
 * rollback signal is a throw; here the signal is an `Err`, and a second spelling
 * of one concept is exactly what this library does not do. Return an `Err` —
 * from a failed query or one of your own — and the transaction rolls back with
 * that error still in hand.
 *
 * @typeParam TRelations - the relational schema backing `tx.query`.
 *
 * @category Session
 */
export class NodePgUnthrownTransaction<
  TRelations extends AnyRelations = EmptyRelations,
> extends PgUnthrownDatabase<NodePgQueryResultHKT, TRelations> {
  static override readonly [entityKind]: string = "NodePgUnthrownTransaction";

  /**
   * @param savepoints - the savepoint-name counter, **shared by every handle
   * descended from one transaction** (see {@link transaction}). Defaults to a
   * fresh one, which is what a root transaction wants.
   */
  constructor(
    dialect: PgDialect,
    session: PgUnthrownSession<unknown>,
    relations: TRelations,
    private readonly savepoints: { count: number } = { count: 0 },
    private readonly parseRqbJson = false,
  ) {
    super(dialect, session, relations, parseRqbJson);
  }

  /**
   * Set the characteristics of the transaction already in progress.
   *
   * @remarks
   * A config that asks for nothing (`{}`) issues no statement: Postgres requires
   * at least one mode after `set transaction`, so the alternative is a syntax
   * error reported as a defect for a call that requested no change.
   *
   * @example
   * ```ts
   * await tx.setTransaction({ isolationLevel: "serializable" });
   * ```
   */
  setTransaction(config: PgTransactionConfig): AsyncResult<unknown, PgQueryError> {
    const clauses = transactionConfigSQL(config);
    if (clauses === undefined) return OkAsync(undefined);
    return this.session.execute(sql.raw(`set transaction ${clauses}`));
  }

  /**
   * Run `fn` inside a nested transaction — a savepoint of the enclosing one.
   *
   * @remarks
   * The same rule one level down: `Ok` releases the savepoint, `Err` and
   * `Defect` roll back to it. Only the nested scope is undone, so the enclosing
   * transaction stays open and decides for itself — recover the inner `Err` and
   * the outer scope still commits.
   *
   * Savepoint names come from a counter **shared by every handle descended from
   * one transaction**, so no two live savepoints on that connection can share a
   * name. Naming them by nesting depth (drizzle's scheme) is safe only while
   * nested transactions are started one after another; two started concurrently
   * — which `allAsync` makes an easy thing to write — would both be `sp1` on the
   * one connection, and the first `rollback to savepoint sp1` would unwind the
   * other's work.
   *
   * @example
   * ```ts
   * const result = await db.transaction((tx) =>
   *   tx
   *     .transaction((nested) => nested.insert(logs).values({ message: "optional" }).execute())
   *     // The savepoint rolled back; the outer transaction carries on. Every
   *     // case is named, so the grouped arm lists the whole PgQueryError union.
   *     .recoverErrCases((m) =>
   *       m.with(
   *         P.tag("UniqueConstraintViolation"),
   *         P.tag("ForeignKeyViolation"),
   *         P.tag("CheckViolation"),
   *         P.tag("ExclusionViolation"),
   *         P.tag("NotNullViolation"),
   *         () => undefined,
   *       ),
   *     )
   *     .flatMap(() => tx.insert(users).values({ id: 1, name: "ada" }).execute()),
   * );
   * ```
   */
  transaction<A, E>(
    fn: (tx: NodePgUnthrownTransaction<TRelations>) => AsyncResult<A, E>,
  ): AsyncResult<A, E | PgQueryError> {
    return fromPromise(() => this.#runSavepoint(fn), qualifyPgError).flatMap((inner) => inner);
  }

  /** The savepoint as a promise that may reject — see `#runTransaction`. */
  async #runSavepoint<A, E>(
    fn: (tx: NodePgUnthrownTransaction<TRelations>) => AsyncResult<A, E>,
    // oxlint-disable-next-line unthrown/prefer-async-result -- see `runScope`: this promise must stay able to reject, so `transaction` can qualify the whole sequence exactly once.
  ): Promise<Result<A, E>> {
    // Claimed before anything is issued, so two concurrent nested transactions
    // cannot both take the same number.
    this.savepoints.count += 1;
    const name = `sp${this.savepoints.count}`;
    const tx = new NodePgUnthrownTransaction(
      this.dialect,
      this.session,
      this._.relations,
      // The same counter, so a savepoint nested inside this one is numbered
      // against every other live savepoint on the connection, not just its
      // siblings.
      this.savepoints,
      this.parseRqbJson,
    );

    return await runScope(
      controlOn(this.session, this.dialect),
      {
        begin: `savepoint ${name}`,
        keep: `release savepoint ${name}`,
        undo: `rollback to savepoint ${name}`,
      },
      tx,
      fn,
    );
  }
}
