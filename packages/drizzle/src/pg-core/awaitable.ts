import type { PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import { type AsyncResult, fromPromise, type Result } from "unthrown";

import { type PgQueryError, qualifyPgError } from "../errors.js";
import type { UnthrownPgPreparedQuery } from "./session.js";

/**
 * The `then` that makes a query builder awaitable, resolving to a `Result`.
 *
 * @remarks
 * Drizzle's promise and Effect trees each make their builders runnable the same
 * way: the builder carries a `then` that defers to `execute()`. The promise tree
 * gets it from the `QueryPromise` mixin, whose `then` is literally
 * `this.execute().then(onFulfilled, onRejected)`.
 *
 * This package cannot reuse that mixin. `QueryPromise<T>` declares
 * `execute(): Promise<T>`, and ours returns an `AsyncResult<T, PgQueryError>` —
 * so merging its type would contradict the very method it delegates to. (Its
 * `applyMixins` helper is `@internal` and absent from drizzle's published
 * `.d.ts` besides.) Each builder therefore declares this `then` itself, built by
 * {@link resultThen}, with the awaited type it actually produces.
 *
 * Awaiting a builder yields a `Result`, never a rejection: `execute()` returns
 * an `AsyncResult`, whose internal promise never rejects, and the compilation
 * step ahead of it runs inside the same boundary — see {@link runQuery}. `catch`
 * and `finally` are deliberately not offered: there is no rejection for them to
 * observe. `onRejected` is still forwarded, exactly as `AsyncResult.then`
 * forwards it, so a hypothetical internal rejection settles the `await` instead
 * of hanging it.
 *
 * @typeParam T - the value the query succeeds with; the awaited type is
 * `Result<T, PgQueryError>`.
 *
 * @category Builders
 */
export type ResultThen<T> = <TResult1 = Result<T, PgQueryError>, TResult2 = never>(
  onFulfilled?: ((value: Result<T, PgQueryError>) => TResult1 | PromiseLike<TResult1>) | null,
  onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
) => PromiseLike<TResult1 | TResult2>;

/**
 * Collapse an `AsyncResult` into a native promise of its `Result`.
 *
 * `Awaitable.then` deliberately models no rejection channel and so takes only
 * `onFulfilled`, while a builder's `then` is called by `await` with both
 * handlers. Awaiting the `AsyncResult` inside a real promise gives back a `then`
 * that accepts the pair — the same `settle` shape the interop packages use for
 * the same reason.
 */
// oxlint-disable unthrown/prefer-async-result -- producing the native Promise IS this helper's job: only a real promise has the two-handler `then` an awaiting caller drives. An AsyncResult here would be circular.
function settle<T>(asyncResult: AsyncResult<T, PgQueryError>): Promise<Result<T, PgQueryError>> {
  return (async () => await asyncResult)();
}
// oxlint-enable unthrown/prefer-async-result

/**
 * Build the {@link ResultThen} a builder installs as its `then`.
 *
 * @remarks
 * Takes the builder rather than its `AsyncResult` so that nothing runs until the
 * builder is awaited: `execute()` is called inside the returned closure, on each
 * `await`, exactly as `QueryPromise.then` calls it.
 *
 * @internal
 */
export const resultThen =
  <T>(builder: { execute: () => AsyncResult<T, PgQueryError> }): ResultThen<T> =>
  (onFulfilled, onRejected) =>
    settle(builder.execute()).then(onFulfilled, onRejected);

/**
 * Compile and run a query, with **compilation inside the failure boundary**.
 *
 * @remarks
 * This is why a builder's `execute()` is not simply
 * `this._prepare().execute(…)`. Preparing a query is not bookkeeping: it runs
 * `getSQL()` → `dialect.buildSelectQuery` → `dialect.sqlToQuery`, and drizzle
 * throws in there for mistakes that are type-legal and entirely reachable — most
 * obviously selecting a column from a table the query never joined:
 *
 * ```
 * Your "t" field references a column "posts"."title", but the table "posts"
 * is not part of the query! Did you forget to join it?
 * ```
 *
 * Left outside the boundary, that throw escapes as a rejection — and since a
 * builder's `then` calls `execute()` synchronously, a thenable whose `then`
 * throws rejects the awaiting promise. A consumer folding with
 * `match({ ok, errCases, defect })` and no surrounding `try`/`catch` — the very
 * pattern this library exists to enable — would crash rather than see a defect.
 * That drizzle's own tree rejects here is no defence: drizzle's contract *is* a
 * rejecting promise; this package's is not.
 *
 * So `prepare` is a thunk, invoked inside `fromPromise`'s own thunk, where a
 * synchronous throw is caught by the same boundary that triages the driver's
 * rejection. A compilation failure carries no SQLSTATE, so
 * {@link qualifyPgError} routes it to the defect channel — which is right: a
 * query that cannot be compiled is a bug, never a domain outcome.
 *
 * @param prepare - compiles the query, and may throw.
 * @param placeholderValues - values for the query's named placeholders.
 *
 * @internal
 */
export const runQuery = <T>(
  prepare: () => UnthrownPgPreparedQuery<PreparedQueryConfig & { execute: T }>,
  placeholderValues?: Record<string, unknown>,
): AsyncResult<T, PgQueryError> =>
  fromPromise(() => prepare().runUnqualified(placeholderValues), qualifyPgError);
