// Defect marker plumbing — the `E | Defect` value a `qualify` function returns
// to triage a cause as unexpected. The DEFECT symbol discriminates the marker;
// `Defect` (the type) names both this qualify-time marker and the runtime state.

const DEFECT: unique symbol = Symbol("unthrown/defect");

/** A cause triaged as unexpected at a boundary. Returned from `qualify`. */
export type Defect = {
  readonly [DEFECT]: true;
  readonly cause: unknown;
};

/**
 * Wrap a cause as a defect — the value you return from a `qualify` function
 * when a failure is NOT a modeled domain error.
 */
export function defect(cause: unknown): Defect {
  return { [DEFECT]: true, cause };
}

// Internal guard for the qualify-time marker. Distinct from the public
// `isDefect(result)` state guard — this one narrows the `E | Defect` union a
// `qualify` function returns, not a Result. Not part of the public surface.
export function isDefectMarker(x: unknown): x is Defect {
  return (
    typeof x === "object" && x !== null && (x as Record<PropertyKey, unknown>)[DEFECT] === true
  );
}
