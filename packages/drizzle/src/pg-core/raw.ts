import { entityKind } from "drizzle-orm/entity";
import { PgRaw } from "drizzle-orm/pg-core/query-builders/raw";
import type { Query, SQL } from "drizzle-orm/sql/sql";
import type { AsyncResult } from "unthrown";

import type { PgQueryError } from "../errors.js";
import { type ResultThen, resultThen } from "./awaitable.js";
import type { PgUnthrownPreparedQuery } from "./session.js";

/**
 * A raw `db.execute(sql\`…\`)` query that resolves to an `AsyncResult`.
 *
 * @remarks
 * Unlike every other builder, this one is handed an already-prepared query — the
 * database prepared it when building the fragment — so `_prepare` simply returns
 * it and `execute` runs it.
 *
 * @typeParam TResult - the driver's result for the statement.
 *
 * @category Builders
 */
export class PgUnthrownRaw<TResult> extends PgRaw<TResult> {
  static override readonly [entityKind]: string = "PgUnthrownRaw";

  /**
   * Narrower than the base's `PgBasePreparedQuery`. `declare` because the base
   * constructor, called below, is what assigns it.
   */
  declare protected prepared: PgUnthrownPreparedQuery<{ execute: TResult }>;

  constructor(prepared: PgUnthrownPreparedQuery<{ execute: TResult }>, sql: SQL, query: Query) {
    super(prepared, sql, query);
  }

  /** Run the statement, resolving to the driver's result. */
  execute(placeholderValues?: Record<string, unknown>): AsyncResult<TResult, PgQueryError> {
    return this.prepared.execute(placeholderValues);
  }

  override _prepare(): PgUnthrownPreparedQuery<{ execute: TResult }> {
    return this.prepared;
  }

  /** {@inheritDoc ResultThen} */
  // oxlint-disable-next-line no-thenable -- deliberate: a builder is thenable so `await db.select()...` runs it, exactly as drizzle's own promise and Effect trees make theirs. It settles to a Result and never rejects — see ResultThen.
  readonly then: ResultThen<TResult> = resultThen(this);
}
