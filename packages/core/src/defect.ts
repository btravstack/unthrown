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

const MERGED: unique symbol = Symbol("unthrown/MergedTriage");

/**
 * The branded wrapper {@link mergeTags} produces: a single handler that
 * deliberately treats **every** error of the union the same way, accepted by
 * the triage combinators (`mapErr`, `flatMapErr`, `recoverErr`, `tapErr`,
 * `flatTapErr`) in place of the per-tag object.
 *
 * @remarks
 * This is the **explicit opt-out of exhaustiveness** — a distinct, greppable
 * call, not a fallthrough branch hiding inside the triage object. It is also
 * the only form for an error type whose members carry no `_tag` (or a mixed
 * union), where per-tag triage is impossible.
 *
 * @typeParam E - the error union being handled uniformly.
 * @typeParam R - what the handler returns.
 *
 * @category Tagged errors
 */
export type MergedTriage<E, R> = {
  readonly [MERGED]: true;
  readonly handler: (error: E, defect: (cause: unknown) => Defect) => R;
};

/**
 * Wrap a single callback as a {@link MergedTriage} — the **explicit** uniform
 * form of error triage, accepted by `mapErr` / `flatMapErr` / `recoverErr` /
 * `tapErr` / `flatTapErr` in place of the exhaustive per-tag object.
 *
 * @remarks
 * The per-tag triage object is exhaustive by design: adding a tag to `E`
 * breaks every consuming call site. `mergeTags` is the sanctioned way to say
 * "all tags merged, treated identically" — visible at the call site instead
 * of hiding as a fallthrough, and greppable/lintable when a codebase wants to
 * audit its opt-outs. A new tag flows into a merged handler silently; that is
 * the trade the call site explicitly declares.
 *
 * In the **transformers** the callback receives the injected `defect` helper
 * as its second argument (the same injection `qualify` gets), so a
 * qualify-style triage over a non-`_tag`-discriminated union stays possible:
 * `mapErr(mergeTags((e, defect) => (isRetryable(e) ? e : defect(e))))`. In the
 * **observers** a `Defect`-producing callback is rejected at compile time —
 * observation never consumes the error.
 *
 * @typeParam E - the error union being handled uniformly.
 * @typeParam R - what the handler returns.
 * @param fn - the uniform handler (its `defect` parameter is optional to
 * declare).
 * @returns the branded wrapper the triage combinators accept.
 *
 * @example
 * ```ts
 * result.tapErr(mergeTags((err) => logger.error(err)));
 * result.mapErr(mergeTags((err) => new WrappedError({ cause: err })));
 * ```
 *
 * @category Tagged errors
 */
export function mergeTags<E, R>(
  fn: (error: E, defect: (cause: unknown) => Defect) => R,
): MergedTriage<E, R> {
  return { [MERGED]: true, handler: fn };
}

/**
 * Internal guard for the {@link mergeTags} wrapper — how the triage runtime
 * tells the uniform form from the per-tag object.
 *
 * @internal
 */
export function isMergedTriage(x: unknown): x is MergedTriage<unknown, unknown> {
  return (
    typeof x === "object" && x !== null && (x as Record<PropertyKey, unknown>)[MERGED] === true
  );
}
