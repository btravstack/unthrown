import { entityKind } from "drizzle-orm/entity";
import { PgSelectBase, type PgSelectBuilder } from "drizzle-orm/pg-core/query-builders/select";
import type {
  PgSelectHKTBase,
  SelectedFields,
} from "drizzle-orm/pg-core/query-builders/select.types";
import type { PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import type {
  BuildSubquerySelection,
  JoinNullability,
  SelectMode,
  SelectResult,
} from "drizzle-orm/query-builders/select.types";
import type { ColumnsSelection } from "drizzle-orm/sql/sql";
import type { Assume } from "drizzle-orm/utils";
import type { AsyncResult } from "unthrown";

import { type ResultThen, resultThen, runSafeQuery } from "./awaitable.js";
import type { PgUnthrownSafePreparedQuery, PgUnthrownSession } from "./session.js";

/**
 * The higher-kinded type that keeps every chained `select` method returning an
 * unthrown builder rather than drizzle's own.
 *
 * @remarks
 * Drizzle's base builders are container-agnostic: `.where()`, `.limit()` and the
 * joins all rebuild `this` through `PgSelectKind<THKT, …>`, and the tree the
 * query stays in is decided by this one type. It must be an `interface` — the
 * pattern reads `this["tableName"]` and the polymorphic `this` type only exists
 * inside an interface or class declaration.
 *
 * @category Builders
 */
// oxlint-disable-next-line consistent-type-definitions -- drizzle's HKT encoding reads the polymorphic `this` type, which a type alias cannot express.
export interface PgUnthrownSelectHKT extends PgSelectHKTBase {
  _type: PgUnthrownSelectBase<
    this["tableName"],
    Assume<this["selection"], ColumnsSelection>,
    this["selectMode"],
    Assume<this["nullabilityMap"], Record<string, JoinNullability>>,
    this["dynamic"],
    this["excludedMethods"],
    Assume<this["result"], unknown[]>,
    Assume<this["selectedFields"], ColumnsSelection>
  >;
}

/**
 * The builder `db.select()` returns, before a table has been chosen.
 *
 * @category Builders
 */
export type PgUnthrownSelectBuilder<TSelection extends SelectedFields | undefined> =
  PgSelectBuilder<TSelection, PgUnthrownSelectHKT>;

/**
 * A `select` query that resolves to an `AsyncResult`.
 *
 * @remarks
 * Every chaining method comes from drizzle's `PgSelectBase`; this subclass adds
 * only the execution half — `_prepare`, `prepare`, `execute` — plus the `then`
 * that makes `await db.select().from(users)` yield a `Result`.
 *
 * The error channel is **`never`**: a read has no modeled failure. A `SELECT`
 * writes nothing, so it cannot violate an integrity constraint; a database that
 * will not answer is an infrastructure failure, which is a defect. That is
 * enforced at runtime as well as declared — see `runSafeQuery`.
 *
 * @category Builders
 */
export class PgUnthrownSelectBase<
  TTableName extends string | undefined,
  TSelection extends ColumnsSelection | undefined,
  TSelectMode extends SelectMode,
  TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string
    ? Record<TTableName, "not-null">
    : Record<string, never>,
  TDynamic extends boolean = false,
  TExcludedMethods extends string = never,
  TResult extends unknown[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
  TSelectedFields extends ColumnsSelection = BuildSubquerySelection<
    Assume<TSelection, ColumnsSelection>,
    TNullabilityMap
  >,
> extends PgSelectBase<
  PgUnthrownSelectHKT,
  TTableName,
  TSelection,
  TSelectMode,
  TNullabilityMap,
  TDynamic,
  TExcludedMethods,
  TResult,
  TSelectedFields
> {
  static override readonly [entityKind]: string = "PgUnthrownSelect";

  /**
   * Narrower than the base's `PgSession | undefined`: this builder is only ever
   * constructed by {@link PgUnthrownDatabase}, which owns an unthrown session.
   * `declare` because the base constructor already assigns it.
   */
  declare protected session: PgUnthrownSession<unknown>;

  /** @internal */
  _prepare(
    name?: string,
    generateName = false,
  ): PgUnthrownSafePreparedQuery<PreparedQueryConfig & { execute: TResult }> {
    const { session, dialect, cacheConfig, usedTables } = this;
    const query = this.config.tagged
      ? dialect._sqlToQuery(this.getSQL())
      : dialect.sqlToQuery(this.getSQL());
    // `getSQL()` — called just above to build `query` — is what populates
    // `config.fieldsFlat`, so it is set by the time we read it; that ordering is
    // the same one drizzle's own `_prepare` relies on. `?? []` keeps the type
    // honest without a non-null assertion.
    const fieldsList = this.config.fieldsFlat ?? [];
    const mapper = this.dialect.mapperGenerators.rows(fieldsList, this.joinsNotNullableMap);
    // `.asSafe()` is what keeps `prepare(name).execute()` — a third way to run
    // this read, alongside `execute()` and `await` — on the same defect-only
    // boundary as the other two.
    return session
      .prepareQuery<PreparedQueryConfig & { execute: TResult }>(
        query,
        "arrays",
        name ?? generateName,
        mapper,
        { type: "select", tables: [...usedTables] },
        cacheConfig,
      )
      .asSafe();
  }

  /**
   * Create a prepared statement for this query. This allows the database to
   * remember this query for the given session and call it by name, rather than
   * specifying the full query.
   *
   * Its `execute()` carries the same `never` error channel as this builder's —
   * see {@link PgUnthrownSafePreparedQuery}.
   *
   * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
   */
  prepare(name: string): PgUnthrownSafePreparedQuery<PreparedQueryConfig & { execute: TResult }> {
    return this._prepare(name, true);
  }

  /**
   * Run the query, resolving to the selected rows.
   *
   * The error channel is `never` — every failure a read can hit is a defect, and
   * `runSafeQuery` is what makes that true at runtime, not just in the type.
   */
  execute(placeholderValues?: Record<string, unknown>): AsyncResult<TResult, never> {
    return runSafeQuery(() => this._prepare(), placeholderValues);
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<TResult, never> = resultThen(this);
}
