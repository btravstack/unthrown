import { entityKind } from "drizzle-orm/entity";
import { PgInsertBase, type PgInsertHKTBase } from "drizzle-orm/pg-core/query-builders/insert";
import type {
  PgQueryResultHKT,
  PgQueryResultKind,
  PreparedQueryConfig,
} from "drizzle-orm/pg-core/session";
import type { PgTable } from "drizzle-orm/pg-core/table";
import { extractUsedTable } from "drizzle-orm/pg-core/utils";
import type { Assume } from "drizzle-orm/utils";
import type { AsyncResult } from "unthrown";

import type { PgQueryError } from "../errors.js";
import { type ResultThen, resultThen, runQuery } from "./awaitable.js";
import type { UnthrownPgPreparedQuery, UnthrownPgSession } from "./session.js";

/**
 * What an `insert` resolves to: the driver's own result object, or the returned
 * rows once `.returning()` has been called.
 */
type InsertResult<TQueryResult extends PgQueryResultHKT, TReturning> = TReturning extends undefined
  ? PgQueryResultKind<TQueryResult, never>
  : TReturning[];

/**
 * The higher-kinded type that keeps every chained `insert` method returning an
 * unthrown builder rather than drizzle's own.
 *
 * @remarks
 * See {@link PgUnthrownSelectHKT} for why this is an `interface`.
 *
 * @category Builders
 */
// oxlint-disable-next-line consistent-type-definitions -- drizzle's HKT encoding reads the polymorphic `this` type, which a type alias cannot express.
export interface PgUnthrownInsertHKT extends PgInsertHKTBase {
  _type: PgUnthrownInsertBase<
    Assume<this["table"], PgTable>,
    Assume<this["queryResult"], PgQueryResultHKT>,
    this["selectedFields"],
    this["returning"],
    this["dynamic"],
    this["excludedMethods"]
  >;
}

/**
 * An `insert` query that resolves to an `AsyncResult`.
 *
 * @remarks
 * This is where the package earns its keep: a unique index, a foreign key or a
 * `NOT NULL` column turns a write into a modeled {@link PgQueryError} instead of
 * a rejection, so the caller branches on it exhaustively.
 *
 * @category Builders
 */
export class PgUnthrownInsertBase<
  TTable extends PgTable,
  TQueryResult extends PgQueryResultHKT,
  TSelectedFields = undefined,
  TReturning = undefined,
  TDynamic extends boolean = false,
  TExcludedMethods extends string = never,
> extends PgInsertBase<
  PgUnthrownInsertHKT,
  TTable,
  TQueryResult,
  TSelectedFields,
  TReturning,
  TDynamic,
  TExcludedMethods
> {
  static override readonly [entityKind]: string = "PgUnthrownInsert";

  /** See {@link PgUnthrownSelectBase}'s `session` for why this is redeclared. */
  declare protected session: UnthrownPgSession<unknown>;

  /** @internal */
  _prepare(
    name?: string,
    generateName = false,
  ): UnthrownPgPreparedQuery<
    PreparedQueryConfig & { execute: InsertResult<TQueryResult, TReturning> }
  > {
    const { session, config, dialect } = this;
    const { returning: fields } = config;
    const query = dialect.sqlToQuery(this.getSQL());
    const mapper =
      fields === undefined ? undefined : this.dialect.mapperGenerators.rows(fields, undefined);
    return session.prepareQuery(query, fields ? "arrays" : "raw", name ?? generateName, mapper, {
      type: "insert",
      tables: [...extractUsedTable(config.table)],
    });
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
    PreparedQueryConfig & { execute: InsertResult<TQueryResult, TReturning> }
  > {
    return this._prepare(name, true);
  }

  /** Run the insert, resolving to its result or a {@link PgQueryError}. */
  execute(
    placeholderValues?: Record<string, unknown>,
  ): AsyncResult<InsertResult<TQueryResult, TReturning>, PgQueryError> {
    return runQuery(() => this._prepare(), placeholderValues);
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<InsertResult<TQueryResult, TReturning>> = resultThen(this);
}
