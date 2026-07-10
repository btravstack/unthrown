// Result facade — a discoverable namespace alias for the standalone entry
// points. The free functions remain the primary, tree-shakeable API; this
// object is a separate export, so `import { Ok }` never pulls it in. The value
// `Result` and the type `Result<T, E>` (types.ts) share a name — the
// companion-object pattern. See CLAUDE.md → "Internal design".

import { Err, ErrAsync, isDefect, isErr, isOk, Ok, OkAsync } from "./constructors.js";
import { isResult } from "./core.js";
import { Do } from "./do.js";
import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
} from "./interop.js";
import type { AsyncResult as AsyncResultType, Result as ResultType } from "./types.js";

/**
 * Companion object grouping the **`Result`-producing** entry points under a
 * single, discoverable namespace: {@link Result.Ok}, {@link Result.Err},
 * {@link Result.Do}, {@link Result.fromNullable}, {@link Result.fromThrowable},
 * {@link Result.all}, {@link Result.allFromDict}, {@link Result.isOk},
 * {@link Result.isErr}, {@link Result.isDefect}, {@link Result.isResult}.
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
  all,
  allFromDict,
  isOk,
  isErr,
  isDefect,
  isResult,
} as const;

/**
 * `Result<T, E>` — the core discriminated union. Shares its name with the
 * {@link Result | companion object} above (the value and type are one name); this
 * is the type half.
 *
 * @remarks
 * A `Result` is a discriminated union, so TypeDoc can't list its methods on this
 * alias. Its fluent combinators (`map`, `flatMap`, `match`, `get`, …) are
 * documented one per entry on {@link ResultMethods} — the shared method surface
 * every variant carries. For "which one do I reach for?", see the
 * [Choosing a combinator](/guide/choosing-a-combinator) guide.
 *
 * @category Facade
 */
// Re-alias the Result type into this module so a single `export { Result }`
// (from index.ts) carries BOTH the companion object above and the type — value
// and type sharing one name, declaration-merged in one place.
export type Result<T, E> = ResultType<T, E>;

/**
 * Companion object grouping the **`AsyncResult`-producing** entry points under
 * the matching namespace: {@link AsyncResult.Ok}, {@link AsyncResult.Err},
 * {@link AsyncResult.fromPromise}, {@link AsyncResult.fromSafePromise},
 * {@link AsyncResult.all}, {@link AsyncResult.allFromDict}.
 *
 * @remarks
 * The async sibling of {@link Result}. Statics are grouped by what they
 * **return**, so the pre-lifted constructors, `fromPromise`/`fromSafePromise`,
 * and the async aggregates sit here rather than on {@link Result}; the namespace
 * already conveys "async", so the members drop the `Async` suffix their free
 * functions carry (`AsyncResult.Ok` is `OkAsync`; `AsyncResult.Err` is
 * `ErrAsync`; `AsyncResult.all` is `allAsync`; `AsyncResult.allFromDict` is
 * `allFromDictAsync`). Like {@link Result}, the free functions remain the
 * primary, tree-shakeable API; the value `AsyncResult` and the type
 * {@link AsyncResult} share one name.
 *
 * @category Facade
 *
 * @example
 * ```ts
 * import { AsyncResult } from "unthrown";
 * const user = await AsyncResult.fromPromise(fetchUser(id), (c, defect) => defect(c));
 * user.get(); // => the fetched user (on success)
 * ```
 */
export const AsyncResult = {
  Ok: OkAsync,
  Err: ErrAsync,
  fromPromise,
  fromSafePromise,
  all: allAsync,
  allFromDict: allFromDictAsync,
} as const;

/**
 * `AsyncResult<T, E>` — the async counterpart of {@link Result}. Shares its name
 * with the {@link AsyncResult | companion object} above (value and type are one
 * name); this is the type half.
 *
 * @remarks
 * `AsyncResult` carries the async fluent surface; its combinators (`map`,
 * `flatMap`, `match`, `get`, …) are documented one per entry — with their
 * async signatures — on {@link AsyncResultMethods}. For "which one do I reach
 * for?", see the [Choosing a combinator](/guide/choosing-a-combinator) guide.
 *
 * @category Facade
 */
// Re-alias the AsyncResult type into this module (same companion-object pattern
// as Result above) so one `export { AsyncResult }` carries value + type.
export type AsyncResult<T, E> = AsyncResultType<T, E>;
