// unthrown — public type surface. Pure types, no runtime.

import type { Defect, MergedTriage } from "./defect.js";

/**
 * Flatten an intersection into a single object literal so accumulated `bind` /
 * `let` scopes display cleanly (`{ a; b }` rather than `{ a } & { b }`).
 *
 * @internal
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * The scope produced by a `bind` / `let` step: `T` with `K` added (as a readonly
 * property of type `U`). `Omit<T, K>` first drops any existing `K`, so re-binding
 * a name **overwrites** it — matching the runtime spread — rather than producing
 * an unsound `T[K] & U` intersection.
 *
 * @internal
 */
export type Bound<T, K extends string, U> = Prettify<Omit<T, K> & { readonly [P in K]: U }>;

/**
 * Compile-time rejection of a thenable callback result — the type-level
 * enforcement of "combinator callbacks are synchronous" (see the
 * {@link AsyncResult} remarks).
 *
 * @remarks
 * Resolves to `unknown` (a no-op in an intersection) for any non-thenable `R`,
 * and to an explanatory string-literal type when `R` is a `PromiseLike` — so an
 * `async` callback fails to compile with the explanation in the error. Without
 * this, `async () => …` would be assignable to `() => void`, and its rejection
 * would escape the pipeline as an unhandled rejection instead of a `Defect`.
 * Lift async work with {@link fromPromise} and compose it with `flatMap`.
 *
 * @typeParam R - the callback's inferred return type.
 * @category Types
 */
export type NotThenable<R> = [R] extends [PromiseLike<unknown>]
  ? "unthrown: combinator callbacks are synchronous — lift async work with fromPromise and compose with flatMap"
  : unknown;

/**
 * The union-wide counterpart of {@link NotThenable}: rejects a thenable
 * **member** of `R`. A triage object's result type is the union of every
 * branch's return, so a single async branch would hide inside a non-thenable
 * union — `Extract` finds it where `[R] extends [PromiseLike]` would not.
 *
 * @typeParam R - the union of the triage branches' return types.
 * @internal
 */
export type NoThenables<R> = 0 extends 1 & R
  ? unknown // an `any` return (e.g. a test mock) is not evidence of a thenable
  : [Extract<R, PromiseLike<unknown>>] extends [never]
    ? unknown
    : "unthrown: combinator callbacks are synchronous — lift async work with fromPromise and compose with flatMap";

/**
 * Rejects a `Defect`-producing merged handler on an **observer** — observation
 * never consumes the error, so there is nothing a `Defect` marker could
 * replace. Resolves to a no-op `unknown` when `R` carries no `Defect` arm.
 *
 * @typeParam R - the merged handler's inferred return type.
 * @internal
 */
export type NoDefects<R> = 0 extends 1 & R
  ? unknown // an `any` return (e.g. a test mock) is not evidence of a Defect
  : [Extract<R, Defect>] extends [never]
    ? unknown
    : "unthrown: an observer cannot convert an error to a Defect — do that in a transformer (mapErr / flatMapErr) instead";

/**
 * The `_tag` discriminants of the tagged members of an error union (untagged
 * members contribute nothing).
 *
 * @internal
 */
type ErrTagsOf<E> = E extends { _tag: string } ? E["_tag"] : never;

/**
 * The union of an inferred triage object's branch return types — what the
 * error-transforming combinators compute their outgoing types from. A branch
 * that `throw`s has return type `never` and contributes nothing.
 *
 * @typeParam H - the inferred triage object type.
 * @internal
 */
export type TriageReturns<H> = {
  [K in keyof H]: H[K] extends (...args: never[]) => infer R ? R : never;
}[keyof H];

/**
 * The outgoing type a triage object produces: the union of the branch returns
 * with the `Defect` arm **subtracted** — the same `Exclude<R, Defect>`
 * inference as the boundary `qualify` (Thesis #3). A branch that returns
 * `defect(cause)` (or throws) contributes nothing to the modeled channel.
 *
 * @typeParam H - the inferred triage object type.
 * @internal
 */
export type TriageOut<H> = Exclude<TriageReturns<H>, Defect>;

/**
 * Rejects a triage key that is not an error `_tag` of `E` — inference from
 * the object literal bypasses excess-property freshness, so a typo'd tag
 * would otherwise be silently unreachable. Resolves to a no-op
 * `unknown` when every key is known, and to an explanatory string-literal type
 * (naming the offending keys) otherwise.
 *
 * @typeParam E - the error union being triaged.
 * @typeParam H - the inferred triage object type.
 * @internal
 */
export type TriageKeysOk<E, H> = H extends (...args: never[]) => unknown
  ? // a bare function would structurally satisfy the all-optional partial shape
    // (its keyof is never) and then silently observe nothing at runtime
    "unthrown: triage takes an object of per-tag branches, not a callback — for uniform handling wrap it: mergeTags(callback)"
  : [Exclude<keyof H, ErrTagsOf<E>>] extends [never]
    ? unknown
    : `unthrown: unknown triage key(s): ${Exclude<keyof H, ErrTagsOf<E>> &
        string} — every branch must match an error _tag (uniform handling is mergeTags(fn))`;

/**
 * The **triage object** the error-transforming combinators
 * ({@link ResultMethods.mapErr | mapErr}, {@link ResultMethods.flatMapErr | flatMapErr},
 * {@link ResultMethods.recoverErr | recoverErr}) require: one branch per error
 * `_tag`, exhaustive by construction. The explicit opt-out is the separate
 * {@link mergeTags} wrapper — never a branch inside the object.
 *
 * @remarks
 * The object form is **exhaustive, full stop**: one branch for every tag in
 * `E`, available only when every member of `E` carries a `_tag`. Miss a tag
 * and it will not compile — adding a new error tag to `E` surfaces every
 * triage site. There is deliberately no fallthrough branch inside the object;
 * the explicit opt-out of exhaustiveness is the separate, greppable
 * {@link mergeTags} wrapper (also the only form for an untagged or mixed `E`,
 * where per-tag triage is impossible).
 *
 * Each branch receives the narrowed variant for its tag **and the injected
 * `defect` helper** as its second argument — the same injection `qualify`
 * receives at a boundary (Thesis #3), and the sanctioned way to deliberately
 * convert a tag to a `Defect`: `DriverError: (e, defect) => defect(e.cause)`.
 * The combinator's result type is the **union of the branch returns with the
 * `Defect` arm subtracted** (`Exclude<R, Defect>`, exactly the boundary
 * inference) — so a defect branch contributes nothing to the modeled channel.
 * A branch that `throw`s still becomes a `Defect` too (the safety-net
 * invariant; its `never` return likewise contributes nothing), but prefer the
 * lint-clean `defect(...)` return.
 *
 * At runtime, an error whose `_tag` has no branch (possible only outside the
 * typed contract — a widened cast, a JS caller) becomes a `Defect` carrying
 * that error as its cause: an unmodeled tag is an unmodeled failure.
 *
 * @typeParam E - the error union being triaged.
 * @typeParam R - what every branch returns (inferred as the union of the
 * branch returns).
 *
 * @example
 * ```ts
 * result.mapErr({
 *   RecordNotFound: () => new NotFoundException(id),
 *   DriverError: (e, defect) => defect(e.cause), // deliberate defect; leaves E
 * });
 * // uniform handling is the separate, explicit wrapper — not a branch:
 * result.mapErr(mergeTags((e) => new WrappedError({ cause: e })));
 * ```
 *
 * @category Types
 */
export type ErrTriage<E, R> = {
  readonly [K in ErrTagsOf<E>]: (
    error: Extract<E, { _tag: K }>,
    defect: (cause: unknown) => Defect,
  ) => R | Defect;
} & {
  // when `E` has untagged members no set of tag branches can cover them, so
  // this conditional key makes the object form unsatisfiable (it resolves to
  // no key at all when `E` is fully tagged) — the message IS the key
  readonly [K in [Exclude<E, { _tag: string }>] extends [never]
    ? never
    : "unthrown: this error union has untagged members — per-tag triage cannot cover them; use mergeTags(fn)"]: never;
};

/**
 * The **partial triage object** the error observers
 * ({@link ResultMethods.tapErr | tapErr}, {@link ResultMethods.flatTapErr | flatTapErr})
 * take — the same per-tag shape as {@link ErrTriage}, with **every branch
 * optional**.
 *
 * @remarks
 * Observation is inherently partial-safe: a tag without a branch is simply not
 * observed and flows through unchanged, so nothing can be mis-routed by a
 * missing branch — which is why exhaustiveness is not required here, while the
 * transformers ({@link ErrTriage}) do require it. Per-tag observation needs no
 * manual `_tag` narrowing (`tapErr({ Conflict: alert })`); uniform observation
 * is the explicit {@link mergeTags} wrapper
 * (`tapErr(mergeTags((e) => log(e)))`). Branches do **not** receive the
 * injected `defect` helper — an observer's return never replaces the error
 * (`tapErr` ignores it; `flatTapErr` only threads a *new* effect failure), so
 * there is nothing for a `Defect` marker to replace.
 *
 * @typeParam E - the error union being observed.
 * @typeParam R - what a branch returns.
 *
 * @category Types
 */
export type ErrTriagePartial<E, R> = {
  readonly [K in ErrTagsOf<E>]?: (error: Extract<E, { _tag: K }>) => R;
};

/**
 * The fluent method surface every {@link Result} variant carries — the
 * combinators (`map`, `flatMap`, `mapErr`, `match`, `get`, …), documented one
 * per entry below. Factored out so the three variants ({@link OkView},
 * {@link ErrView}, {@link DefectView}) can each intersect it; {@link AsyncResult}
 * mirrors this surface with async signatures.
 *
 * @remarks
 * This type exists to **document** the surface and to power narrowing — not to be
 * authored against. You obtain it by holding a `Result` (or `AsyncResult`), never
 * by implementing your own `Result`-like; treat it as read-only reference.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @category Methods
 */
export type ResultMethods<out T, out E> = {
  /**
   * Transform the success value with `f`.
   *
   * Runs `f` only on `Ok`; `Err` and `Defect` pass through untouched. If `f`
   * throws, the thrown value is captured as a `Defect`.
   *
   * An async callback is rejected at compile time ({@link NotThenable}).
   *
   * @typeParam U - the mapped success type.
   * @param f - maps the current success value to a new one.
   */
  map<U>(f: (value: T) => U & NotThenable<U>): Result<U, E>;
  /**
   * Sequence a dependent, `Result`-returning step (monadic bind).
   *
   * Runs `f` only on `Ok`; `Err` and `Defect` pass through. The error channels
   * combine, widening to `E | E2`. If `f` throws, the throw becomes a `Defect`.
   *
   * @typeParam U - the success type of the next step.
   * @typeParam E2 - the error type the next step may introduce.
   * @param f - produces the next `Result` from the current success value.
   */
  flatMap<U, E2>(f: (value: T) => Result<U, E2>): Result<U, E | E2>;
  /**
   * Run a side effect on the success value and pass the `Result` through
   * unchanged.
   *
   * Runs only on `Ok`. If `f` throws, the throw becomes a `Defect`. An async
   * callback is rejected at compile time ({@link NotThenable}).
   *
   * @remarks
   * `f`'s return value is **ignored** — a `Result` returned by the effect
   * compiles but is discarded, `Err` and all. If the effect can fail, sequence
   * it instead of tapping it: a `Result`-returning effect goes in
   * {@link ResultMethods.flatTap | flatTap}; an `AsyncResult`-returning effect
   * cannot be sequenced from the sync surface — lift the chain with
   * {@link ResultMethods.toAsync | toAsync} and use the async
   * {@link AsyncResultMethods.flatTap | flatTap} (which accepts both).
   *
   * @param f - the side effect (its return value is ignored).
   */
  tap<R>(f: (value: T) => R & NotThenable<R>): Result<T, E>;
  /**
   * Run a **failable** side effect on the success value, keeping the original
   * value but threading the effect's error.
   *
   * @remarks
   * This is to {@link ResultMethods.tap | tap} what
   * {@link ResultMethods.flatMap | flatMap} is to {@link ResultMethods.map | map}:
   * `f` returns a `Result`, but its **success value is discarded** — on success
   * the original value flows through (`Result<T, E | E2>`), while an `Err` (or
   * `Defect`) from `f` short-circuits. Runs only on `Ok`; `Err` and `Defect` pass
   * through. If `f` throws, the throw becomes a `Defect`. Use it for a validation
   * or write whose _result_ matters but whose _value_ you don't need.
   *
   * @typeParam E2 - the error type the effect may introduce.
   * @param f - the failable side effect; its `Ok` value is ignored.
   */
  flatTap<E2>(f: (value: T) => Result<unknown, E2>): Result<T, E | E2>;
  /**
   * Do-notation: run `f` for a `Result` and **bind its value** under `name` in
   * an accumulating object scope.
   *
   * @remarks
   * Begin a chain with {@link Do} (an empty object scope) and grow it step by
   * step. `f` receives the scope accumulated so far and returns a `Result`; on
   * `Ok` the value is added as `{ ...scope, [name]: value }`, on `Err`/`Defect`
   * the chain short-circuits. Errors union (`E | E2`). A throw becomes a
   * `Defect` — as does calling `bind` on a non-object scope (e.g. `Ok(5).bind`),
   * which is misuse: the scope is always an object inside a real `Do()` chain.
   * (`let` is the pure-value counterpart.)
   *
   * @typeParam K - the key the bound value is stored under.
   * @typeParam U - the bound value type.
   * @typeParam E2 - the error type `f` may introduce.
   * @param name - the scope key.
   * @param f - produces a `Result` from the accumulated scope.
   */
  bind<K extends string, U, E2>(
    name: K,
    f: (scope: T) => Result<U, E2>,
  ): Result<Bound<T, K, U>, E | E2>;
  /**
   * Do-notation: run `f` for a **plain value** and bind it under `name` in the
   * accumulating object scope. The pure-value counterpart of {@link ResultMethods.bind | bind}.
   *
   * @remarks
   * `f` receives the scope and returns a value (not a `Result`); it is added as
   * `{ ...scope, [name]: value }`. Runs only on `Ok`; `Err`/`Defect` pass
   * through. A throw becomes a `Defect`. An async callback is rejected at
   * compile time ({@link NotThenable}).
   *
   * @typeParam K - the key the value is stored under.
   * @typeParam U - the value type.
   * @param name - the scope key.
   * @param f - computes a value from the accumulated scope.
   */
  let<K extends string, U>(name: K, f: (scope: T) => U & NotThenable<U>): Result<Bound<T, K, U>, E>;
  /**
   * Replace the success value with a constant `value`.
   *
   * Runs only on `Ok`; `Err` and `Defect` pass through.
   *
   * @typeParam U - the replacement value type.
   */
  as<U>(value: U): Result<U, E>;
  /**
   * Drop the success value, collapsing the success type to `void`.
   *
   * The named form of `map(() => undefined)`. Runs only on `Ok` (the value is
   * replaced with `undefined`); `Err` and `Defect` pass through. Unlike
   * `as(undefined)` — which produces `Result<undefined, E>` — the success type
   * is `void`: the value's story ends here.
   */
  discard(): Result<void, E>;

  /**
   * Transform the modeled error, **triaging it by tag** — one branch per
   * `_tag`, exhaustive unless an explicit `Else` branch is present
   * ({@link ErrTriage}).
   *
   * Runs the matching branch only on `Err`; `Ok` passes through and a `Defect`
   * is **never** touched. The outgoing error type is the union of the branch
   * returns — a branch that throws (becoming a `Defect`) contributes nothing.
   * An error whose tag has no branch and no `Else` (unreachable through
   * well-typed code) becomes a `Defect` carrying it. An async branch is
   * rejected at compile time ({@link NotThenable}).
   *
   * @typeParam H - the inferred triage object type (the outgoing error type is
   * the union of its branch returns).
   * @param handlers - the triage object: per-tag branches, each mapping its
   * error to a new one (or `Else` for the deliberate blanket case).
   */
  /**
   * {@link mergeTags} overload of {@link ResultMethods.mapErr | mapErr}: one
   * explicit uniform handler for every tag (and the only form for an untagged
   * or mixed `E`). The handler receives the injected `defect` helper; the
   * `Defect` arm of its return is subtracted from the outgoing error type.
   */
  mapErr<R>(handlers: MergedTriage<E, R> & NoThenables<R>): Result<T, Exclude<R, Defect>>;
  mapErr<H extends ErrTriage<E, unknown>>(
    handlers: H & TriageKeysOk<E, H> & NoThenables<TriageReturns<H>>,
  ): Result<T, TriageOut<H>>;

  /**
   * Sequence from an `Err` by producing another `Result` — the error-channel
   * mirror of {@link ResultMethods.flatMap | flatMap}, **triaging the error by
   * tag** ({@link ErrTriage}: exhaustive unless `Else` is present).
   *
   * Runs the matching branch only on `Err`; `Ok` and `Defect` pass through. If
   * a branch throws, the throw becomes a `Defect`; an unhandled tag
   * (unreachable through well-typed code) becomes a `Defect` carrying the
   * error. To keep a tag's error as-is, re-emit it: `Tag: (e) => Err(e)`.
   *
   * @typeParam H - the inferred triage object type; the result's channels are
   * the unions of the branch-returned `Result`s' channels (via {@link OkOf} /
   * {@link ErrOf}).
   * @param handlers - the triage object: per-tag branches, each producing a
   * fallback `Result` from its error.
   */
  /**
   * {@link mergeTags} overload of {@link ResultMethods.flatMapErr | flatMapErr}:
   * one explicit uniform handler producing a fallback `Result` (or
   * `defect(cause)`) for every tag.
   */
  flatMapErr<R extends Result<unknown, unknown> | Defect>(
    handlers: MergedTriage<E, R>,
  ): Result<T | OkOf<R>, ErrOf<R>>;
  flatMapErr<H extends ErrTriage<E, Result<unknown, unknown>>>(
    handlers: H & TriageKeysOk<E, H>,
  ): Result<T | OkOf<TriageReturns<H>>, ErrOf<TriageReturns<H>>>;

  /**
   * Recover from an `Err` by producing a success value, emptying the error
   * channel — **triaging the error by tag** ({@link ErrTriage}: exhaustive
   * unless `Else` is present). Pairs with
   * {@link ResultMethods.recoverDefect | recoverDefect}.
   *
   * @remarks
   * The result type is `Result<T | U, never>`, but `never` describes only the
   * **error** channel — a `Defect` can still be present at runtime, so do not
   * read `never` as "total". Runs the matching branch only on `Err`; `Ok` and
   * `Defect` pass through. If a branch throws, the throw becomes a `Defect`;
   * so does an unhandled tag (unreachable through well-typed code). An async
   * branch is rejected at compile time ({@link NotThenable}).
   *
   * @typeParam H - the inferred triage object type (the recovered success type
   * is the union of its branch returns).
   * @param handlers - the triage object: per-tag branches, each producing a
   * success value from its error.
   */
  /**
   * {@link mergeTags} overload of {@link ResultMethods.recoverErr | recoverErr}:
   * one explicit uniform recovery for every tag (a `defect(cause)` return
   * stays a `Defect`, not a recovery).
   */
  recoverErr<R>(
    handlers: MergedTriage<E, R> & NoThenables<R>,
  ): Result<T | Exclude<R, Defect>, never>;
  recoverErr<H extends ErrTriage<E, unknown>>(
    handlers: H & TriageKeysOk<E, H> & NoThenables<TriageReturns<H>>,
  ): Result<T | TriageOut<H>, never>;

  /**
   * Run a side effect on the error — **observed by tag** through a *partial*
   * triage object ({@link ErrTriagePartial}: every branch optional, `Else`
   * included) — and pass the `Result` through unchanged.
   *
   * Runs the matching branch only on `Err`; a tag without a branch is simply
   * not observed. Uniform observation is `{ Else: (e) => log(e) }`. If a
   * branch throws, the result is a `Defect` whose cause is an `AggregateError`
   * of `[thrown, original failure]` — observing a failure never destroys it.
   * An async branch is rejected at compile time ({@link NotThenable}).
   *
   * @remarks
   * As with {@link ResultMethods.tap | tap}, a branch's return value is
   * ignored — a failable `Result`-returning effect belongs in
   * {@link ResultMethods.flatTapErr | flatTapErr}; an `AsyncResult`-returning
   * one needs the chain lifted with {@link ResultMethods.toAsync | toAsync}
   * first (the async {@link AsyncResultMethods.flatTapErr | flatTapErr}
   * accepts both).
   *
   * @typeParam H - the inferred partial triage object type.
   * @param handlers - per-tag side-effect branches (returns are ignored).
   */
  /**
   * {@link mergeTags} overload of {@link ResultMethods.tapErr | tapErr}:
   * observe every error uniformly (`tapErr(mergeTags((e) => log(e)))`). A
   * `Defect`-producing handler is rejected — observation never consumes.
   */
  tapErr<R>(handlers: MergedTriage<E, R> & NoThenables<R> & NoDefects<R>): Result<T, E>;
  tapErr<H extends ErrTriagePartial<E, unknown>>(
    handlers: H & TriageKeysOk<E, H> & NoThenables<TriageReturns<H>>,
  ): Result<T, E>;

  /**
   * Run a **failable** side effect on the error, keeping the original error but
   * threading the effect's own error.
   *
   * @remarks
   * The error-channel mirror of {@link ResultMethods.flatTap | flatTap}: `f`
   * returns a `Result`, but its **success value is discarded** — on the effect's
   * `Ok` the original `Err` flows through unchanged, while an `Err` (or `Defect`)
   * from `f` short-circuits and threads its error (`Result<T, E | E2>`). Runs only
   * on `Err`; `Ok` and `Defect` pass through. If `f` throws, the result is a
   * `Defect` whose cause is an `AggregateError` of `[thrown, original failure]` —
   * observing a failure never destroys it. Use it for a failable effect _during_
   * error handling (e.g. writing the error to an audit log that may itself fail).
   *
   * Like `tapErr`, it takes a *partial* triage object
   * ({@link ErrTriagePartial}) — a tag without a branch is not observed.
   *
   * @typeParam H - the inferred partial triage object type; the threaded error
   * type is the union of the branch-returned `Result`s' error channels.
   * @param handlers - per-tag failable side-effect branches; each `Ok` value is
   * ignored.
   */
  /**
   * {@link mergeTags} overload of {@link ResultMethods.flatTapErr | flatTapErr}:
   * run one explicit uniform failable effect for every tag (its `Ok` value is
   * ignored; its failure threads).
   */
  flatTapErr<R extends Result<unknown, unknown>>(
    handlers: MergedTriage<E, R>,
  ): Result<T, E | ErrOf<R>>;
  flatTapErr<H extends ErrTriagePartial<E, Result<unknown, unknown>>>(
    handlers: H & TriageKeysOk<E, H>,
  ): Result<T, E | ErrOf<TriageReturns<H>>>;

  /**
   * Recover from a `Defect` — the **only** combinator that can touch one.
   *
   * @remarks
   * Runs `f` only when a `Defect` is present, re-entering the modeled world by
   * returning a `Result` (an `Ok` or a fresh `Err`). `Ok` and `Err` pass
   * through. Recovering a Defect should be rare: usually you let it bubble to
   * the edge. If `f` throws, the throw becomes a new `Defect`.
   *
   * @typeParam U - a success type the recovery may produce.
   * @typeParam E2 - an error type the recovery may produce.
   * @param f - maps the Defect's unknown cause to a recovering `Result`.
   */
  recoverDefect<U, E2>(f: (cause: unknown) => Result<U, E2>): Result<T | U, E | E2>;
  /**
   * Run a side effect on a present `Defect`'s cause (e.g. logging) and pass the
   * `Defect` through unchanged. If `f` throws, the result is a `Defect` whose
   * cause is an `AggregateError` of `[thrown, original failure]` — observing a
   * failure never destroys it. An async callback is rejected at compile time
   * ({@link NotThenable}).
   *
   * @param f - the side effect over the unknown cause.
   */
  tapDefect<R>(f: (cause: unknown) => R & NotThenable<R>): Result<T, E>;

  /**
   * Run a side effect on **any failure** — `Err` or `Defect` — and pass the
   * `Result` through unchanged. The one cross-channel observer, for the shared
   * "it went KO" concern (logging, metrics, rollback) that would otherwise be
   * duplicated across {@link ResultMethods.tapErr | tapErr} and
   * {@link ResultMethods.tapDefect | tapDefect}.
   *
   * @remarks
   * `f` receives the narrowed **failure variant** ({@link FailureView}), not a
   * payload — the payload union `E | unknown` would collapse to `unknown` and
   * lose `E`'s typing. Branch on `failure.tag` to reach the typed payload
   * (`"Err"` → `failure.error: E`, `"Defect"` → `failure.cause: unknown`), or
   * treat it opaquely for a shared logger. Runs on `Err` and `Defect`; `Ok`
   * passes through. It **observes without consuming**: the failure flows on
   * unchanged — to also recover, use
   * {@link ResultMethods.recoverErr | recoverErr} /
   * {@link ResultMethods.recoverDefect | recoverDefect} (deliberately separate
   * acts) or {@link ResultMethods.match | match} at the edge. If `f` throws, the
   * result is a `Defect` whose cause is an `AggregateError` of `[thrown,
   * original failure]` — observing a failure never destroys it. An async
   * callback is rejected at compile time ({@link NotThenable}).
   *
   * @param f - the side effect over the failure variant (its return value is ignored).
   */
  tapFailure<R>(f: (failure: FailureView<E, T>) => R & NotThenable<R>): Result<T, E>;

  /**
   * Exhaustively fold all three runtime states into a single value of type `R`.
   *
   * @remarks
   * Exactly one handler runs. Together with the throw-to-Defect guarantee, this
   * is typically the single place a pipeline is handled at the edge — mapping
   * `Ok`/`Err`/`Defect` to (for example) 2xx / 4xx / 5xx with no `try`/`catch`.
   * (For richer matching, a `Result` is also a discriminated union — branch on
   * its `tag` property, e.g. with `ts-pattern`.)
   *
   * @typeParam R - the folded result type.
   * @param cases - one handler per channel.
   */
  match<R>(cases: { ok: (value: T) => R; err: (error: E) => R; defect: (cause: unknown) => R }): R;
  /**
   * Extract the success value.
   *
   * @remarks
   * Compiles only when the error channel is empty (`E = never`) — eliminate
   * modeled errors first (`match` / `recoverErr` / `flatMapErr`), or reach for the
   * `getOr` / `getOrElse` / `getOrNull` / `getOrUndefined` family (which
   * recover an `Err`). If you get a `'this' context` type error here, that is
   * the gate: the receiver still has a non-`never` error channel.
   *
   * `E = never` empties only the **modeled** error channel — a `Defect` can
   * still be present, and `get()` **rethrows its original cause** (it
   * _panics_); `Result<T, never>` does not mean `get()` cannot throw.
   *
   * @returns the `Ok` value.
   */
  get(this: Result<T, never>): T;
  /**
   * Extract the success value.
   *
   * @deprecated Renamed to {@link ResultMethods.get | get}, unifying the extractor
   * family under `get…`. This alias will be removed in a future major.
   *
   * @returns the `Ok` value.
   */
  unwrap(this: Result<T, never>): T;
  /**
   * Extract the modeled error.
   *
   * @remarks
   * Compiles only when the success channel is empty (`T = never`) — eliminate
   * the success case first. `T = never` is rarely the case in practice (a
   * `Result` you hold usually still has a success type), so to inspect an
   * error prefer an `isErr()` guard or, in tests, `@unthrown/vitest`'s
   * `toBeErrWith`. A `Defect` still **rethrows its original cause** (a defect is
   * a bug, not an absent value), so this does not mean `getErr()` can't throw.
   *
   * @returns the `Err` value.
   */
  getErr(this: Result<never, E>): E;
  /**
   * Extract the modeled error.
   *
   * @deprecated Renamed to {@link ResultMethods.getErr | getErr}, unifying the
   * extractor family under `get…`. This alias will be removed in a future major.
   *
   * @returns the `Err` value.
   */
  unwrapErr(this: Result<never, E>): E;
  /**
   * The success value, or `fallback` on `Err`.
   *
   * @typeParam U - the fallback type (may differ from `T`; the return widens to `T | U`).
   * @param fallback - returned when the result is an `Err` (may be a different type; the return widens to `T | U`).
   * @throws Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
   * it is never silently replaced.
   */
  getOr<U>(fallback: U): T | U;
  /**
   * The success value, or `fallback` on `Err`.
   *
   * @deprecated Renamed to {@link ResultMethods.getOr | getOr}, unifying the
   * extractor family under `get…`. This alias will be removed in a future major.
   *
   * @typeParam U - the fallback type (may differ from `T`; the return widens to `T | U`).
   * @param fallback - returned when the result is an `Err`.
   * @throws Re-throws on a `Defect`.
   */
  unwrapOr<U>(fallback: U): T | U;
  /**
   * The success value, or `f(error)` on `Err`.
   *
   * @typeParam U - the fallback type (may differ from `T`; the return widens to `T | U`).
   * @param f - lazily computes the fallback from the error (may return a different type; the return widens to `T | U`).
   * @throws Re-throws on a `Defect`.
   */
  getOrElse<U>(f: (error: E) => U): T | U;
  /**
   * The success value, or `f(error)` on `Err`.
   *
   * @deprecated Renamed to {@link ResultMethods.getOrElse | getOrElse}, unifying
   * the extractor family under `get…`. This alias will be removed in a future major.
   *
   * @typeParam U - the fallback type (may differ from `T`; the return widens to `T | U`).
   * @param f - lazily computes the fallback from the error.
   * @throws Re-throws on a `Defect`.
   */
  unwrapOrElse<U>(f: (error: E) => U): T | U;
  /**
   * The success value, or `null` on `Err`.
   *
   * @throws Re-throws on a `Defect`.
   */
  getOrNull(): T | null;
  /**
   * The success value, or `undefined` on `Err`.
   *
   * @throws Re-throws on a `Defect`.
   */
  getOrUndefined(): T | undefined;
  /**
   * The success value, or **throw** the modeled error on `Err`.
   *
   * @remarks
   * A deliberate escape hatch off the errors-as-values model. Unlike
   * {@link ResultMethods.get | get} (type-gated to an empty error
   * channel), this compiles on any `Result<T, E>` and **throws the `Err` value
   * as-is** at the call site. Its purpose is to move a literal `throw` behind a
   * method, so a `no-throw` lint rule can ban raw throws while this one
   * sanctioned extraction remains — _not_ to replace principled handling. When
   * you can keep the error a value, prefer {@link ResultMethods.match | match} /
   * {@link ResultMethods.recoverErr | recoverErr} / {@link ResultMethods.flatMapErr | flatMapErr}.
   *
   * @returns the `Ok` value.
   * @throws the modeled `error` on `Err`; re-throws the original `cause` on a
   * `Defect` (a panic, like the rest of the `getOr…` family).
   */
  getOrThrow(): T;

  /** Whether this result is `Ok` — narrows `this` to its {@link OkView} on `true`. */
  isOk(): this is OkView<T, E>;
  /** Whether this result is `Err` — narrows `this` to its {@link ErrView} on `true`. */
  isErr(): this is ErrView<E, T>;
  /** Whether this result is a `Defect` — narrows `this` to its {@link DefectView} on `true`. */
  isDefect(): this is DefectView<T, E>;

  /** Lift this synchronous `Result` into an {@link AsyncResult}. */
  toAsync(): AsyncResult<T, E>;
};

/**
 * The `Ok` variant of a {@link Result}: a success carrying a `value`. This is
 * what a successful `isOk` guard narrows to, making `.value` reachable. It also
 * carries the shared fluent surface ({@link ResultMethods}).
 *
 * @example
 * ```ts
 * if (r.isOk()) r.value; // r: OkView<T, E> here — .value is a T
 * ```
 *
 * @category Types
 */
export type OkView<T, E = never> = ResultMethods<T, E> & {
  readonly tag: "Ok";
  readonly value: T;
};
/**
 * The `Err` variant of a {@link Result}: a modeled failure carrying an `error`.
 * This is what a successful `isErr` guard narrows to, exposing `.error`. It also
 * carries the shared fluent surface ({@link ResultMethods}).
 *
 * @remarks
 * **Note the parameter order: `ErrView<E, T>` puts the error type _first_** — the
 * reverse of the `<T, E>` order used by {@link OkView}, {@link DefectView}, and
 * {@link Result} — because `Result<T, E>` narrows to `ErrView<E, T>` (the error is
 * the payload the guard makes reachable). You rarely write it by hand (a failed
 * `isErr()` narrows to it for you); if you do, mind the flip — `ErrView<MyError,
 * MyValue>`, not `ErrView<MyValue, MyError>`.
 *
 * @example
 * ```ts
 * if (r.isErr()) r.error; // r: ErrView<E, T> here — .error is an E
 * ```
 *
 * @category Types
 */
export type ErrView<E, T = never> = ResultMethods<T, E> & {
  readonly tag: "Err";
  readonly error: E;
};
/**
 * The `Defect` variant of a {@link Result}: an unmodeled failure carrying a
 * `cause`. This is what a successful `isDefect` guard narrows to, exposing
 * `.cause`. It also carries the shared fluent surface ({@link ResultMethods}).
 *
 * @example
 * ```ts
 * if (r.isDefect()) r.cause; // r: DefectView<T, E> here — .cause is `unknown`
 * ```
 *
 * @category Types
 */
export type DefectView<T = never, E = never> = ResultMethods<T, E> & {
  readonly tag: "Defect";
  readonly cause: unknown;
};

/**
 * A failure variant of a {@link Result}: an {@link ErrView} **or** a
 * {@link DefectView}. This is what a `tapFailure` callback receives — the
 * discriminated variant rather than a payload, because the payload union
 * `E | unknown` would collapse to `unknown` and lose `E`'s typing. Branch on
 * `tag` to narrow (`"Err"` → `.error: E`, `"Defect"` → `.cause: unknown`).
 *
 * @remarks
 * Like {@link ErrView}, the error type comes **first** (`FailureView<E, T>`) —
 * the error is the payload you are usually here for, and a shared observer can
 * spell just `FailureView<MyError>`.
 *
 * @example
 * ```ts
 * const logKo = (f: FailureView<ApiError>) =>
 *   f.tag === "Err" ? logger.warn(f.error) : logger.error(f.cause);
 * result.tapFailure(logKo);
 * ```
 *
 * @typeParam E - the modeled error type.
 * @typeParam T - the success value type (phantom here; a failure carries none).
 * @category Types
 */
export type FailureView<E, T = never> = ErrView<E, T> | DefectView<T, E>;

/**
 * The core type of the library: a computation that has either succeeded with a
 * value of type `T` or failed with a *modeled* error of type `E`.
 *
 * @remarks
 * A `Result` is a **discriminated union** of three variants, distinguished by a
 * `tag` of `"Ok"` | `"Err"` | `"Defect"`:
 *
 * - **`Ok`** — a success carrying a `value: T`.
 * - **`Err`** — a modeled, anticipated failure carrying an `error: E`.
 * - **`Defect`** — an *unmodeled* failure carrying an unknown `cause`. A Defect
 *   never appears in `E`; it is the library's third, out-of-band channel.
 *
 * Because it is a real union, you can match it natively (a `switch` on `tag`, or
 * `ts-pattern`'s `match(...).with({ tag: "Ok" }, …).exhaustive()`), *and* it
 * carries the full method surface ({@link ResultMethods}) for fluent chaining.
 * Either way, the payload (`value`/`error`/`cause`) is only reachable after you
 * narrow — so "check before you access" still holds.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type (only anticipated domain failures).
 *
 * @example
 * ```ts
 * import { Ok, Err, type Result } from "unthrown";
 *
 * function half(n: number): Result<number, "odd"> {
 *   return n % 2 === 0 ? Ok(n / 2) : Err("odd");
 * }
 *
 * const message = half(10).match({
 *   ok: (n) => `got ${n}`,
 *   err: (e) => `failed: ${e}`,
 *   defect: (cause) => `bug: ${String(cause)}`,
 * });
 * ```
 */
export type Result<T, E> = OkView<T, E> | ErrView<E, T> | DefectView<T, E>;

/**
 * A success-only thenable: awaitable, but deliberately **not** a full
 * `PromiseLike`.
 *
 * @remarks
 * An {@link AsyncResult}'s internal promise never rejects, so `await`-ing one
 * always yields a {@link Result} and never throws — there is no rejection
 * channel to model, and none is advertised. At runtime it is still a thenable
 * (the only way `await` can collapse it), and `Promise.all` / `Promise.resolve`
 * will still adopt it — harmlessly, since it settles to a `Result` and never
 * rejects. What the narrowing prevents is treating it as a full promise:
 * `.catch()` / `.finally()` do not type-check, because there is no rejection to
 * handle.
 *
 * @typeParam T - the value `await` resolves to.
 *
 * @category Types
 */
export type Awaitable<out T> = {
  then<R = T>(onfulfilled?: ((value: T) => R | PromiseLike<R>) | null): PromiseLike<R>;
};

/**
 * The async method surface every {@link AsyncResult} carries — the combinators
 * (`map`, `flatMap`, `mapErr`, `match`, `get`, …) with their asynchronous
 * signatures, documented one per entry below. The async mirror of
 * {@link ResultMethods}: each entry links its synchronous counterpart and states
 * only the async delta.
 *
 * @remarks
 * Like {@link ResultMethods}, this type exists to **document** the surface — not
 * to be authored against; you obtain it by holding an `AsyncResult`. Its
 * combinator callbacks are **synchronous** (a raw `Promise` may never enter — see
 * the {@link AsyncResult} remarks); async work re-enters via {@link fromPromise}
 * and composes with `flatMap`. Systematic differences from the sync surface: the
 * binds return an `AsyncResult` (and additionally accept one), and the
 * eliminators return a `Promise`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @category Methods
 */
export type AsyncResultMethods<out T, out E> = {
  /**
   * Asynchronous {@link ResultMethods.map | map}: transforms the success value
   * with `f`. `f` is synchronous; a throw becomes a `Defect`. An async callback
   * is rejected at compile time ({@link NotThenable}).
   */
  map<U>(f: (value: T) => U & NotThenable<U>): AsyncResult<U, E>;
  /**
   * Asynchronous {@link ResultMethods.flatMap | flatMap}. Unlike the sync form,
   * `f` may return a `Result` **or** an `AsyncResult` (never a raw `Promise`); a
   * throw becomes a `Defect`.
   */
  flatMap<U, E2>(f: (value: T) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<U, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.tap | tap}. `f` is synchronous; a throw
   * becomes a `Defect`. An async callback is rejected at compile time
   * ({@link NotThenable}) — and so is a returned `AsyncResult` (it is
   * awaitable). Beware the near-miss: _calling_ an `AsyncResult`-returning
   * effect inside the callback without returning it compiles and leaves the
   * effect floating — fire-and-forget, never awaited, its `Err`/`Defect`
   * unobserved. If the effect returns a `Result`/`AsyncResult`, use
   * {@link AsyncResultMethods.flatTap | flatTap}.
   */
  tap<R>(f: (value: T) => R & NotThenable<R>): AsyncResult<T, E>;
  /**
   * Asynchronous {@link ResultMethods.flatTap | flatTap} — a failable tap that
   * keeps the original value. `f` may return a `Result` **or** an `AsyncResult`;
   * its `Ok` value is discarded, an `Err`/`Defect` short-circuits, and a throw
   * becomes a `Defect`.
   */
  flatTap<E2>(
    f: (value: T) => Result<unknown, E2> | AsyncResult<unknown, E2>,
  ): AsyncResult<T, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.bind | bind} (do-notation). `f` may return
   * a `Result` **or** an `AsyncResult`; its value is bound under `name` in the
   * accumulating scope.
   */
  bind<K extends string, U, E2>(
    name: K,
    f: (scope: T) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<Bound<T, K, U>, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.let | let} (do-notation). `f` returns a
   * plain value, bound under `name`. An async callback is rejected at compile
   * time ({@link NotThenable}).
   */
  let<K extends string, U>(
    name: K,
    f: (scope: T) => U & NotThenable<U>,
  ): AsyncResult<Bound<T, K, U>, E>;
  /** Asynchronous {@link ResultMethods.as | as}: replaces the value with `value`. */
  as<U>(value: U): AsyncResult<U, E>;
  /** Asynchronous {@link ResultMethods.discard | discard}: drops the value, collapsing the success type to `void`. */
  discard(): AsyncResult<void, E>;

  /**
   * Asynchronous {@link ResultMethods.mapErr | mapErr} — the same triage
   * object ({@link ErrTriage}). Branches are synchronous; a throw becomes a
   * `Defect`. An async branch is rejected at compile time
   * ({@link NotThenable}).
   */
  /** {@link mergeTags} overload — see the sync {@link ResultMethods.mapErr | mapErr}. */
  mapErr<R>(handlers: MergedTriage<E, R> & NoThenables<R>): AsyncResult<T, Exclude<R, Defect>>;
  mapErr<H extends ErrTriage<E, unknown>>(
    handlers: H & TriageKeysOk<E, H> & NoThenables<TriageReturns<H>>,
  ): AsyncResult<T, TriageOut<H>>;

  /**
   * Asynchronous {@link ResultMethods.flatMapErr | flatMapErr} — the same
   * triage object ({@link ErrTriage}). Unlike the sync form, a branch may
   * return a `Result` **or** an `AsyncResult`.
   */
  /** {@link mergeTags} overload — see the sync {@link ResultMethods.flatMapErr | flatMapErr}. */
  flatMapErr<R extends Result<unknown, unknown> | AsyncResult<unknown, unknown> | Defect>(
    handlers: MergedTriage<E, R>,
  ): AsyncResult<T | OkOf<R> | AsyncOkOf<R>, ErrOf<R> | AsyncErrOf<R>>;
  flatMapErr<H extends ErrTriage<E, Result<unknown, unknown> | AsyncResult<unknown, unknown>>>(
    handlers: H & TriageKeysOk<E, H>,
  ): AsyncResult<
    T | OkOf<TriageReturns<H>> | AsyncOkOf<TriageReturns<H>>,
    ErrOf<TriageReturns<H>> | AsyncErrOf<TriageReturns<H>>
  >;

  /**
   * Asynchronous {@link ResultMethods.recoverErr | recoverErr} — the same
   * triage object ({@link ErrTriage}). Branches are synchronous; a throw
   * becomes a `Defect`. An async branch is rejected at compile time
   * ({@link NotThenable}).
   */
  /** {@link mergeTags} overload — see the sync {@link ResultMethods.recoverErr | recoverErr}. */
  recoverErr<R>(
    handlers: MergedTriage<E, R> & NoThenables<R>,
  ): AsyncResult<T | Exclude<R, Defect>, never>;
  recoverErr<H extends ErrTriage<E, unknown>>(
    handlers: H & TriageKeysOk<E, H> & NoThenables<TriageReturns<H>>,
  ): AsyncResult<T | TriageOut<H>, never>;

  /**
   * Asynchronous {@link ResultMethods.tapErr | tapErr}. `f` is synchronous; if it
   * throws, the result is a `Defect` whose cause is an `AggregateError` of
   * `[thrown, original failure]` — observing a failure never destroys it. An
   * async callback is rejected at compile time ({@link NotThenable}). The
   * {@link AsyncResultMethods.tap | tap} fire-and-forget caveat applies here
   * too — a failable effect belongs in
   * {@link AsyncResultMethods.flatTapErr | flatTapErr}.
   */
  /** {@link mergeTags} overload — see the sync {@link ResultMethods.tapErr | tapErr}. */
  tapErr<R>(handlers: MergedTriage<E, R> & NoThenables<R> & NoDefects<R>): AsyncResult<T, E>;
  tapErr<H extends ErrTriagePartial<E, unknown>>(
    handlers: H & TriageKeysOk<E, H> & NoThenables<TriageReturns<H>>,
  ): AsyncResult<T, E>;

  /**
   * Asynchronous {@link ResultMethods.flatTapErr | flatTapErr} — the
   * error-channel mirror of `flatTap`. `f` may return a `Result` **or** an
   * `AsyncResult`; its `Ok` value is discarded, an `Err`/`Defect` from `f`
   * threads through, and if `f` throws, the result is a `Defect` whose cause is
   * an `AggregateError` of `[thrown, original failure]` — observing a failure
   * never destroys it.
   */
  /** {@link mergeTags} overload — see the sync {@link ResultMethods.flatTapErr | flatTapErr}. */
  flatTapErr<R extends Result<unknown, unknown> | AsyncResult<unknown, unknown>>(
    handlers: MergedTriage<E, R>,
  ): AsyncResult<T, E | ErrOf<R> | AsyncErrOf<R>>;
  flatTapErr<
    H extends ErrTriagePartial<E, Result<unknown, unknown> | AsyncResult<unknown, unknown>>,
  >(
    handlers: H & TriageKeysOk<E, H>,
  ): AsyncResult<T, E | ErrOf<TriageReturns<H>> | AsyncErrOf<TriageReturns<H>>>;

  /**
   * Asynchronous {@link ResultMethods.recoverDefect | recoverDefect}. `f` may
   * return a `Result` or an `AsyncResult`.
   */
  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<T | U, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.tapDefect | tapDefect}. If `f` throws, the
   * result is a `Defect` whose cause is an `AggregateError` of `[thrown,
   * original failure]` — observing a failure never destroys it. An async
   * callback is rejected at compile time ({@link NotThenable}).
   */
  tapDefect<R>(f: (cause: unknown) => R & NotThenable<R>): AsyncResult<T, E>;

  /**
   * Asynchronous {@link ResultMethods.tapFailure | tapFailure} — the
   * cross-channel observer. `f` receives the narrowed failure variant
   * ({@link FailureView}); if it throws, the result is a `Defect` whose cause
   * is an `AggregateError` of `[thrown, original failure]` — observing a
   * failure never destroys it. An async callback is rejected at compile time
   * ({@link NotThenable}).
   */
  tapFailure<R>(f: (failure: FailureView<E, T>) => R & NotThenable<R>): AsyncResult<T, E>;

  /**
   * Asynchronous {@link ResultMethods.match | match}. Handlers are synchronous;
   * resolves to a `Promise<R>`.
   */
  match<R>(cases: {
    ok: (value: T) => R;
    err: (error: E) => R;
    defect: (cause: unknown) => R;
  }): Promise<R>;
  /**
   * Asynchronous {@link ResultMethods.get | get}. Compiles only when the
   * error channel is empty (`this: AsyncResult<T, never>`); the returned promise
   * rejects on a `Defect` (rethrowing its cause).
   */
  get(this: AsyncResult<T, never>): Promise<T>;
  /**
   * @deprecated Renamed to {@link AsyncResultMethods.get | get}. This alias will
   * be removed in a future major.
   */
  unwrap(this: AsyncResult<T, never>): Promise<T>;
  /**
   * Asynchronous {@link ResultMethods.getErr | getErr}. Compiles only when
   * the success channel is empty (`this: AsyncResult<never, E>`); the returned
   * promise rejects on a `Defect` (rethrowing its cause).
   */
  getErr(this: AsyncResult<never, E>): Promise<E>;
  /**
   * @deprecated Renamed to {@link AsyncResultMethods.getErr | getErr}. This alias
   * will be removed in a future major.
   */
  unwrapErr(this: AsyncResult<never, E>): Promise<E>;
  /** Asynchronous {@link ResultMethods.getOr | getOr}. */
  getOr<U>(fallback: U): Promise<T | U>;
  /**
   * @deprecated Renamed to {@link AsyncResultMethods.getOr | getOr}. This alias
   * will be removed in a future major.
   */
  unwrapOr<U>(fallback: U): Promise<T | U>;
  /** Asynchronous {@link ResultMethods.getOrElse | getOrElse}. */
  getOrElse<U>(f: (error: E) => U): Promise<T | U>;
  /**
   * @deprecated Renamed to {@link AsyncResultMethods.getOrElse | getOrElse}. This
   * alias will be removed in a future major.
   */
  unwrapOrElse<U>(f: (error: E) => U): Promise<T | U>;
  /** Asynchronous {@link ResultMethods.getOrNull | getOrNull}. */
  getOrNull(): Promise<T | null>;
  /** Asynchronous {@link ResultMethods.getOrUndefined | getOrUndefined}. */
  getOrUndefined(): Promise<T | undefined>;
  /**
   * Asynchronous {@link ResultMethods.getOrThrow | getOrThrow} — the returned
   * promise **rejects** with the modeled error on `Err` (or the original cause
   * on a `Defect`), rather than throwing synchronously.
   */
  getOrThrow(): Promise<T>;
};

/**
 * The asynchronous counterpart of {@link Result}: an awaitable wrapper carrying
 * the {@link AsyncResultMethods} surface, collapsing to a `Result<T, E>` when
 * `await`-ed.
 *
 * @remarks
 * **Combinator callbacks are synchronous.** A raw `Promise` may never enter an
 * `AsyncResult` method — that would be an un-qualified async boundary, and its
 * rejection would silently become a `Defect`, skipping the triage that
 * {@link fromPromise} forces. To do further async work, re-enter through a
 * qualified boundary and compose it: `ar.flatMap((v) => fromPromise(work(v),
 * qualify))`. The eliminators (`get`, …) return promises; the binds
 * (`flatMap`, `flatTap`, `flatMapErr`, `recoverDefect`) additionally accept an
 * `AsyncResult`. Its combinators are documented one per entry on
 * {@link AsyncResultMethods}.
 *
 * To pattern-match an `AsyncResult`, `await` it first: `match(await ar)`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 */
export type AsyncResult<T, E> = Awaitable<Result<T, E>> & AsyncResultMethods<T, E>;

/**
 * Extract the success type `T` from a `Result` type — derive one type from
 * another instead of restating it (e.g. the payload a function returns).
 *
 * @typeParam R - the `Result` type to inspect.
 *
 * @example
 * ```ts
 * type R = Result<User, NotFound>;
 * type U = OkOf<R>; // User
 * type E = ErrOf<R>; // NotFound
 * ```
 *
 * @category Types
 */
export type OkOf<R> = R extends { readonly tag: "Ok"; readonly value: infer T } ? T : never;
/**
 * Extract the error type `E` from a `Result` type — the counterpart of
 * {@link OkOf}.
 *
 * @typeParam R - the `Result` type to inspect.
 *
 * @example
 * ```ts
 * type E = ErrOf<Result<User, NotFound>>; // NotFound
 * ```
 *
 * @category Types
 */
export type ErrOf<R> = R extends { readonly tag: "Err"; readonly error: infer E } ? E : never;
/**
 * Extract the success type `T` from an {@link AsyncResult} type — the async
 * counterpart of {@link OkOf}.
 *
 * @typeParam R - the `AsyncResult` type to inspect.
 *
 * @example
 * ```ts
 * type T = AsyncOkOf<AsyncResult<User, NotFound>>; // User
 * ```
 *
 * @category Types
 */
export type AsyncOkOf<R> = R extends Awaitable<infer Res> ? OkOf<Res> : never;
/**
 * Extract the error type `E` from an {@link AsyncResult} type — the async
 * counterpart of {@link ErrOf}.
 *
 * @typeParam R - the `AsyncResult` type to inspect.
 *
 * @example
 * ```ts
 * type E = AsyncErrOf<AsyncResult<User, NotFound>>; // NotFound
 * ```
 *
 * @category Types
 */
export type AsyncErrOf<R> = R extends Awaitable<infer Res> ? ErrOf<Res> : never;
