// Boundary interop and aggregation. Every throwing/rejecting boundary is forced
// through `qualify`, which triages each cause into a modeled `E` or a `Defect`;
// there is no path that yields `unknown` in `E`.

import { AsyncRes, defectRes, Res } from "./core.js";
import { type Defect, isDefectMarker } from "./defect.js";
import { err, ok } from "./constructors.js";
import type { AsyncResult, ErrOf, OkOf, Result } from "./types.js";

/**
 * Bridge a nullable value into a {@link Result}: absence becomes a **modeled**
 * `Err`. The sanctioned alternative to an `Option` type.
 *
 * @remarks
 * `null` and `undefined` map to `err(onAbsent())`; any other value (including
 * falsy ones like `0`, `""`, `false`) maps to `Ok`.
 *
 * @typeParam T - the (nullable) value type.
 * @typeParam E - the error produced when the value is absent.
 * @param value - the possibly-absent value.
 * @param onAbsent - lazily produces the error for the absent case.
 *
 * @example
 * ```ts
 * import { fromNullable } from "unthrown";
 * fromNullable(map.get(key), () => "missing").unwrap();
 * ```
 */
export function fromNullable<T, E>(
  value: T | null | undefined,
  onAbsent: () => E,
): Result<NonNullable<T>, E> {
  return value === null || value === undefined ? err(onAbsent()) : ok(value as NonNullable<T>);
}

/**
 * Wrap a throwing synchronous function so it returns a {@link Result} instead of
 * throwing.
 *
 * @remarks
 * `qualify` **must** triage every thrown cause into a modeled error `E` or a
 * {@link Defect} (via {@link defect}) — there is no path that leaves `unknown`
 * in `E`. A throw inside `qualify` itself is treated as a `Defect`.
 *
 * @typeParam A - the wrapped function's argument tuple.
 * @typeParam T - the wrapped function's return type.
 * @typeParam E - the modeled error type.
 * @param fn - the throwing function to wrap.
 * @param qualify - triages a thrown cause into `E` or a `Defect`.
 * @returns a function with the same arguments returning `Result<T, E>`.
 *
 * @example
 * ```ts
 * import { fromThrowable, defect } from "unthrown";
 * const parse = fromThrowable(JSON.parse, (cause) => defect(cause));
 * parse("{}").unwrap();
 * ```
 */
export function fromThrowable<A extends unknown[], T, E>(
  fn: (...args: A) => T,
  qualify: (cause: unknown) => E | Defect,
): (...args: A) => Result<T, E> {
  return (...args: A): Result<T, E> => {
    try {
      return ok(fn(...args)) as Result<T, E>;
    } catch (cause) {
      return qualifyToResult<T, E>(cause, qualify);
    }
  };
}

/**
 * Wrap a `Promise` (or a thunk producing one) as an {@link AsyncResult}, forcing
 * every rejection to be triaged.
 *
 * @remarks
 * `qualify` **must** map each rejection cause into a modeled error `E` or a
 * {@link Defect}. The returned `AsyncResult`'s internal promise never rejects;
 * `await`-ing it always yields a `Result`. A throw inside `qualify` is itself a
 * `Defect`.
 *
 * @typeParam T - the resolved value type.
 * @typeParam E - the modeled error type.
 * @param promise - the promise, or a thunk returning one.
 * @param qualify - triages a rejection cause into `E` or a `Defect`.
 *
 * @example
 * ```ts
 * import { fromPromise, defect } from "unthrown";
 * const user = await fromPromise(fetchUser(id), (cause) =>
 *   cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
 * );
 * ```
 */
export function fromPromise<T, E>(
  promise: Promise<T> | (() => Promise<T>),
  qualify: (cause: unknown) => E | Defect,
): AsyncResult<T, E> {
  const p = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  const settled: Promise<Res<T, E>> = p.then(
    (value) => new Res<T, E>({ tag: "ok", value }),
    (cause) => qualifyToResult<T, E>(cause, qualify) as Res<T, E>,
  );
  return new AsyncRes<T, E>(settled);
}

/**
 * Wrap a `Promise` asserted **not** to fail in any modeled way: any rejection
 * becomes a `Defect`.
 *
 * @remarks
 * Use this only when a rejection genuinely indicates a bug rather than an
 * anticipated outcome — the error channel is `never`, so there is nothing to
 * triage. (`await`-ing still yields a `Result`; it never throws.)
 *
 * @typeParam T - the resolved value type.
 * @param promise - the promise, or a thunk returning one.
 */
export function fromSafePromise<T>(
  promise: Promise<T> | (() => Promise<T>),
): AsyncResult<T, never> {
  const p = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  const settled: Promise<Res<T, never>> = p.then(
    (value) => new Res<T, never>({ tag: "ok", value }),
    (cause) => new Res<T, never>({ tag: "defect", cause }),
  );
  return new AsyncRes<T, never>(settled);
}

function qualifyToResult<T, E>(
  cause: unknown,
  qualify: (cause: unknown) => E | Defect,
): Result<T, E> {
  try {
    const q = qualify(cause);
    return isDefectMarker(q) ? defectRes<T, E>(q.cause) : (err(q) as Result<T, E>);
  } catch (qErr) {
    // a throw inside qualify is itself a defect
    return defectRes<T, E>(qErr);
  }
}

/**
 * Collect a tuple of {@link Result}s into a single `Result` of the tuple of
 * success values.
 *
 * @remarks
 * Short-circuits on the **first** `Err` (later entries are not inspected for
 * their error); any `Defect` present **dominates**, winning even over an earlier
 * `Err`. Positional types are preserved, so `all([ok(1), ok("a")])` is
 * `Result<[number, string], …>`.
 *
 * @typeParam Rs - the tuple of input `Result` types.
 * @param results - the results to combine.
 *
 * @example
 * ```ts
 * import { all, ok } from "unthrown";
 * all([ok(1), ok("a"), ok(true)]).unwrap(); // [1, "a", true]
 * ```
 */
export function all<Rs extends readonly Result<unknown, unknown>[]>(
  results: readonly [...Rs],
): Result<{ [K in keyof Rs]: OkOf<Rs[K]> }, ErrOf<Rs[number]>> {
  const values: unknown[] = [];
  let firstErr: Result<unknown, unknown> | undefined;
  let firstDefect: Result<unknown, unknown> | undefined;

  for (const r of results) {
    const s = (r as Res<unknown, unknown>)._state;
    if (s.tag === "defect") firstDefect ??= r;
    else if (s.tag === "err") firstErr ??= r;
    else values.push(s.value);
  }

  if (firstDefect)
    return firstDefect as Result<{ [K in keyof Rs]: OkOf<Rs[K]> }, ErrOf<Rs[number]>>;
  if (firstErr) return firstErr as Result<{ [K in keyof Rs]: OkOf<Rs[K]> }, ErrOf<Rs[number]>>;
  return ok(values as { [K in keyof Rs]: OkOf<Rs[K]> });
}
