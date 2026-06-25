// Result constructors and the standalone narrowing guards.

import { Res } from "./core.js";
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
  return new Res<T, never>({ tag: "ok", value });
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
  return new Res<never, E>({ tag: "err", error });
}

/**
 * Type guard: narrow a {@link Result} to an {@link OkView}, exposing `.value`.
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
export function isOk<T, E>(r: Result<T, E>): r is OkView<T> {
  return r.isOk();
}
/**
 * Type guard: narrow a {@link Result} to an {@link ErrView}, exposing `.error`.
 *
 * @returns `true` when `r` is `Err`.
 */
export function isErr<T, E>(r: Result<T, E>): r is ErrView<E> {
  return r.isErr();
}
/**
 * Type guard: narrow a {@link Result} to a {@link DefectView}, exposing `.cause`.
 *
 * @returns `true` when `r` is a `Defect`.
 */
export function isDefect<T, E>(r: Result<T, E>): r is DefectView {
  return r.isDefect();
}
