// Defect marker plumbing.

const DEFECT: unique symbol = Symbol("unthrown/defect");

/**
 * The marker a `qualify` function returns to triage a cause as **unexpected**.
 *
 * @remarks
 * `qualify` (passed to {@link fromPromise} / {@link fromThrowable}) returns
 * `E | Defect`: either a modeled domain error, or a `Defect` produced by
 * {@link defect} to say "this failure is not modeled". A `Defect` is opaque —
 * it carries the original cause for the boundary to convert into the third
 * runtime state of a `Result`.
 */
export type Defect = {
  readonly [DEFECT]: true;
  readonly cause: unknown;
};

/**
 * Wrap a cause as a {@link Defect} — the value you return from a `qualify`
 * function when a failure is **not** a modeled domain error.
 *
 * @param cause - the original thrown/rejected value.
 * @returns an opaque defect marker carrying `cause`.
 *
 * @example
 * ```ts
 * import { fromPromise, defect } from "unthrown";
 *
 * const user = fromPromise(fetchUser(id), (cause) =>
 *   cause instanceof NotFoundError ? cause : defect(cause),
 * );
 * ```
 */
export function defect(cause: unknown): Defect {
  return { [DEFECT]: true, cause };
}

/**
 * Internal guard for the qualify-time marker. Distinct from the public
 * {@link isDefect} state guard — this one narrows the `E | Defect` union a
 * `qualify` function returns, not a `Result`.
 *
 * @internal
 */
export function isDefectMarker(x: unknown): x is Defect {
  return (
    typeof x === "object" && x !== null && (x as Record<PropertyKey, unknown>)[DEFECT] === true
  );
}
