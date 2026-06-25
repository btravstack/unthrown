// Result constructors and the standalone narrowing guards.

import { errRes, okRes } from "./core.js";
import type { DefectView, ErrView, OkView, Result } from "./types.js";

/**
 * Construct a successful {@link Result}.
 *
 * @typeParam T - the success value type.
 * @param value - the success value to wrap.
 *
 * @example
 * ```ts
 * import { ok } from "unthrown";
 * ok(42).unwrap(); // 42
 * ```
 */
export function ok<T>(value: T): Result<T, never> {
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
 * import { err } from "unthrown";
 * err("not_found").unwrapErr(); // "not_found"
 * ```
 */
export function err<E>(error: E): Result<never, E> {
  return errRes(error);
}

/**
 * Type guard: narrow a {@link Result} to its `Ok` variant, exposing `.value`.
 *
 * @returns `true` when `r` is `Ok`.
 *
 * @example
 * ```ts
 * import { isOk, type Result } from "unthrown";
 * declare const r: Result<number, string>;
 * if (isOk(r)) r.value; // number, narrowed
 * ```
 */
export function isOk<T, E>(r: Result<T, E>): r is OkView<T, E> {
  return r.tag === "Ok";
}
/**
 * Type guard: narrow a {@link Result} to its `Err` variant, exposing `.error`.
 *
 * @returns `true` when `r` is `Err`.
 */
export function isErr<T, E>(r: Result<T, E>): r is ErrView<E, T> {
  return r.tag === "Err";
}
/**
 * Type guard: narrow a {@link Result} to its `Defect` variant, exposing `.cause`.
 *
 * @returns `true` when `r` is a `Defect`.
 */
export function isDefect<T, E>(r: Result<T, E>): r is DefectView<T, E> {
  return r.tag === "Defect";
}
