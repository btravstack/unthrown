import type { PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import { type AsyncResult, fromPromise, fromSafePromise, type Result } from "unthrown";

import { type PgQueryError, qualifyPgError } from "../errors.js";
import type { PgUnthrownPreparedQuery } from "./session.js";

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
 * `resultThen`, with the awaited type it actually produces.
 *
 * Awaiting a builder yields a `Result`, never a rejection: `execute()` returns
 * an `AsyncResult`, whose internal promise never rejects, and the compilation
 * step ahead of it runs inside the same boundary — see `runQuery`. `catch`
 * and `finally` are deliberately not offered: there is no rejection for them to
 * observe. `onRejected` is still forwarded, exactly as `AsyncResult.then`
 * forwards it, so a hypothetical internal rejection settles the `await` instead
 * of hanging it.
 *
 * @typeParam T - the value the query succeeds with; the awaited type is
 * `Result<T, E>`.
 * @typeParam E - the query's modeled error channel. Defaults to
 * {@link PgQueryError}, which is what a **write** carries; the four read
 * builders pass `never`, because a read has no modeled failure at all — see
 * `runSafeQuery`.
 *
 * @category Builders
 */
export type ResultThen<T, E = PgQueryError> = <TResult1 = Result<T, E>, TResult2 = never>(
  onFulfilled?: ((value: Result<T, E>) => TResult1 | PromiseLike<TResult1>) | null,
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
function settle<T, E>(asyncResult: AsyncResult<T, E>): Promise<Result<T, E>> {
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
  <T, E>(builder: { execute: () => AsyncResult<T, E> }): ResultThen<T, E> =>
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
  prepare: () => PgUnthrownPreparedQuery<PreparedQueryConfig & { execute: T }>,
  placeholderValues?: Record<string, unknown>,
): AsyncResult<T, PgQueryError> =>
  fromPromise(() => prepare().runUnqualified(placeholderValues), qualifyPgError);

/**
 * Compile and run a **read**, where every failure is a defect.
 *
 * @remarks
 * The read counterpart of `runQuery`, and the reason the four read
 * builders (`select`, `$count`, `db.query.*`, `refresh materialized view`) can
 * honestly declare `E = never`.
 *
 * A read has no modeled failure. The five {@link PgQueryError} tags are
 * *integrity-constraint* violations, and a `SELECT` writes nothing to violate
 * one; everything a read can actually hit — a dropped connection, a pool
 * timeout, a deadlock, a statement that will not compile — is an infrastructure
 * failure, which is a defect by this package's rule. So there is nothing left to
 * triage, and `fromSafePromise` is the named form of exactly that decision:
 * every rejection becomes a `Defect`, the error channel is `never`, and no
 * `qualify` is supplied because none is needed.
 *
 * **The runtime half is load-bearing, not decoration.** Declaring `E = never`
 * while still routing through {@link qualifyPgError} would let a `23xxx` raised
 * on a read path — reachable, if narrowly: a `SELECT` calling a volatile
 * function that writes — surface as an `Err` the type says cannot exist. A
 * type-exhaustive `mapErrCases` would then find no matching case, throw
 * `NonExhaustiveError`, and the modeled error would *silently become a defect*.
 * `@unthrown/prisma` shipped that exact trap by omitting `RecordNotFound` from
 * `create`/`upsert`'s `E` while the runtime still produced it. Routing reads
 * through here makes the defect the *only* outcome, so the type cannot lie.
 *
 * `prepare` is a thunk for the same reason as in `runQuery`: compilation
 * happens inside the boundary, so a `getSQL()` throw becomes a defect rather
 * than a rejection escaping a caller who has no `try`/`catch`.
 *
 * @param prepare - compiles the query, and may throw.
 * @param placeholderValues - values for the query's named placeholders.
 *
 * @internal
 */
export const runSafeQuery = <T>(
  prepare: () => PgUnthrownPreparedQuery<PreparedQueryConfig & { execute: T }>,
  placeholderValues?: Record<string, unknown>,
): AsyncResult<T, never> => fromSafePromise(() => prepare().runUnqualified(placeholderValues));
