import { entityKind } from "drizzle-orm/entity";
import { PgRefreshMaterializedView } from "drizzle-orm/pg-core/query-builders/refresh-materialized-view";
import type {
  PgQueryResultHKT,
  PgQueryResultKind,
  PreparedQueryConfig,
} from "drizzle-orm/pg-core/session";
import type { AsyncResult } from "unthrown";

import { type ResultThen, resultThen, runSafeQuery } from "./awaitable.js";
import type { UnthrownPgPreparedQuery, UnthrownPgSession } from "./session.js";

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
  ): UnthrownPgPreparedQuery<
    PreparedQueryConfig & { execute: PgQueryResultKind<TQueryResult, never> }
  > {
    // `toSQL()` is `dialect.sqlToQuery(this.getSQL())`; the `getSQL()` drizzle's
    // own `_prepare` calls is marked `@internal` and stripped from its `.d.ts`.
    return this.session.prepareQuery(this.toSQL(), "raw", name ?? generateName);
  }

  /**
   * Create a prepared statement for this query. This allows the database to
   * remember this query for the given session and call it by name, rather than
   * specifying the full query.
   *
   * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
   */
  prepare(
    name: string,
  ): UnthrownPgPreparedQuery<
    PreparedQueryConfig & { execute: PgQueryResultKind<TQueryResult, never> }
  > {
    return this._prepare(name, true);
  }

  /**
   * Run the refresh, resolving to the driver's result.
   *
   * The error channel is `never` — a refresh rebuilds a view's stored rows from
   * a query, so it raises no integrity-constraint violation of its own; every
   * failure it can hit is a defect. See {@link runSafeQuery}.
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
