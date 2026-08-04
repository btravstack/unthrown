import { entityKind } from "drizzle-orm/entity";
import type { PgDialect } from "drizzle-orm/pg-core/dialect";
import { PgCountBuilder } from "drizzle-orm/pg-core/query-builders/count";
import type { PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import type { PgTable } from "drizzle-orm/pg-core/table";
import type { PgViewBase } from "drizzle-orm/pg-core/view-base";
import type { SQL, SQLWrapper } from "drizzle-orm/sql/sql";
import type { AsyncResult } from "unthrown";

import { type ResultThen, resultThen, runSafeQuery } from "./awaitable.js";
import type { UnthrownPgSession } from "./session.js";

/**
 * Read the single cell a `select count(*)` produces.
 *
 * @remarks
 * Postgres returns `count(*)` as a `bigint`, which the driver hands back as a
 * string; the ternary keeps drizzle's own coercion, including its treatment of
 * a missing or falsy cell as `0`.
 */
const countOf = (rows: unknown[][]): number => {
  const value = rows[0]?.[0];
  if (typeof value === "number") return value;
  return value ? Number(value) : 0;
};

/**
 * A `$count` query that resolves to an `AsyncResult`.
 *
 * @remarks
 * The one builder with no `_prepare`: it inherits from drizzle's `PgCountBuilder`,
 * which is itself an `SQL` fragment, so it can be embedded in a larger query as
 * well as run on its own. Running it prepares the count inline.
 *
 * @category Builders
 */
export class PgUnthrownCountBuilder extends PgCountBuilder {
  static override readonly [entityKind]: string = "PgUnthrownCountBuilder";

  protected session: UnthrownPgSession<unknown>;

  constructor({
    source,
    dialect,
    filters,
    session,
  }: {
    source: PgTable | PgViewBase | SQL | SQLWrapper;
    filters?: SQL<unknown>;
    dialect: PgDialect;
    session: UnthrownPgSession<unknown>;
  }) {
    // `filters` is spread conditionally rather than passed through: under
    // `exactOptionalPropertyTypes` an explicit `undefined` is not the same as an
    // absent optional property, and drizzle's `countConfig.filters` is optional.
    super({ source, dialect, ...(filters === undefined ? {} : { filters }) });
    this.session = session;
  }

  /**
   * Run the count, resolving to the number of matching rows.
   *
   * The error channel is `never` — a count is a read, so every failure it can
   * hit is a defect. See {@link runSafeQuery}.
   */
  execute(placeholderValues?: Record<string, unknown>): AsyncResult<number, never> {
    // `build()` compiles the count query and can throw, so it goes inside the
    // boundary along with everything else — see `runSafeQuery`.
    return runSafeQuery<number>(
      () =>
        this.session.prepareQuery<PreparedQueryConfig & { execute: number }>(
          this.build(),
          "arrays",
          false,
          countOf,
        ),
      placeholderValues,
    );
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<number, never> = resultThen(this);
}
