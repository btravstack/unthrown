// Defect marker plumbing.

const DEFECT: unique symbol = Symbol("unthrown/Defect");

/**
 * The opaque marker a `qualify` function returns to triage a cause as
 * **unexpected**.
 *
 * @remarks
 * `qualify` (passed to {@link fromPromise} / {@link fromThrowable}) returns
 * `E | Defect`: either a modeled domain error, or a `Defect` produced by the
 * injected `defect` helper to say "this failure is not modeled". A `Defect` is
 * opaque — it carries the original cause for the boundary to convert into the
 * third runtime state of a `Result`. It is **not** a public value; the only way
 * to mint one is the `defect` helper the boundary passes to `qualify`.
 *
 * @internal
 */
export type Defect = {
  readonly [DEFECT]: true;
  readonly cause: unknown;
};

/**
 * Wrap a cause as a `Defect` marker — the value returned from a `qualify`
 * function when a failure is **not** a modeled domain error. The boundary
 * (`fromPromise` / `fromThrowable`) passes this in as `qualify`'s second
 * argument, so domain code never imports it.
 *
 * @param cause - the original thrown/rejected value.
 * @returns an opaque Defect marker carrying `cause`.
 *
 * @internal
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
