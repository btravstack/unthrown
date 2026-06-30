// Result facade — a discoverable namespace alias for the standalone entry
// points. The free functions remain the primary, tree-shakeable API; this
// object is a separate export, so `import { Ok }` never pulls it in. The value
// `Result` and the type `Result<T, E>` (types.ts) share a name — the
// companion-object pattern. See CLAUDE.md → "Internal design".

import { Err, isDefect, isErr, isOk, Ok } from "./constructors.js";
import { isResult } from "./core.js";
import { Defect } from "./defect.js";
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
 * {@link Result.Defect}, {@link Result.Do}, {@link Result.fromNullable},
 * {@link Result.fromThrowable}, {@link Result.all}, {@link Result.allFromDict},
 * {@link Result.isOk}, {@link Result.isErr}, {@link Result.isDefect},
 * {@link Result.isResult}.
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
 * @example
 * ```ts
 * import { Result } from "unthrown";
 * Result.Ok(1).flatMap((n) => Result.Ok(n + 1)).unwrap(); // 2
 * ```
 */
export const Result = {
  Ok,
  Err,
  Defect,
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

// Re-alias the Result type into this module so a single `export { Result }`
// (from index.ts) carries BOTH the companion object above and the type — value
// and type sharing one name, declaration-merged in one place.
export type Result<T, E> = ResultType<T, E>;

/**
 * Companion object grouping the **`AsyncResult`-producing** entry points under
 * the matching namespace: {@link AsyncResult.fromPromise},
 * {@link AsyncResult.fromSafePromise}, {@link AsyncResult.all},
 * {@link AsyncResult.allFromDict}.
 *
 * @remarks
 * The async sibling of {@link Result}. Statics are grouped by what they
 * **return**, so `fromPromise`/`fromSafePromise` and the async aggregates sit
 * here rather than on {@link Result}; the namespace already conveys "async", so
 * the aggregates drop the `Async` suffix (`AsyncResult.all` is the free function
 * `allAsync`; `AsyncResult.allFromDict` is `allFromDictAsync`). Like
 * {@link Result}, the free functions remain the primary, tree-shakeable API; the
 * value `AsyncResult` and the type {@link AsyncResult} share one name.
 *
 * @example
 * ```ts
 * import { AsyncResult } from "unthrown";
 * const user = await AsyncResult.fromPromise(fetchUser(id), (c) => Defect(c));
 * ```
 */
export const AsyncResult = {
  fromPromise,
  fromSafePromise,
  all: allAsync,
  allFromDict: allFromDictAsync,
} as const;

// Re-alias the AsyncResult type into this module (same companion-object pattern
// as Result above) so one `export { AsyncResult }` carries value + type.
export type AsyncResult<T, E> = AsyncResultType<T, E>;
