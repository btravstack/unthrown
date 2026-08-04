import { entityKind } from "drizzle-orm/entity";
import type { PgColumn } from "drizzle-orm/pg-core/columns/common";
import type { PgDialect } from "drizzle-orm/pg-core/dialect";
import {
  PgInsertBuilder,
  PgSelectBuilder,
  PgUpdateBuilder,
  QueryBuilder,
} from "drizzle-orm/pg-core/query-builders";
import { RelationalQueryBuilder } from "drizzle-orm/pg-core/query-builders/query";
import type { SelectedFields } from "drizzle-orm/pg-core/query-builders/select.types";
import type { PgQueryResultHKT, PgQueryResultKind } from "drizzle-orm/pg-core/session";
import type { WithBuilder } from "drizzle-orm/pg-core/subquery";
import type { PgTable } from "drizzle-orm/pg-core/table";
import type { PgMaterializedView } from "drizzle-orm/pg-core/view";
import type { PgViewBase } from "drizzle-orm/pg-core/view-base";
import type {
  AnyRelations,
  EmptyRelations,
  TableRelationalConfig,
  TablesRelationalConfig,
} from "drizzle-orm/relations";
import { SelectionProxyHandler } from "drizzle-orm/selection-proxy";
import { type SQL, sql, type SQLWrapper } from "drizzle-orm/sql/sql";
import { WithSubquery } from "drizzle-orm/subquery";

import { PgUnthrownCountBuilder } from "./count.js";
import { PgUnthrownDeleteBase } from "./delete.js";
import type { PgUnthrownInsertHKT } from "./insert.js";
import { PgUnthrownInsertBase } from "./insert.js";
import { PgUnthrownRelationalQuery, type PgUnthrownRelationalQueryHKT } from "./query.js";
import { PgUnthrownRaw } from "./raw.js";
import { PgUnthrownRefreshMaterializedView } from "./refresh-materialized-view.js";
import { PgUnthrownSelectBase, type PgUnthrownSelectBuilder } from "./select.js";
import type { PgUnthrownSession } from "./session.js";
import type { PgUnthrownUpdateHKT } from "./update.js";
import { PgUnthrownUpdateBase } from "./update.js";

/**
 * A Postgres database whose every query resolves to an `AsyncResult`.
 *
 * @remarks
 * The unthrown sibling of drizzle's own `PgAsyncDatabase` (promises) and
 * `PgEffectDatabase` (Effects). The entry points below only *build* queries —
 * every one of them hands back a builder from this package's tree, and nothing
 * touches the database until that builder is awaited or `execute`d. That is why
 * their bodies are drizzle's, unchanged but for the builder classes.
 *
 * @typeParam TQueryResult - the driver's result kind, which decides what a write
 * without `.returning()` resolves to.
 * @typeParam TRelations - the relational schema backing {@link query}.
 *
 * @category Database
 */
export class PgUnthrownDatabase<
  TQueryResult extends PgQueryResultHKT,
  TRelations extends AnyRelations = EmptyRelations,
> {
  static readonly [entityKind]: string = "PgUnthrownDatabase";

  readonly _: {
    readonly relations: TRelations;
    readonly session: PgUnthrownSession<unknown>;
  };

  /**
   * The relational query API — `db.query.users.findMany(…)`, one entry per table
   * in the relational schema.
   */
  readonly query: {
    [K in keyof TRelations]: RelationalQueryBuilder<
      TRelations,
      TRelations[K],
      PgUnthrownRelationalQueryHKT
    >;
  };

  constructor(
    /** @internal */
    readonly dialect: PgDialect,
    /** @internal */
    readonly session: PgUnthrownSession<unknown>,
    relations: TRelations,
    parseRqbJson = false,
    readonly tagged = false,
  ) {
    this._ = { relations, session };

    // Widening, not a cast: `TRelations extends AnyRelations`, which *is*
    // `TablesRelationalConfig`. It buys `Object.entries` a concrete record to
    // walk, which it cannot infer through an unresolved type parameter.
    const schema: TablesRelationalConfig = relations;
    const builders: Record<
      string,
      RelationalQueryBuilder<
        TablesRelationalConfig,
        TableRelationalConfig,
        PgUnthrownRelationalQueryHKT
      >
    > = {};

    for (const [tableName, relation] of Object.entries(schema)) {
      // Drizzle looks the entry up by `relation.name` rather than reusing
      // `relation`, so that a schema whose keys differ from its table names
      // still resolves. The two coincide for every schema `defineRelations`
      // builds, which is what makes `?? relation` an exact fallback rather than
      // a guess — and keeps the lookup total without an unreachable branch.
      const target = schema[relation.name] ?? relation;
      builders[tableName] = new RelationalQueryBuilder(
        schema,
        // `TableRelationalConfig.table` is widened to `SchemaEntry` (a table OR
        // a view) because the relational config is shared across dialects;
        // `RelationalQueryBuilder` wants the `PgTable` this schema actually
        // holds. Drizzle's own async database passes the same value untyped.
        target.table as PgTable,
        relation,
        dialect,
        session,
        parseRqbJson,
        PgUnthrownRelationalQuery,
      );
    }

    // The per-table builders are assembled by walking `relations` at runtime, so
    // the mapped type over `keyof TRelations` cannot be proven by construction —
    // the key set and the value types are the same ones the loop just wrote.
    this.query = builders as PgUnthrownDatabase<TQueryResult, TRelations>["query"];
  }

  /**
   * Creates a subquery that defines a temporary named result set as a CTE.
   *
   * It is useful for breaking down complex queries into simpler parts and for
   * reusing the result set in subsequent parts of the query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param alias The alias for the subquery.
   *
   * Failure to provide an alias will result in a DrizzleTypeError, preventing
   * the subquery from being referenced in other queries.
   *
   * @example
   *
   * ```ts
   * // Create a subquery with alias 'sq' and use it in the select query
   * const sq = db.$with("sq").as(db.select().from(users).where(eq(users.id, 42)));
   *
   * const rows = (await db.with(sq).select().from(sq)).get();
   * ```
   *
   * To select arbitrary SQL values as fields in a CTE and reference them in
   * other CTEs or in the main query, you need to add aliases to them:
   *
   * ```ts
   * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
   * const sq = db.$with("sq").as(
   *   db
   *     .select({
   *       name: sql<string>`upper(${users.name})`.as("name"),
   *     })
   *     .from(users),
   * );
   *
   * const rows = (await db.with(sq).select({ name: sq.name }).from(sq)).get();
   * ```
   */
  // `WithBuilder` is a pair of overloads whose return type depends on the
  // *selection* of whatever query builder is handed to `.as()` — a relationship
  // no implementation signature can carry, which is why drizzle declares the
  // property and writes the body untyped. The body below is drizzle's, and the
  // assertion is what lets the declared overloads stand in front of it.
  readonly $with: WithBuilder = ((alias: string, selection?: Record<string, unknown>) => {
    const as = (qb: unknown) => {
      const built =
        typeof qb === "function"
          ? (qb as (b: QueryBuilder) => unknown)(new QueryBuilder(this.dialect))
          : qb;
      const source = built as {
        withoutSelectionCastCodecs?: () => SQLWrapper;
        getSelectedFields?: () => Record<string, unknown> | undefined;
        getSQL: () => SQL;
      };
      const built$ =
        source.withoutSelectionCastCodecs === undefined
          ? source
          : source.withoutSelectionCastCodecs();
      const fragment = built$.getSQL();
      const fields =
        selection ??
        (source.getSelectedFields === undefined ? {} : (source.getSelectedFields() ?? {}));
      // `SQL#usedTables` is populated at runtime but marked `@internal`, so it
      // is stripped from drizzle's published `.d.ts`. The CTE has to forward it
      // — it is how a query reports which tables it touched — so it is read
      // through the structural type it actually has.
      const usedTables = (fragment as { usedTables?: string[] }).usedTables ?? [];
      return new Proxy(
        new WithSubquery(fragment, fields, alias, true, usedTables),
        new SelectionProxyHandler({
          alias,
          sqlAliasedBehavior: "alias",
          sqlBehavior: "error",
        }),
      );
    };
    return { as };
  }) as unknown as WithBuilder;

  /**
   * Count the rows a table, view or subquery yields, optionally filtered.
   *
   * @example
   * ```ts
   * const total = (await db.$count(users, eq(users.active, true))).get();
   * //    ^? number — a count is a read, so its error channel is `never`.
   * ```
   */
  $count(
    source: PgTable | PgViewBase | SQL | SQLWrapper,
    filters?: SQL<unknown>,
  ): PgUnthrownCountBuilder {
    return new PgUnthrownCountBuilder({
      source,
      // See `PgUnthrownCountBuilder`'s constructor: an explicit `undefined` is
      // not an absent optional property under `exactOptionalPropertyTypes`.
      ...(filters === undefined ? {} : { filters }),
      session: this.session,
      dialect: this.dialect,
    });
  }

  /**
   * Incorporates a previously defined CTE (using `$with`) into the main query.
   *
   * This method allows the main query to reference a temporary named result set.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param queries The CTEs to incorporate into the main query.
   *
   * @example
   *
   * ```ts
   * // Define a subquery 'sq' as a CTE using $with
   * const sq = db.$with("sq").as(db.select().from(users).where(eq(users.id, 42)));
   *
   * // Incorporate the CTE 'sq' into the main query and select from it
   * const rows = (await db.with(sq).select().from(sq)).get();
   * ```
   */
  with(...queries: WithSubquery[]): {
    select: {
      (): PgUnthrownSelectBuilder<undefined>;
      <TSelection extends SelectedFields>(fields: TSelection): PgUnthrownSelectBuilder<TSelection>;
    };
    selectDistinct: {
      (): PgUnthrownSelectBuilder<undefined>;
      <TSelection extends SelectedFields>(fields: TSelection): PgUnthrownSelectBuilder<TSelection>;
    };
    selectDistinctOn: {
      (on: (PgColumn | SQLWrapper)[]): PgUnthrownSelectBuilder<undefined>;
      <TSelection extends SelectedFields>(
        on: (PgColumn | SQLWrapper)[],
        fields: TSelection,
      ): PgUnthrownSelectBuilder<TSelection>;
    };
    update: <TTable extends PgTable>(
      table: TTable,
    ) => PgUpdateBuilder<TTable, TQueryResult, PgUnthrownUpdateHKT>;
    insert: <TTable extends PgTable>(
      table: TTable,
    ) => PgInsertBuilder<TTable, TQueryResult, false, PgUnthrownInsertHKT>;
    delete: <TTable extends PgTable>(table: TTable) => PgUnthrownDeleteBase<TTable, TQueryResult>;
  } {
    // oxlint-disable-next-line no-this-alias -- the returned members are `function` declarations, not arrows, because each carries overload signatures an arrow cannot; `this` inside them is the call site's, so the database has to be captured.
    const self = this;

    function select(): PgUnthrownSelectBuilder<undefined>;
    function select<TSelection extends SelectedFields>(
      fields: TSelection,
    ): PgUnthrownSelectBuilder<TSelection>;
    function select(fields?: SelectedFields): PgUnthrownSelectBuilder<SelectedFields | undefined> {
      return new PgSelectBuilder(
        {
          fields: fields ?? undefined,
          session: self.session,
          dialect: self.dialect,
          withList: queries,
          tagged: self.tagged,
        },
        PgUnthrownSelectBase,
      );
    }

    function selectDistinct(): PgUnthrownSelectBuilder<undefined>;
    function selectDistinct<TSelection extends SelectedFields>(
      fields: TSelection,
    ): PgUnthrownSelectBuilder<TSelection>;
    function selectDistinct(
      fields?: SelectedFields,
    ): PgUnthrownSelectBuilder<SelectedFields | undefined> {
      return new PgSelectBuilder(
        {
          fields: fields ?? undefined,
          session: self.session,
          dialect: self.dialect,
          withList: queries,
          distinct: true,
          tagged: self.tagged,
        },
        PgUnthrownSelectBase,
      );
    }

    function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgUnthrownSelectBuilder<undefined>;
    function selectDistinctOn<TSelection extends SelectedFields>(
      on: (PgColumn | SQLWrapper)[],
      fields: TSelection,
    ): PgUnthrownSelectBuilder<TSelection>;
    function selectDistinctOn(
      on: (PgColumn | SQLWrapper)[],
      fields?: SelectedFields,
    ): PgUnthrownSelectBuilder<SelectedFields | undefined> {
      return new PgSelectBuilder(
        {
          fields: fields ?? undefined,
          session: self.session,
          dialect: self.dialect,
          withList: queries,
          distinct: { on },
          tagged: self.tagged,
        },
        PgUnthrownSelectBase,
      );
    }

    function update<TTable extends PgTable>(
      table: TTable,
    ): PgUpdateBuilder<TTable, TQueryResult, PgUnthrownUpdateHKT> {
      return new PgUpdateBuilder(table, self.session, self.dialect, queries, PgUnthrownUpdateBase);
    }

    function insert<TTable extends PgTable>(
      table: TTable,
    ): PgInsertBuilder<TTable, TQueryResult, false, PgUnthrownInsertHKT> {
      return new PgInsertBuilder(
        table,
        self.session,
        self.dialect,
        queries,
        undefined,
        PgUnthrownInsertBase,
      );
    }

    function delete_<TTable extends PgTable>(
      table: TTable,
    ): PgUnthrownDeleteBase<TTable, TQueryResult> {
      return new PgUnthrownDeleteBase(table, self.session, self.dialect, queries);
    }

    return { select, selectDistinct, selectDistinctOn, update, insert, delete: delete_ };
  }

  /**
   * Creates a select query.
   *
   * Calling this method with no arguments will select all columns from the
   * table. Pass a selection object to specify the columns you want to select.
   *
   * Use `.from()` method to specify which table to select from.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select}
   *
   * Awaiting the builder resolves to a `Result`, never rows directly — a read
   * has no modeled failure, so the error channel is `never` and `.get()`
   * compiles.
   *
   * @example
   *
   * ```ts
   * // Select all columns and all rows from the 'cars' table
   * const allCars = (await db.select().from(cars)).get();
   *
   * // Select specific columns and all rows from the 'cars' table
   * const carsIdsAndBrands = (
   *   await db
   *     .select({
   *       id: cars.id,
   *       brand: cars.brand,
   *     })
   *     .from(cars)
   * ).get();
   * ```
   */
  select(): PgUnthrownSelectBuilder<undefined>;
  select<TSelection extends SelectedFields>(
    fields: TSelection,
  ): PgUnthrownSelectBuilder<TSelection>;
  select(fields?: SelectedFields): PgUnthrownSelectBuilder<SelectedFields | undefined> {
    return new PgSelectBuilder(
      {
        fields: fields ?? undefined,
        session: this.session,
        dialect: this.dialect,
        tagged: this.tagged,
      },
      PgUnthrownSelectBase,
    );
  }

  /**
   * Adds `distinct` expression to the select query.
   *
   * Calling this method will return only unique values. When multiple columns
   * are selected, it returns rows with unique combinations of values in these
   * columns.
   *
   * Use `.from()` method to specify which table to select from. Pass a
   * selection object to specify the columns you want to select.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
   *
   * @example
   * ```ts
   * // Select all unique rows from the 'cars' table
   * const unique = (
   *   await db.selectDistinct().from(cars).orderBy(cars.id, cars.brand, cars.color)
   * ).get();
   *
   * // Select all unique brands from the 'cars' table
   * const brands = (
   *   await db.selectDistinct({ brand: cars.brand }).from(cars).orderBy(cars.brand)
   * ).get();
   * ```
   */
  selectDistinct(): PgUnthrownSelectBuilder<undefined>;
  selectDistinct<TSelection extends SelectedFields>(
    fields: TSelection,
  ): PgUnthrownSelectBuilder<TSelection>;
  selectDistinct(fields?: SelectedFields): PgUnthrownSelectBuilder<SelectedFields | undefined> {
    return new PgSelectBuilder(
      {
        fields: fields ?? undefined,
        session: this.session,
        dialect: this.dialect,
        distinct: true,
        tagged: this.tagged,
      },
      PgUnthrownSelectBase,
    );
  }

  /**
   * Adds `distinct on` expression to the select query.
   *
   * Calling this method will specify how the unique rows are determined.
   *
   * Use `.from()` method to specify which table to select from. Pass a
   * selection object as the second argument to specify the columns you want to
   * select.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
   *
   * @param on The expression defining uniqueness.
   *
   * @example
   * ```ts
   * // Select the first row for each unique brand from the 'cars' table
   * const firstPerBrand = (
   *   await db.selectDistinctOn([cars.brand]).from(cars).orderBy(cars.brand)
   * ).get();
   *
   * // The first occurrence of each unique brand, with its color
   * const brandColors = (
   *   await db
   *     .selectDistinctOn([cars.brand], { brand: cars.brand, color: cars.color })
   *     .from(cars)
   *     .orderBy(cars.brand, cars.color)
   * ).get();
   * ```
   */
  selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgUnthrownSelectBuilder<undefined>;
  selectDistinctOn<TSelection extends SelectedFields>(
    on: (PgColumn | SQLWrapper)[],
    fields: TSelection,
  ): PgUnthrownSelectBuilder<TSelection>;
  selectDistinctOn(
    on: (PgColumn | SQLWrapper)[],
    fields?: SelectedFields,
  ): PgUnthrownSelectBuilder<SelectedFields | undefined> {
    return new PgSelectBuilder(
      {
        fields: fields ?? undefined,
        session: this.session,
        dialect: this.dialect,
        distinct: { on },
        tagged: this.tagged,
      },
      PgUnthrownSelectBase,
    );
  }

  /**
   * Creates an update query.
   *
   * Calling this method without `.where()` clause will update all rows in a
   * table. The `.where()` clause specifies which rows should be updated.
   *
   * Use `.set()` method to specify which values to update.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * A write carries the full `PgQueryError` union, so awaiting the builder
   * resolves to a `Result` you fold with `mapErrCases` or `match` — never a
   * rejection.
   *
   * @param table The table to update.
   *
   * @example
   *
   * ```ts
   * // Update all rows in the 'cars' table
   * const all = await db.update(cars).set({ color: "red" });
   * //    ^? Result<UpdateResult<…>, PgQueryError>
   *
   * // Update rows with filters and conditions
   * await db.update(cars).set({ color: "red" }).where(eq(cars.brand, "BMW"));
   *
   * // Update with returning clause
   * const updated = await db
   *   .update(cars)
   *   .set({ color: "red" })
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  update<TTable extends PgTable>(
    table: TTable,
  ): PgUpdateBuilder<TTable, TQueryResult, PgUnthrownUpdateHKT> {
    return new PgUpdateBuilder(table, this.session, this.dialect, undefined, PgUnthrownUpdateBase);
  }

  /**
   * Creates an insert query.
   *
   * Calling this method will create new rows in a table. Use `.values()` method
   * to specify which values to insert.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert}
   *
   * A write carries the full `PgQueryError` union, so awaiting the builder
   * resolves to a `Result` you fold with `mapErrCases` or `match` — never a
   * rejection.
   *
   * @param table The table to insert into.
   *
   * @example
   *
   * ```ts
   * // Insert one row
   * const one = await db.insert(cars).values({ brand: "BMW" });
   * //    ^? Result<InsertResult<…>, PgQueryError>
   *
   * // Insert multiple rows
   * await db.insert(cars).values([{ brand: "BMW" }, { brand: "Porsche" }]);
   *
   * // Insert with returning clause
   * const inserted = await db.insert(cars).values({ brand: "BMW" }).returning();
   * ```
   */
  insert<TTable extends PgTable>(
    table: TTable,
  ): PgInsertBuilder<TTable, TQueryResult, false, PgUnthrownInsertHKT> {
    return new PgInsertBuilder(
      table,
      this.session,
      this.dialect,
      undefined,
      undefined,
      PgUnthrownInsertBase,
    );
  }

  /**
   * Creates a delete query.
   *
   * Calling this method without `.where()` clause will delete all rows in a
   * table. The `.where()` clause specifies which rows should be deleted.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * A write carries the full `PgQueryError` union — a delete can still raise
   * `23505` through an `ON DELETE SET DEFAULT` — so awaiting the builder
   * resolves to a `Result` you fold with `mapErrCases` or `match`.
   *
   * @param table The table to delete from.
   *
   * @example
   *
   * ```ts
   * // Delete all rows in the 'cars' table
   * const all = await db.delete(cars);
   * //    ^? Result<DeleteResult<…>, PgQueryError>
   *
   * // Delete rows with filters and conditions
   * await db.delete(cars).where(eq(cars.color, "green"));
   *
   * // Delete with returning clause
   * const deleted = await db.delete(cars).where(eq(cars.id, 1)).returning();
   * ```
   */
  delete<TTable extends PgTable>(table: TTable): PgUnthrownDeleteBase<TTable, TQueryResult> {
    return new PgUnthrownDeleteBase(table, this.session, this.dialect);
  }

  /** Rebuild a materialized view's stored rows. */
  refreshMaterializedView<TView extends PgMaterializedView>(
    view: TView,
  ): PgUnthrownRefreshMaterializedView<TQueryResult> {
    return new PgUnthrownRefreshMaterializedView(view, this.session, this.dialect);
  }

  /**
   * Run a statement drizzle does not model — a raw `SQL` fragment or a string.
   *
   * @remarks
   * Unlike every other entry point, this one compiles its argument **eagerly**,
   * because `PgUnthrownRaw` is defined as holding an already-prepared query
   * (that is what makes its `getSQL`, `getQuery` and `_prepare` synchronous
   * accessors, exactly as in drizzle). Compilation therefore happens here rather
   * than at `await`, and a `SQLWrapper` that cannot compile **throws at this call
   * site** instead of yielding a defect.
   *
   * That is a deliberate line, not an oversight: the contract this package makes
   * is about *running* a query — awaiting a builder, or calling its `execute()` —
   * and `db.execute(…)` is the factory that produces one, not the run itself. The
   * builder it returns is fully guarded. Reaching the throw takes handing in a
   * query builder that is already broken (`db.execute(db.select({ t:
   * other.col }).from(users))`); a string or a `sql` template — the documented
   * use — cannot. Closing the gap would mean deferring compilation, which would
   * cost `PgRaw`'s shape and its synchronous accessors for a case where the
   * argument, not the statement, is the bug.
   *
   * @example
   * ```ts
   * const result = await db.execute(sql`select now()`);
   * ```
   */
  execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
    query: SQLWrapper | string,
  ): PgUnthrownRaw<PgQueryResultKind<TQueryResult, TRow>> {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    const builtQuery = this.dialect.sqlToQuery(sequel);
    return new PgUnthrownRaw(
      this.session.prepareQuery<{ execute: PgQueryResultKind<TQueryResult, TRow> }>(
        builtQuery,
        "raw",
        false,
      ),
      sequel,
      builtQuery,
    );
  }
}
