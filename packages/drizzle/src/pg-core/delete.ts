import { entityKind } from "drizzle-orm/entity";
import { PgDeleteBase, type PgDeleteHKTBase } from "drizzle-orm/pg-core/query-builders/delete";
import type {
  PgQueryResultHKT,
  PgQueryResultKind,
  PreparedQueryConfig,
} from "drizzle-orm/pg-core/session";
import type { PgTable } from "drizzle-orm/pg-core/table";
import { extractUsedTable } from "drizzle-orm/pg-core/utils";
import type { ColumnsSelection } from "drizzle-orm/sql/sql";
import type { Assume } from "drizzle-orm/utils";
import type { AsyncResult } from "unthrown";

import type { PgQueryError } from "../errors.js";
import { type ResultThen, resultThen, runQuery } from "./awaitable.js";
import type { UnthrownPgPreparedQuery, UnthrownPgSession } from "./session.js";

/**
 * What a `delete` resolves to: the driver's own result object, or the returned
 * rows once `.returning()` has been called.
 */
export type DeleteResult<
  TQueryResult extends PgQueryResultHKT,
  TReturning,
> = TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];

/**
 * The higher-kinded type that keeps every chained `delete` method returning an
 * unthrown builder rather than drizzle's own.
 *
 * @remarks
 * See {@link PgUnthrownSelectHKT} for why this is an `interface`.
 *
 * @category Builders
 */
// oxlint-disable-next-line consistent-type-definitions -- drizzle's HKT encoding reads the polymorphic `this` type, which a type alias cannot express.
export interface PgUnthrownDeleteHKT extends PgDeleteHKTBase {
  _type: PgUnthrownDeleteBase<
    Assume<this["table"], PgTable>,
    Assume<this["queryResult"], PgQueryResultHKT>,
    Assume<this["selectedFields"], ColumnsSelection | undefined>,
    Assume<this["returning"], Record<string, unknown> | undefined>,
    this["dynamic"],
    this["excludedMethods"]
  >;
}

/**
 * A `delete` query that resolves to an `AsyncResult`.
 *
 * @remarks
 * Deleting a row another table still references raises a
 * {@link ForeignKeyViolation}, which lands in the error channel rather than as a
 * rejection.
 *
 * @category Builders
 */
export class PgUnthrownDeleteBase<
  TTable extends PgTable,
  TQueryResult extends PgQueryResultHKT,
  TSelectedFields extends ColumnsSelection | undefined = undefined,
  TReturning extends Record<string, unknown> | undefined = undefined,
  TDynamic extends boolean = false,
  TExcludedMethods extends string = never,
> extends PgDeleteBase<
  PgUnthrownDeleteHKT,
  TTable,
  TQueryResult,
  TSelectedFields,
  TReturning,
  TDynamic,
  TExcludedMethods
> {
  static override readonly [entityKind]: string = "PgUnthrownDelete";

  /** See {@link PgUnthrownSelectBase}'s `session` for why this is redeclared. */
  declare protected session: UnthrownPgSession<unknown>;

  /** @internal */
  _prepare(
    name?: string,
    generateName = false,
  ): UnthrownPgPreparedQuery<
    PreparedQueryConfig & { execute: DeleteResult<TQueryResult, TReturning> }
  > {
    const { session, config, dialect } = this;
    const { returning: fields } = config;
    const query = dialect.sqlToQuery(this.getSQL());
    const mapper =
      fields === undefined ? undefined : this.dialect.mapperGenerators.rows(fields, undefined);
    return session.prepareQuery(query, fields ? "arrays" : "raw", name ?? generateName, mapper, {
      type: "delete",
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
    PreparedQueryConfig & { execute: DeleteResult<TQueryResult, TReturning> }
  > {
    return this._prepare(name, true);
  }

  /** Run the delete, resolving to its result or a {@link PgQueryError}. */
  execute(
    placeholderValues?: Record<string, unknown>,
  ): AsyncResult<DeleteResult<TQueryResult, TReturning>, PgQueryError> {
    return runQuery(() => this._prepare(), placeholderValues);
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<DeleteResult<TQueryResult, TReturning>> = resultThen(this);
}
