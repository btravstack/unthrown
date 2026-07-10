// Result constructors and the standalone narrowing guards.

import { errRes, okRes } from "./core.js";
import type { AsyncResult, DefectView, ErrView, OkView, Result } from "./types.js";

/**
 * Construct a successful {@link Result}.
 *
 * @typeParam T - the success value type.
 * @param value - the success value to wrap.
 *
 * @example
 * ```ts
 * import { Ok } from "unthrown";
 *
 * Ok(2).map((n) => n + 1); // => Ok(3)
 * Ok(42).get(); // => 42
 * ```
 *
 * @category Constructors
 */
export function Ok<T>(value: T): Result<T, never> {
  return okRes(value);
}

/**
 * Construct a failed {@link Result} carrying a **modeled** error.
 *
 * @typeParam E - the modeled error type.
 * @param error - the domain error to wrap.
 *
 * @example
 * ```ts
 * import { Err } from "unthrown";
 *
 * Err("not_found").map((n) => n + 1); // => Err("not_found") (map skipped)
 * Err("not_found").getErr(); // => "not_found"
 * ```
 *
 * @category Constructors
 */
export function Err<E>(error: E): Result<never, E> {
  return errRes(error);
}

/**
 * Construct a successful {@link AsyncResult} from a pure value — the pre-lifted
 * form of {@link Ok}, sparing you `Ok(value).toAsync()`.
 *
 * @remarks
 * Reach for this on the synchronous/early branch of an `AsyncResult`-returning
 * function, so both branches share one return type without a trailing
 * `.toAsync()`. Named with the `Async` suffix the async free functions carry
 * (`allAsync`, `allFromDictAsync`); the {@link AsyncResult} companion aliases it
 * as `AsyncResult.Ok` (the namespace already says "async", so the suffix drops).
 *
 * @typeParam T - the success value type.
 * @param value - the success value to wrap.
 *
 * @example
 * ```ts
 * import { OkAsync, type AsyncResult } from "unthrown";
 *
 * function loadItems(ids: string[]): AsyncResult<Item[], never> {
 *   if (ids.length === 0) return OkAsync([]); // no more Ok([]).toAsync()
 *   return itemRepository.load(ids);
 * }
 * ```
 *
 * @category Constructors
 */
export function OkAsync<T>(value: T): AsyncResult<T, never> {
  return Ok(value).toAsync();
}

/**
 * Construct a failed {@link AsyncResult} carrying a **modeled** error — the
 * pre-lifted form of {@link Err}, sparing you `Err(error).toAsync()`.
 *
 * @remarks
 * The error-channel mirror of {@link OkAsync}; see it for the naming and the
 * `AsyncResult.Err` companion alias.
 *
 * @typeParam E - the modeled error type.
 * @param error - the domain error to wrap.
 *
 * @example
 * ```ts
 * import { ErrAsync } from "unthrown";
 *
 * ErrAsync("not_found"); // AsyncResult<never, string>
 * ```
 *
 * @category Constructors
 */
export function ErrAsync<E>(error: E): AsyncResult<never, E> {
  return Err(error).toAsync();
}

/**
 * Type guard: narrow a {@link Result} to its `Ok` variant, exposing `.value`.
 *
 * @returns `true` when `r` is `Ok`.
 *
 * @example
 * ```ts
 * import { isOk, Ok, Err, type Result } from "unthrown";
 *
 * isOk(Ok(1)); // => true
 * isOk(Err("boom")); // => false
 *
 * declare const r: Result<number, string>;
 * if (isOk(r)) r.value; // number, narrowed
 * ```
 *
 * @category Guards
 */
export function isOk<T, E>(r: Result<T, E>): r is OkView<T, E> {
  return r.tag === "Ok";
}
/**
 * Type guard: narrow a {@link Result} to its `Err` variant, exposing `.error`.
 *
 * @returns `true` when `r` is `Err`.
 *
 * @example
 * ```ts
 * import { isErr, Ok, Err, type Result } from "unthrown";
 *
 * isErr(Err("boom")); // => true
 * isErr(Ok(1)); // => false
 *
 * declare const r: Result<number, string>;
 * if (isErr(r)) r.error; // string, narrowed
 * ```
 *
 * @category Guards
 */
export function isErr<T, E>(r: Result<T, E>): r is ErrView<E, T> {
  return r.tag === "Err";
}
/**
 * Type guard: narrow a {@link Result} to its `Defect` variant, exposing `.cause`.
 *
 * @remarks
 * A `Defect` has no public constructor — it only arises at a boundary (e.g. a
 * callback throwing inside a combinator). This guard is how you detect one.
 *
 * @returns `true` when `r` is a `Defect`.
 *
 * @example
 * ```ts
 * import { isDefect, Ok } from "unthrown";
 *
 * // A throw inside a combinator is captured as a Defect:
 * const r = Ok(1).map(() => {
 *   throw new Error("boom");
 * });
 * isDefect(r); // => true
 * isDefect(Ok(1)); // => false
 *
 * if (isDefect(r)) r.cause; // unknown, narrowed
 * ```
 *
 * @category Guards
 */
export function isDefect<T, E>(r: Result<T, E>): r is DefectView<T, E> {
  return r.tag === "Defect";
}
