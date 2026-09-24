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
import { resolveNullableObjectPaths, type Assume } from "drizzle-orm/utils";
import type { AsyncResult } from "unthrown";

import { type ResultThen, resultThen, runQuery, runSafeQuery } from "./awaitable.js";
import type {
  PgUnthrownPreparedQuery,
  PgUnthrownSafePreparedQuery,
  PgUnthrownSession,
} from "./session.js";

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
 * @typeParam TError - the select's modeled error channel, carried through every
 * chained method — see {@link PgUnthrownSelectBase}.
 *
 * @category Builders
 */
// oxlint-disable-next-line consistent-type-definitions -- drizzle's HKT encoding reads the polymorphic `this` type, which a type alias cannot express.
export interface PgUnthrownSelectHKT<TError = never> extends PgSelectHKTBase {
  _type: PgUnthrownSelectBase<
    this["tableName"],
    Assume<this["selection"], ColumnsSelection>,
    this["selectMode"],
    Assume<this["nullabilityMap"], Record<string, JoinNullability>>,
    this["dynamic"],
    this["excludedMethods"],
    Assume<this["result"], unknown[]>,
    Assume<this["selectedFields"], ColumnsSelection>,
    TError
  >;
}

/**
 * The builder `db.select()` returns, before a table has been chosen.
 *
 * @typeParam TError - the select's modeled error channel: `never` for a read,
 * `PgQueryError` for a select whose `WITH` list may write — see
 * {@link PgUnthrownSelectBase}.
 *
 * @category Builders
 */
export type PgUnthrownSelectBuilder<
  TSelection extends SelectedFields | undefined,
  TError = never,
> = PgSelectBuilder<TSelection, PgUnthrownSelectHKT<TError>>;

/**
 * The CTEs known to only read: those `db.$with(…).as(…)` built from a select
 * whose own `WITH` list only reads. Anything else in a `WITH` list — a CTE over
 * an insert, update or delete, over raw SQL, or built by some other `$with` —
 * may write, so it is qualified like a write.
 *
 * A registry rather than a flag on the CTE because a CTE is drizzle's
 * `WithSubquery` wrapped in a proxy: identity is what survives.
 *
 * @internal
 */
export const readOnlyCtes: WeakSet<object> = new WeakSet();

/**
 * Whether a `WITH` list may write, and so needs the qualified write path.
 *
 * @internal
 */
export const withListWrites = (withList: readonly object[] | undefined): boolean =>
  withList?.some((cte) => !readOnlyCtes.has(cte)) ?? false;

/**
 * The prepared statement a select hands back: the defect-only one for a read,
 * the qualified one for a select whose `WITH` list may write.
 *
 * @category Builders
 */
export type PgUnthrownSelectPreparedQuery<T extends PreparedQueryConfig, TError> = [
  TError,
] extends [never]
  ? PgUnthrownSafePreparedQuery<T>
  : PgUnthrownPreparedQuery<T>;

/**
 * A `select` query that resolves to an `AsyncResult`.
 *
 * @remarks
 * Every chaining method comes from drizzle's `PgSelectBase`; this subclass adds
 * only the execution half — `_prepare`, `prepare`, `execute` — plus the `then`
 * that makes `await db.select().from(users)` yield a `Result`.
 *
 * The error channel is **`never`** for a read: a `SELECT` writes nothing, so it
 * cannot violate an integrity constraint; a database that will not answer is an
 * infrastructure failure, which is a defect. That is enforced at runtime as well
 * as declared — see `runSafeQuery`.
 *
 * The exception is a select built by `db.with(…)` over a CTE that may write —
 * `db.$with("x").as(db.insert(t).values(…).returning())`, which Postgres runs
 * as a real `INSERT`. That select carries `PgQueryError` and is qualified
 * exactly as the insert would be, so its 23505 is an `Err` rather than a
 * defect. A CTE over raw SQL counts as writing, since its text cannot be read.
 *
 * @typeParam TError - `never` for a read, `PgQueryError` when the `WITH`
 * list may write. Set by `db.with(…)`, never by hand.
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
  TError = never,
> extends PgSelectBase<
  PgUnthrownSelectHKT<TError>,
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

  /**
   * Whether this select's `WITH` list may write — the runtime half of
   * `TError`, decided by the same rule `db.with(…)` types it by.
   */
  #writes(): boolean {
    return withListWrites(this.config.withList);
  }

  /** @internal */
  _prepare(
    name?: string,
    generateName = false,
  ): PgUnthrownSelectPreparedQuery<PreparedQueryConfig & { execute: TResult }, TError> {
    const { session, dialect, cacheConfig, usedTables } = this;
    const query = this.config.tagged
      ? dialect._sqlToQuery(this.getSQL())
      : dialect.sqlToQuery(this.getSQL());
    // `getSQL()` — called just above to build `query` — runs
    // `_resolveSelection()`, which populates `config.fieldsFlat` (and, under a
    // set operator, `config.setFieldsFlat`, the list drizzle's own `_prepare`
    // then prefers), so both are set by the time we read them; that ordering
    // is the same one drizzle's own `_prepare` relies on. `?? []` keeps the
    // type honest without a non-null assertion.
    const fieldsList = this.config.setFieldsFlat ?? this.config.fieldsFlat ?? [];
    const mapper = this.dialect.mapperGenerators.rows(
      fieldsList,
      resolveNullableObjectPaths(fieldsList, this.joinsNotNullableMap),
    );
    const prepared = session.prepareQuery<PreparedQueryConfig & { execute: TResult }>(
      query,
      "arrays",
      name ?? generateName,
      mapper,
      { type: "select", tables: [...usedTables] },
      cacheConfig,
    );
    // `.asSafe()` is what keeps `prepare(name).execute()` — a third way to run
    // this read, alongside `execute()` and `await` — on the same defect-only
    // boundary as the other two. A select over a writing CTE keeps the
    // qualified statement instead. The assertion restates `#writes()` —
    // decided by the rule `TError` is typed by — which the checker cannot
    // connect to the type parameter.
    return (this.#writes() ? prepared : prepared.asSafe()) as PgUnthrownSelectPreparedQuery<
      PreparedQueryConfig & { execute: TResult },
      TError
    >;
  }

  /**
   * Create a prepared statement for this query. This allows the database to
   * remember this query for the given session and call it by name, rather than
   * specifying the full query.
   *
   * Its `execute()` carries the same error channel as this builder's — `never`
   * for a read, see {@link PgUnthrownSafePreparedQuery}.
   *
   * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
   */
  prepare(
    name: string,
  ): PgUnthrownSelectPreparedQuery<PreparedQueryConfig & { execute: TResult }, TError> {
    return this._prepare(name, true);
  }

  /**
   * Run the query, resolving to the selected rows.
   *
   * The error channel is `never` for a read — every failure a read can hit is
   * a defect, and `runSafeQuery` is what makes that true at runtime, not just
   * in the type. A select over a writing CTE carries `PgQueryError`.
   */
  execute(placeholderValues?: Record<string, unknown>): AsyncResult<TResult, TError> {
    // The same restatement as in `_prepare`: `#writes()` is the runtime form
    // of `TError`, so `PgQueryError` here is exactly `TError`, and `never`
    // there is assignable to it.
    return (
      this.#writes()
        ? runQuery(() => this._prepare(), placeholderValues)
        : runSafeQuery(() => this._prepare(), placeholderValues)
    ) as AsyncResult<TResult, TError>;
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<TResult, TError> = resultThen(this);
}
