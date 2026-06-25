// Boundary interop and aggregation. Every throwing/rejecting boundary is forced
// through `qualify`, which triages each cause into a modeled `E` or a `Defect`;
// there is no path that yields `unknown` in `E`.

import { AsyncRes, defectRes, Res } from "./core.js";
import { type Defect, isDefectMarker } from "./defect.js";
import { err, ok } from "./constructors.js";
import type { AsyncResult, ErrOf, OkOf, Result } from "./types.js";

/** Absence → modeled Err. The sanctioned alternative to shipping an Option. */
export function fromNullable<T, E>(
  value: T | null | undefined,
  onAbsent: () => E,
): Result<NonNullable<T>, E> {
  return value === null || value === undefined ? err(onAbsent()) : ok(value as NonNullable<T>);
}

/** Wrap a throwing sync fn; the caller MUST triage the cause into E or a defect. */
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

/** Wrap a Promise (or thunk); every rejection MUST be triaged into E or a defect. */
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

/** Wrap a Promise asserted not to fail in a modeled way; any rejection is a defect. */
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

/** Collect a tuple of Results. First Err short-circuits; any Defect dominates. */
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
