// Result facade — a discoverable namespace alias for the standalone entry
// points. The free functions remain the primary, tree-shakeable API; this
// object is a separate export, so `import { Ok }` never pulls it in. The value
// `Result` and the type `Result<T, E>` share a name — the companion-object
// pattern — and BOTH are declared here, once. A second declaration elsewhere
// (the former `types.ts` original plus a re-alias here) made the d.ts bundler
// rename one to `Result$1`/`AsyncResult$1` and never export it, which broke a
// consumer's declaration emit (TS4023). `types.ts` re-exports these types.
// See CLAUDE.md → "Internal design".

import { Err, ErrAsync, isDefect, isErr, isOk, Ok, OkAsync } from "./constructors.js";
import { isResult } from "./core.js";
import { Do, DoAsync } from "./do.js";
import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  fromExecutor,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromSafeThrowable,
  fromThrowable,
  validateAll,
  validateAllAsync,
  validateAllFromDict,
  validateAllFromDictAsync,
} from "./interop.js";
import type { AsyncResultMethods, Awaitable, DefectView, ErrView, OkView } from "./types.js";

/**
 * Companion object grouping the **`Result`-producing** entry points under a
 * single, discoverable namespace: {@link Result.Ok}, {@link Result.Err},
 * {@link Result.Do}, {@link Result.fromNullable}, {@link Result.fromThrowable},
 * {@link Result.fromSafeThrowable}, {@link Result.all},
 * {@link Result.allFromDict}, {@link Result.validateAll},
 * {@link Result.validateAllFromDict}, {@link Result.isOk}, {@link Result.isErr},
 * {@link Result.isDefect}, {@link Result.isResult}.
 *
 * @remarks
 * Purely additive sugar — each member **is** the corresponding free function.
 * The free functions remain the primary, tree-shakeable API; importing only
 * `{ Ok }` never pulls this object in. The value `Result` and the type
 * {@link Result} share one name (the companion-object pattern).
 *
 * The **async** entry points live on the sibling {@link AsyncResult} companion
 * (`AsyncResult.fromPromise`, `AsyncResult.all`, …), grouped by what they
 * return — a static lives in exactly one namespace.
 *
 * @category Facade
 *
 * @example
 * ```ts
 * import { Result } from "unthrown";
 * Result.Ok(1).flatMap((n) => Result.Ok(n + 1)).get(); // => 2
 * ```
 */
export const Result = {
  Ok,
  Err,
  Do,
  fromNullable,
  fromThrowable,
  fromSafeThrowable,
  all,
  allFromDict,
  validateAll,
  validateAllFromDict,
  isOk,
  isErr,
  isDefect,
  isResult,
} as const;

/**
 * The core type of the library: a computation that has either succeeded with a
 * value of type `T` or failed with a *modeled* error of type `E`. Shares its
 * name with the {@link Result | companion object} above (the value and type are
 * one name); this is the type half.
 *
 * @remarks
 * A `Result` is a **discriminated union** of three variants, distinguished by a
 * `tag` of `"Ok"` | `"Err"` | `"Defect"`:
 *
 * - **`Ok`** — a success carrying a `value: T`.
 * - **`Err`** — a modeled, anticipated failure carrying an `error: E`.
 * - **`Defect`** — an *unmodeled* failure carrying an unknown `cause`. A Defect
 *   never appears in `E`; it is the library's third, out-of-band channel.
 *
 * Because it is a real union, you can match it natively (a `switch` on `tag`, or
 * the built-in `match(...).with({ tag: "Ok" }, …).exhaustive()`), *and* it
 * carries the full method surface for fluent chaining. Either way, the payload
 * (`value`/`error`/`cause`) is only reachable after you narrow — so "check
 * before you access" still holds.
 *
 * TypeDoc can't list a union's methods on this alias: its fluent combinators
 * (`map`, `flatMap`, `match`, `get`, …) are documented one per entry on
 * {@link ResultMethods} — the shared method surface every variant carries. For
 * "which one do I reach for?", see the
 * [Choosing a combinator](/reference/combinators) guide.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type (only anticipated domain failures).
 *
 * @category Facade
 *
 * @example
 * ```ts
 * import { Ok, Err, type Result } from "unthrown";
 *
 * function half(n: number): Result<number, "odd"> {
 *   return n % 2 === 0 ? Ok(n / 2) : Err("odd");
 * }
 *
 * const message = half(10).match({
 *   ok: (n) => `got ${n}`,
 *   // every case of `E` named — here the one literal it holds
 *   errCases: (matcher) => matcher.with("odd", () => "failed: odd"),
 *   defect: (cause) => `bug: ${String(cause)}`,
 * });
 * ```
 */
export type Result<T, E> = OkView<T, E> | ErrView<E, T> | DefectView<T, E>;

/**
 * Companion object grouping the **`AsyncResult`-producing** entry points under
 * the matching namespace: {@link AsyncResult.Ok}, {@link AsyncResult.Err},
 * {@link AsyncResult.Do}, {@link AsyncResult.fromExecutor},
 * {@link AsyncResult.fromPromise}, {@link AsyncResult.fromSafePromise},
 * {@link AsyncResult.all}, {@link AsyncResult.allFromDict},
 * {@link AsyncResult.validateAll}, {@link AsyncResult.validateAllFromDict}.
 *
 * @remarks
 * The async sibling of {@link Result}. Statics are grouped by what they
 * **return**, so the pre-lifted constructors, `fromExecutor`,
 * `fromPromise`/`fromSafePromise`, and the async aggregates sit here rather
 * than on {@link Result}; the namespace
 * already conveys "async", so the members drop the `Async` suffix their free
 * functions carry (`AsyncResult.Ok` is `OkAsync`; `AsyncResult.Err` is
 * `ErrAsync`; `AsyncResult.Do` is `DoAsync`; `AsyncResult.all` is `allAsync`;
 * `AsyncResult.allFromDict` is
 * `allFromDictAsync`; `AsyncResult.validateAll` is `validateAllAsync`). Like
 * {@link Result}, the free functions remain the
 * primary, tree-shakeable API; the value `AsyncResult` and the type
 * {@link AsyncResult} share one name.
 *
 * @category Facade
 *
 * @example
 * ```ts
 * import { AsyncResult } from "unthrown";
 * const user = await AsyncResult.fromPromise(
 *   fetchUser(id),
 *   (c, defect) => defect(c),
 * );
 * user.get(); // => the fetched user (on success)
 * ```
 */
export const AsyncResult = {
  Ok: OkAsync,
  Err: ErrAsync,
  Do: DoAsync,
  fromExecutor,
  fromPromise,
  fromSafePromise,
  all: allAsync,
  allFromDict: allFromDictAsync,
  validateAll: validateAllAsync,
  validateAllFromDict: validateAllFromDictAsync,
} as const;

/**
 * The asynchronous counterpart of {@link Result}: an awaitable wrapper carrying
 * the {@link AsyncResultMethods} surface, collapsing to a `Result<T, E>` when
 * `await`-ed. Shares its name with the {@link AsyncResult | companion object}
 * above (value and type are one name); this is the type half.
 *
 * @remarks
 * **Combinator callbacks are synchronous.** A raw `Promise` may never enter an
 * `AsyncResult` method — that would be an un-qualified async boundary, and its
 * rejection would silently become a `Defect`, skipping the triage that
 * {@link fromPromise} forces. To do further async work, re-enter through a
 * qualified boundary and compose it: `ar.flatMap((v) => fromPromise(work(v),
 * qualify))`. The eliminators (`get`, …) return promises; the binds
 * (`flatMap`, `flatTap`, `flatMapErrCases`, `recoverDefect`) additionally accept an
 * `AsyncResult`. Its combinators are documented one per entry — with their
 * async signatures — on {@link AsyncResultMethods}. For "which one do I reach
 * for?", see the [Choosing a combinator](/reference/combinators) guide.
 *
 * To pattern-match an `AsyncResult`, `await` it first: `match(await ar)`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 *
 * @category Facade
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- see OkView (types.ts): the variance annotations require an interface
export interface AsyncResult<out T, out E>
  extends Awaitable<Result<T, E>>, AsyncResultMethods<T, E> {}
