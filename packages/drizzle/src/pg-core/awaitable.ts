import type { AsyncResult, Result } from "unthrown";

import type { PgQueryError } from "../errors.js";

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
 * `.d.ts` besides.) Each builder therefore declares this one-line `then`
 * itself, with the awaited type it actually produces.
 *
 * Awaiting a builder yields a `Result`, never a rejection: `execute()` returns
 * an `AsyncResult`, whose internal promise never rejects. `catch` and `finally`
 * are deliberately not offered — there is no rejection for them to observe.
 * `onRejected` is still forwarded, exactly as `AsyncResult.then` forwards it, so
 * a hypothetical internal rejection settles the `await` instead of hanging it.
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
 * @remarks
 * The bridge {@link ResultThen} needs: `Awaitable.then` deliberately models no
 * rejection channel and so takes only `onFulfilled`, while a builder's `then` is
 * called by `await` with both handlers. Awaiting the `AsyncResult` inside a real
 * promise gives back a `then` that accepts the pair — the same `settle` shape
 * the interop packages use for the same reason.
 *
 * @internal
 */
// oxlint-disable unthrown/prefer-async-result -- producing the native Promise IS this helper's job: only a real promise has the two-handler `then` an awaiting caller drives. An AsyncResult here would be circular.
export function settle<T>(
  asyncResult: AsyncResult<T, PgQueryError>,
): Promise<Result<T, PgQueryError>> {
  return (async () => await asyncResult)();
}
// oxlint-enable unthrown/prefer-async-result
