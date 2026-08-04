import { entityKind } from "drizzle-orm/entity";
import { PgRefreshMaterializedView } from "drizzle-orm/pg-core/query-builders/refresh-materialized-view";
import type {
  PgQueryResultHKT,
  PgQueryResultKind,
  PreparedQueryConfig,
} from "drizzle-orm/pg-core/session";
import type { AsyncResult } from "unthrown";

import { type ResultThen, resultThen, runSafeQuery } from "./awaitable.js";
import type { UnthrownPgSafePreparedQuery, UnthrownPgSession } from "./session.js";

/**
 * A `refresh materialized view` statement that resolves to an `AsyncResult`.
 *
 * @category Builders
 */
export class PgUnthrownRefreshMaterializedView<
  TQueryResult extends PgQueryResultHKT,
> extends PgRefreshMaterializedView<TQueryResult> {
  static override readonly [entityKind]: string = "PgUnthrownRefreshMaterializedView";

  /** See {@link PgUnthrownSelectBase}'s `session` for why this is redeclared. */
  declare protected session: UnthrownPgSession<unknown>;

  /** @internal */
  _prepare(
    name?: string,
    generateName = false,
  ): UnthrownPgSafePreparedQuery<
    PreparedQueryConfig & { execute: PgQueryResultKind<TQueryResult, never> }
  > {
    // `toSQL()` is `dialect.sqlToQuery(this.getSQL())`; the `getSQL()` drizzle's
    // own `_prepare` calls is marked `@internal` and stripped from its `.d.ts`.
    //
    // `.asSafe()`: `prepare(name).execute()` is a third way to run this — it
    // belongs on the same defect-only boundary as `execute()` and `await`.
    return this.session
      .prepareQuery<PreparedQueryConfig & { execute: PgQueryResultKind<TQueryResult, never> }>(
        this.toSQL(),
        "raw",
        name ?? generateName,
      )
      .asSafe();
  }

  /**
   * Create a prepared statement for this query. This allows the database to
   * remember this query for the given session and call it by name, rather than
   * specifying the full query.
   *
   * Its `execute()` carries the same `never` error channel as this builder's —
   * see {@link UnthrownPgSafePreparedQuery}.
   *
   * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
   */
  prepare(
    name: string,
  ): UnthrownPgSafePreparedQuery<
    PreparedQueryConfig & { execute: PgQueryResultKind<TQueryResult, never> }
  > {
    return this._prepare(name, true);
  }

  /**
   * Run the refresh, resolving to the driver's result.
   *
   * The error channel is `never`, and here that is a *judgement*, not an
   * impossibility. A refresh **can** raise `23505` — it repopulates a heap, and
   * `REFRESH … CONCURRENTLY` (the inherited `.concurrently()`) requires a unique
   * index, so a view whose own query yields duplicates violates it.
   *
   * It is still a defect, by this package's "would you branch on it?" rule: a
   * materialized view whose query produces duplicates is a bug in the *view
   * definition*, which you log and 500 on — exactly what `match`'s `defect` arm
   * already does. Nobody writes a recovery path for it, and modelling it would
   * put an arm at every refresh call site duplicating that same defect arm.
   * Runtime and type agree either way; see {@link runSafeQuery}.
   */
  execute(
    placeholderValues?: Record<string, unknown>,
  ): AsyncResult<PgQueryResultKind<TQueryResult, never>, never> {
    return runSafeQuery(() => this._prepare(), placeholderValues);
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<PgQueryResultKind<TQueryResult, never>, never> = resultThen(this);
}
