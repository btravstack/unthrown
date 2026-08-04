import { entityKind } from "drizzle-orm/entity";
import {
  PgRelationalQuery,
  type PgRelationalQueryHKTBase,
} from "drizzle-orm/pg-core/query-builders/query";
import type { PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import type { AsyncResult } from "unthrown";

import type { PgQueryError } from "../errors.js";
import { type ResultThen, settle } from "./awaitable.js";
import type { UnthrownPgPreparedQuery, UnthrownPgSession } from "./session.js";

/**
 * The higher-kinded type that makes `db.query.<table>.findMany()` build an
 * unthrown relational query rather than drizzle's own.
 *
 * @remarks
 * See {@link PgUnthrownSelectHKT} for why this is an `interface`.
 *
 * @category Builders
 */
// oxlint-disable-next-line consistent-type-definitions -- drizzle's HKT encoding reads the polymorphic `this` type, which a type alias cannot express.
export interface PgUnthrownRelationalQueryHKT extends PgRelationalQueryHKTBase {
  _type: PgUnthrownRelationalQuery<this["result"]>;
}

/**
 * A relational (`db.query.…`) query that resolves to an `AsyncResult`.
 *
 * @typeParam TResult - the shape the relational query builds; an array for
 * `findMany`, a single row or `undefined` for `findFirst`.
 *
 * @category Builders
 */
export class PgUnthrownRelationalQuery<TResult> extends PgRelationalQuery<
  PgUnthrownRelationalQueryHKT,
  TResult
> {
  static override readonly [entityKind]: string = "PgUnthrownRelationalQuery";

  /** See {@link PgUnthrownSelectBase}'s `session` for why this is redeclared. */
  declare protected session: UnthrownPgSession<unknown>;

  /** @internal */
  _prepare(
    name?: string,
    generateName = false,
  ): UnthrownPgPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
    const { query, builtQuery } = this._toSQL();
    const mapper = this.dialect.mapperGenerators.relationalRows({
      isFirst: this.mode === "first",
      parseJson: this.parseJson,
      parseJsonIfString: false,
      rootJsonMappers: false,
      selection: query.selection,
      arrayModeRoot: true,
    });
    return this.session.prepareQuery(builtQuery, "arrays", name ?? generateName, mapper);
  }

  /**
   * Create a prepared statement for this query. This allows the database to
   * remember this query for the given session and call it by name, rather than
   * specifying the full query.
   *
   * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
   */
  prepare(name: string): UnthrownPgPreparedQuery<PreparedQueryConfig & { execute: TResult }> {
    return this._prepare(name, true);
  }

  /** Run the relational query, resolving to its rows. */
  execute(placeholderValues?: Record<string, unknown>): AsyncResult<TResult, PgQueryError> {
    return this._prepare().execute(placeholderValues);
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<TResult> = (onFulfilled, onRejected) =>
    settle(this.execute()).then(onFulfilled, onRejected);
}
