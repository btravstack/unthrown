// @unthrown/pattern — native `ts-pattern` interop for `Result`.
//
// A `Result` is a discriminated union (`{ tag: "Ok" | "Err" | "Defect" }`), so
// `ts-pattern` matches it directly — narrowing, selection, and `.exhaustive()`
// all work out of the box. This package is just sugar: pattern constructors so
// you can write `P.ok(...)` instead of the raw `{ tag: "Ok", value: ... }`
// object pattern, plus `tag` for matching a `TaggedError` by its `_tag`.
//
//   import { match } from "ts-pattern";
//   import * as P from "@unthrown/pattern";
//
//   match(result)
//     .with(P.ok(), ({ value }) => `ok: ${value}`)
//     .with(P.err(P.tag("NotFound")), () => "404")
//     .with(P.err(), ({ error }) => `error: ${error}`)
//     .with(P.defect(), ({ cause }) => `bug: ${String(cause)}`)
//     .exhaustive();

/**
 * A `ts-pattern` pattern matching the `Ok` variant of a `Result`. With no
 * argument it matches any `Ok`; pass a sub-pattern (e.g. a literal, `P.string`,
 * or `P.select()`) to constrain or select the `value`.
 *
 * @typeParam V - the sub-pattern matched against the `Ok` value.
 */
export function ok(): { tag: "Ok" };
export function ok<const V>(value: V): { tag: "Ok"; value: V };
export function ok(...args: [] | [unknown]): { tag: "Ok"; value?: unknown } {
  return args.length === 0 ? { tag: "Ok" } : { tag: "Ok", value: args[0] };
}

/**
 * A `ts-pattern` pattern matching the `Err` variant of a `Result`. With no
 * argument it matches any `Err`; pass a sub-pattern (e.g. {@link tag}) to
 * constrain or select the `error`.
 *
 * @typeParam V - the sub-pattern matched against the `Err` error.
 */
export function err(): { tag: "Err" };
export function err<const V>(error: V): { tag: "Err"; error: V };
export function err(...args: [] | [unknown]): { tag: "Err"; error?: unknown } {
  return args.length === 0 ? { tag: "Err" } : { tag: "Err", error: args[0] };
}

/**
 * A `ts-pattern` pattern matching the `Defect` variant of a `Result`. With no
 * argument it matches any `Defect`; pass a sub-pattern to constrain or select
 * the unknown `cause`.
 *
 * @typeParam V - the sub-pattern matched against the `Defect` cause.
 */
export function defect(): { tag: "Defect" };
export function defect<const V>(cause: V): { tag: "Defect"; cause: V };
export function defect(...args: [] | [unknown]): { tag: "Defect"; cause?: unknown } {
  return args.length === 0 ? { tag: "Defect" } : { tag: "Defect", cause: args[0] };
}

/**
 * A `ts-pattern` pattern matching any value whose `_tag` equals `value` (e.g. a
 * `TaggedError`). Equivalent to the object pattern `{ _tag: value }`, but reads
 * better nested inside an {@link err} pattern and narrows to the matching
 * variant — including its payload.
 *
 * @typeParam Tag - the string literal tag to match.
 * @param value - the `_tag` to match.
 *
 * @example
 * ```ts
 * .with(P.err(P.tag("Forbidden")), ({ error }) => error.user)
 * ```
 */
export function tag<const Tag extends string>(value: Tag): { _tag: Tag } {
  return { _tag: value };
}
