// Boundary interop and aggregation. Every throwing/rejecting boundary is forced
// through `qualify`, which triages each cause into a modeled `E` or a `Defect`;
// there is no path that yields `unknown` in `E`.

import { AsyncRes, defectRes, errRes, okRes } from "./core.js";
import { type Defect, isDefectMarker } from "./defect.js";
import { err, ok } from "./constructors.js";
import type { AsyncErrOf, AsyncOkOf, AsyncResult, ErrOf, OkOf, Result } from "./types.js";

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
 * The modeled error type is `Exclude<R, Defect>` — the `Defect` arm of
 * `qualify`'s return is **subtracted** from `E`, never inferred into it. So a
 * `qualify` that returns *only* `defect(cause)` yields `E = never` (a defect is
 * out-of-band and must not pollute the error channel); reach for
 * {@link fromSafePromise} when every failure is a defect.
 *
 * @typeParam A - the wrapped function's argument tuple.
 * @typeParam T - the wrapped function's return type.
 * @typeParam R - `qualify`'s return type; the modeled error `E` is
 * `Exclude<R, Defect>` (its `Defect` arm, if any, is subtracted).
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
export function fromThrowable<A extends unknown[], T, R>(
  fn: (...args: A) => T,
  qualify: (cause: unknown) => R,
): (...args: A) => Result<T, Exclude<R, Defect>> {
  type E = Exclude<R, Defect>;
  const triage = qualify as (cause: unknown) => E | Defect;
  return (...args: A): Result<T, E> => {
    try {
      return ok(fn(...args)) as Result<T, E>;
    } catch (cause) {
      return qualifyToResult<T, E>(cause, triage);
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
 * The modeled error type is `Exclude<R, Defect>` — the `Defect` arm of
 * `qualify`'s return is **subtracted** from `E`, never inferred into it. So a
 * `qualify` that returns *only* `defect(cause)` yields `E = never`; when every
 * rejection is a defect, prefer {@link fromSafePromise}.
 *
 * @typeParam T - the resolved value type.
 * @typeParam R - `qualify`'s return type; the modeled error `E` is
 * `Exclude<R, Defect>` (its `Defect` arm, if any, is subtracted).
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
export function fromPromise<T, R>(
  promise: Promise<T> | (() => Promise<T>),
  qualify: (cause: unknown) => R,
): AsyncResult<T, Exclude<R, Defect>> {
  type E = Exclude<R, Defect>;
  const triage = qualify as (cause: unknown) => E | Defect;
  const p = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  const settled: Promise<Result<T, E>> = p.then(
    (value) => okRes<T, E>(value),
    (cause) => qualifyToResult<T, E>(cause, triage),
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
  const settled: Promise<Result<T, never>> = p.then(
    (value) => okRes<T, never>(value),
    (cause) => defectRes<T, never>(cause),
  );
  return new AsyncRes<T, never>(settled);
}

function qualifyToResult<T, E>(
  cause: unknown,
  qualify: (cause: unknown) => E | Defect,
): Result<T, E> {
  try {
    const q = qualify(cause);
    return isDefectMarker(q) ? defectRes<T, E>(q.cause) : errRes<T, E>(q);
  } catch (qErr) {
    // a throw inside qualify is itself a defect
    return defectRes<T, E>(qErr);
  }
}

/**
 * The success channel of {@link all} / {@link allAsync}: a **positional tuple**
 * for a fixed-length input (including the empty tuple), or a homogeneous
 * **array** for a dynamic one.
 *
 * @remarks
 * The split keys off the input's `length`: a fixed tuple has a literal length
 * (`number extends Rs["length"]` is false → keep the positional `Ts`), while a
 * general array has `length: number` (→ collapse to `Ts[number][]`). Checking
 * length rather than `Rs extends [unknown, ...unknown[]]` keeps `all([])` typed
 * as `Result<[], …>` instead of `Result<never[], …>`.
 *
 * @typeParam Rs - the tuple/array of input `Result` types.
 * @typeParam Ts - per-element extracted success types (`OkOf` for `all`,
 * `AsyncOkOf` for `allAsync`).
 * @internal
 */
type AllOk<
  Rs extends readonly unknown[],
  Ts extends readonly unknown[],
> = number extends Rs["length"] ? Ts[number][] : Ts;

/** A record of `Result`s, the input to the object form of {@link all}. */
type ResultRecord = Record<string, Result<unknown, unknown>>;
/** A record of `AsyncResult`s, the input to the object form of {@link allAsync}. */
type AsyncResultRecord = Record<string, AsyncResult<unknown, unknown>>;

/**
 * Fold an array **or** a record of already-settled `Result`s with the
 * `all`/`allAsync` rules: first `Err` wins, any `Defect` dominates. Returns an
 * `Ok` of the same shape (array → array, record → record) on full success.
 *
 * @internal
 */
function foldAll(
  results: readonly Result<unknown, unknown>[] | ResultRecord,
): Result<unknown, unknown> {
  let firstErr: Result<unknown, unknown> | undefined;
  let firstDefect: Result<unknown, unknown> | undefined;

  if (Array.isArray(results)) {
    const values: unknown[] = [];
    for (const r of results) {
      if (r.tag === "Defect") firstDefect ??= r;
      else if (r.tag === "Err") firstErr ??= r;
      else values.push(r.value);
    }
    return firstDefect ?? firstErr ?? ok(values);
  }

  const values: Record<string, unknown> = {};
  for (const [key, r] of Object.entries(results)) {
    if (r.tag === "Defect") firstDefect ??= r;
    else if (r.tag === "Err") firstErr ??= r;
    else values[key] = r.value;
  }
  return firstDefect ?? firstErr ?? ok(values);
}

/**
 * Collect {@link Result}s into a single `Result` of all their success values —
 * from a tuple, an array, or a **record**.
 *
 * @remarks
 * Short-circuits on the **first** `Err` (later entries are not inspected for
 * their error); any `Defect` present **dominates**, winning even over an earlier
 * `Err`. The output mirrors the input shape:
 *
 * - a **fixed tuple** keeps its positional types — `all([ok(1), ok("a")])` is
 *   `Result<[number, string], …>`;
 * - a **dynamic array** `Result<T, E>[]` collapses to `Result<T[], E>`;
 * - a **record** `{ a: Result<A, E>, b: Result<B, E> }` becomes
 *   `Result<{ a: A; b: B }, E>` — handy for named parallel work, no tupling.
 *
 * @example
 * ```ts
 * import { all, ok } from "unthrown";
 * all([ok(1), ok("a"), ok(true)]).unwrap(); // [1, "a", true] (typed [number, string, boolean])
 * all([ok(1), ok(2)] as Result<number, never>[]).unwrap(); // number[]
 * all({ id: ok(1), name: ok("ada") }).unwrap(); // { id: 1, name: "ada" }
 * ```
 */
export function all<Rs extends readonly Result<unknown, unknown>[]>(
  results: readonly [...Rs],
): Result<AllOk<Rs, { [K in keyof Rs]: OkOf<Rs[K]> }>, ErrOf<Rs[number]>>;
export function all<R extends ResultRecord>(
  results: R,
): Result<{ [K in keyof R]: OkOf<R[K]> }, ErrOf<R[keyof R]>>;
export function all(
  results: readonly Result<unknown, unknown>[] | ResultRecord,
): Result<unknown, unknown> {
  return foldAll(results);
}

/**
 * The asynchronous counterpart of {@link all}: combine {@link AsyncResult}s into
 * one `AsyncResult` of all their success values — from a tuple, an array, or a
 * **record**.
 *
 * @remarks
 * The inputs are resolved **concurrently** (order preserved); the resolved
 * `Result`s are then folded with the same rules as {@link all} — first `Err`
 * short-circuits, any `Defect` dominates. As ever, the returned `AsyncResult`'s
 * internal promise never rejects. The output mirrors the input shape: a fixed
 * tuple keeps positional types, a dynamic array `AsyncResult<T, E>[]` collapses
 * to `AsyncResult<T[], E>`, and a record `{ a, b }` becomes
 * `AsyncResult<{ a; b }, E>`.
 *
 * @example
 * ```ts
 * import { allAsync, fromSafePromise } from "unthrown";
 * await allAsync([fromSafePromise(a()), fromSafePromise(b())]); // tuple
 * await allAsync({ a: fromSafePromise(a()), b: fromSafePromise(b()) }); // record
 * ```
 */
export function allAsync<Rs extends readonly AsyncResult<unknown, unknown>[]>(
  results: readonly [...Rs],
): AsyncResult<AllOk<Rs, { [K in keyof Rs]: AsyncOkOf<Rs[K]> }>, AsyncErrOf<Rs[number]>>;
export function allAsync<R extends AsyncResultRecord>(
  results: R,
): AsyncResult<{ [K in keyof R]: AsyncOkOf<R[K]> }, AsyncErrOf<R[keyof R]>>;
export function allAsync(
  results: readonly AsyncResult<unknown, unknown>[] | AsyncResultRecord,
): AsyncResult<unknown, unknown> {
  // Each AsyncResult is a (never-rejecting) thenable, so Promise.all adopts them;
  // `foldAll` then applies the all() rules. The internal promise never rejects.
  if (Array.isArray(results)) {
    const settled = Promise.all(results).then((resolved) =>
      foldAll(resolved as readonly Result<unknown, unknown>[]),
    );
    return new AsyncRes(settled);
  }
  const entries = Object.entries(results);
  const settled = Promise.all(entries.map(([, ar]) => ar)).then((resolved) => {
    const byKey: ResultRecord = {};
    entries.forEach(([key], i) => {
      byKey[key] = resolved[i] as Result<unknown, unknown>;
    });
    return foldAll(byKey);
  });
  return new AsyncRes(settled);
}
