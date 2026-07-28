// unthrown — the built-in error matcher.
//
// A purpose-built, shallow pattern matcher for the error channel (it replaced
// the former ts-pattern peer dependency, keeping its call-site shape:
// `matcher.with(pattern, …patterns, handler)`, with the combinator running
// `.exhaustive()` via `.run()`). Owning the type machinery means:
//
//   - Exhaustiveness is computed with plain `Exclude` over the tracked
//     `Remaining` parameter — shallow, fast, and stable (no third-party minor
//     release can change what "exhaustive" means).
//   - The universal pattern (`P._` / `P.any`) carries phantom type `unknown`,
//     and `Exclude<Remaining, unknown>` reduces to `never` even when the input
//     is an UNRESOLVED generic — so a catch-all-terminated builder is provably
//     exhaustive inside code generic in `E` (fixes #145 by construction).
//   - A non-exhaustive builder's `exhaustive` is a branded object naming the
//     unhandled cases — a readable diagnostic instead of a deep conditional.
//
// Supported patterns (the vocabulary the error channel actually uses):
// primitive literals, shallow(-ly nested) object literals (`{ _tag: "X" }`,
// `{ code: "X" }` — `tag(t)` produces the former), and the `P.*` matchers
// (`_`/`any`, `instanceOf`, `when`, `union`, `string`, `number`). Deliberately
// NOT supported: deep structural inversion, selections, array/variadic
// patterns — that is the complexity (and instability) being left behind.

import type { Defect } from "./defect.js";

/**
 * Cross-copy brand for `P.*` pattern objects: `Symbol.for` yields the same
 * symbol in every copy of the library (dual CJS/ESM, duplicated install,
 * another realm), so a pattern built by one copy is recognised by another —
 * the same rationale as `isResult`'s prototype brand.
 *
 * @internal
 */
const PATTERN_BRAND = Symbol.for("unthrown.matcher.pattern");

declare const MATCHES: unique symbol;
declare const UNIVERSAL: unique symbol;

/**
 * A `P.*` pattern: a runtime predicate plus the phantom type `M` it matches.
 * The phantom is declaration-only (never present at runtime); it drives the
 * type-level narrowing (`Extract`) and exhaustiveness (`Exclude`).
 *
 * @typeParam M - the type this pattern matches.
 * @category Types
 */
export type PatternMatcher<M> = {
  readonly [PATTERN_BRAND]: (value: unknown) => boolean;
  readonly [MATCHES]?: M;
};

/**
 * The statically-known universal pattern — the type of `P._` / `P.any` only.
 * The phantom `UNIVERSAL` marker is *required*, so no other
 * `PatternMatcher<unknown>` (e.g. a `P.when` guard that happens to be
 * universal) is assignable: the catch-all `.with` overload must only fire for
 * a pattern the type system KNOWS covers everything.
 *
 * @category Types
 */
export type UniversalPattern = PatternMatcher<unknown> & {
  readonly [UNIVERSAL]: true;
};

/**
 * The type a single pattern matches: a `P.*` matcher's phantom, an object
 * literal mapped key-by-key (so `{ _tag: "A" }` matches the `"A"`-tagged
 * variant), or the primitive literal itself.
 *
 * @internal
 */
export type MatchedOf<Pt> =
  Pt extends PatternMatcher<infer M>
    ? M
    : Pt extends object
      ? { [K in keyof Pt]: MatchedOf<Pt[K]> }
      : Pt;

/**
 * The diagnostic type of `.exhaustive` on a builder that has NOT covered every
 * case: not callable (so it fails the `ExhaustiveMatch` constraint at the call
 * site), and it names the remaining cases so the error reads as a to-do list.
 *
 * @internal
 */
export type NonExhaustive<Remaining> = {
  readonly "unthrown: this match is not exhaustive — add a `.with(…)` for the remaining cases": Remaining;
};

/**
 * The "no output type declared" sentinel for a builder's `Declared` parameter.
 * A `unique symbol` so no user type can collide with it. Declaration-only —
 * `tsc` emits it into the `.d.ts` without it needing to be exported.
 *
 * @internal
 */
declare const UNSET: unique symbol;

/** @internal */
type Unset = typeof UNSET;

/**
 * A branch handler's return position: free inference (`O2`) while the builder
 * is unpinned — today's behaviour, unchanged — or the declared type once
 * `.returnType<R>()` has pinned it.
 *
 * `Defect` stays legal under a pin: the injected `defect` helper is the
 * sanctioned deliberate `Err`→`Defect` form (Thesis #5), and `Defect` is not a
 * nameable public type, so `returnType<R | Defect>()` cannot be spelled. The
 * marker is subtracted from the output by {@link PinnedOut} — the same net
 * result as the unpinned `Exclude<O, Defect>`, decided up front.
 *
 * @internal
 */
type BranchReturn<Declared, O2> = [Declared] extends [Unset] ? O2 : Declared | Defect;

/**
 * The builder's output: the accumulated union of branch returns while
 * unpinned, or the declared type once pinned.
 *
 * @internal
 */
type PinnedOut<Declared, O> = [Declared] extends [Unset] ? O : Declared;

/**
 * The diagnostic type of `.returnType` on a builder that already has an output
 * to contradict — an arm has contributed a return type, or it is already
 * pinned: not callable, so the mistake is caught where it is written.
 *
 * @internal
 */
type PinTooLate = {
  readonly "unthrown: `.returnType<R>()` must come before any arm produces an output, and only once": true;
};

/**
 * The match builder over an input union `E`. `Remaining` tracks the cases not
 * yet covered by a `.with(…)` arm; `O` accumulates the branch output union.
 * `.exhaustive` is callable only once `Remaining` is `never` — which is what
 * the `ExhaustiveMatch` constraint requires — and `.run()` executes it.
 *
 * @typeParam E - the full input union being matched.
 * @typeParam Remaining - the cases not yet covered.
 * @typeParam O - the union of branch return types so far.
 * @category Types
 */
export type Matcher<E, Remaining, O, Declared = Unset> = {
  /**
   * The catch-all arm: `.with(P._, handler)` / `.with(P.any, handler)` — the
   * wildcard **escape hatch**, not the way to handle a concrete error union
   * (name those cases; `@unthrown/oxlint`'s `no-catch-all-pattern`, in its
   * `recommended` preset, flags the wildcard).
   *
   * It is a **state transition**, not a computation — it returns
   * `Matcher<E, never, …>` with the remaining cases literally `never`, so the
   * builder is provably exhaustive even when `E` is an unresolved type
   * parameter (a lazily-deferred `Exclude<E, unknown>` would not resolve
   * there). That is the escape hatch's irreducible use: a helper generic in
   * `E` can terminate a match no arm list could (issue #145).
   */
  with<O2>(
    pattern: UniversalPattern,
    handler: (value: Remaining) => BranchReturn<Declared, O2>,
  ): Matcher<E, never, O | O2, Declared>;
  /**
   * Add an arm: one or more patterns sharing a single handler (grouped
   * patterns — `matcher.with(tag("A"), tag("B"), handler)`). The handler
   * receives the input narrowed to what the patterns match (computed against
   * `Remaining`, so cases already handled by earlier arms are excluded); the
   * matched cases are subtracted from `Remaining`.
   */
  with<const Pts extends readonly [unknown, ...unknown[]], O2>(
    ...args: [
      ...patterns: Pts,
      handler: (value: Extract<Remaining, MatchedOf<Pts[number]>>) => BranchReturn<Declared, O2>,
    ]
  ): Matcher<E, Exclude<Remaining, MatchedOf<Pts[number]>>, O | O2, Declared>;

  /**
   * Declare the match's output type up front: every subsequent branch handler
   * is checked against `R`, and the match evaluates to `R` instead of the
   * union of whatever the branches happened to return.
   *
   * @remarks
   * Reach for it when the output is **decided by a signature rather than by
   * the branches** — most sharply in code generic in `E`, where the fold's type
   * has to be declared. It also stops a drifting branch from silently widening
   * the outgoing type, reports the mismatch **on the offending branch**, and
   * gives branch returns a contextual type (so object literals need no
   * annotation).
   *
   * A branch may still return the injected `defect` helper's marker; the defect
   * channel is not part of the declared output.
   *
   * Callable **before any arm has produced an output**, and only once
   * (mirroring ts-pattern's up-front pin): once there is an inferred output for
   * the pin to contradict — or the builder is already pinned — this is typed as
   * a non-callable diagnostic. In practice that means calling it directly after
   * `match(…)`; the gate is about output rather than position, so an earlier arm
   * whose handler returns `never` (it always throws) contributes nothing and
   * does not close it — sound, since a `never` branch can contradict no declared
   * type. A no-op at runtime.
   *
   * @typeParam R - the declared output type of every branch.
   */
  returnType: [O] extends [never]
    ? [Declared] extends [Unset]
      ? <R>() => Matcher<E, Remaining, never, R>
      : PinTooLate
    : PinTooLate;

  /**
   * Terminate the match. Typed callable only when every case is covered
   * (`Remaining` is `never`); otherwise it is a branded diagnostic object
   * naming the remaining cases, and the builder fails the `ExhaustiveMatch`
   * constraint at the combinator call site.
   */
  exhaustive: [Remaining] extends [never] ? () => PinnedOut<Declared, O> : NonExhaustive<Remaining>;

  /**
   * Execute the match (the combinators call this; it runs `.exhaustive()`).
   * A value with no matching arm throws {@link NonExhaustiveError} —
   * unreachable for well-typed callers.
   */
  run(): PinnedOut<Declared, O>;
};

/**
 * Thrown by `.run()` / `.exhaustive()` when no arm matched the value. For
 * well-typed callers the match is exhaustive by construction, so this is only
 * reachable by a value that slipped past the types (a widened cast, a raw-JS
 * caller); inside the error combinators the throw-to-defect net converts it to
 * a `Defect`, and at the `match` edge it surfaces (a genuinely unmodeled value
 * is a bug).
 *
 * @category Errors
 */
export class NonExhaustiveError extends Error {
  /** The value no arm matched. */
  readonly input: unknown;
  constructor(input: unknown) {
    let printed: string;
    try {
      printed = JSON.stringify(input);
    } catch {
      printed = String(input);
    }
    super(`unthrown: no pattern matched the value ${printed}`);
    this.name = "NonExhaustiveError";
    this.input = input;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Is `x` a *plain* object (prototype `Object.prototype` or `null`) — an object
 * literal, the only object shape that acts as a structural pattern?
 *
 * @internal
 */
function isPlainObject(x: object): x is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

/**
 * Runtime test: does `pattern` match `value`? A branded `P.*` pattern applies
 * its predicate; a **plain-object** pattern (an object literal, e.g. the
 * `{ _tag }` produced by `tag()`) matches when every key matches recursively
 * (extra keys on the value are ignored — matching is structural); anything
 * else — primitives, but also class instances, arrays, and foreign pattern
 * objects (e.g. a real ts-pattern matcher, whose keys are symbols) — is
 * compared with `Object.is`. Restricting structural matching to plain objects
 * is load-bearing: a keyless non-plain object (`new Date()`, `new Error()`, a
 * symbol-keyed foreign pattern) would otherwise vacuously match *every* object
 * via an empty `Object.entries`.
 *
 * @internal
 */
function matches(pattern: unknown, value: unknown): boolean {
  if (typeof pattern === "object" && pattern !== null) {
    const predicate = (pattern as PatternMatcher<unknown>)[PATTERN_BRAND];
    if (typeof predicate === "function") return predicate(value);
    // A symbol-keyed plain object is a *foreign* pattern protocol (e.g. a raw
    // ts-pattern matcher object) — it would look empty to `Object.entries` and
    // vacuously match everything. Fail closed: identity only.
    if (!isPlainObject(pattern) || Object.getOwnPropertySymbols(pattern).length > 0) {
      return Object.is(pattern, value);
    }
    if (typeof value !== "object" || value === null) return false;
    return Object.entries(pattern).every(([key, sub]) =>
      matches(sub, (value as Record<string, unknown>)[key]),
    );
  }
  return Object.is(pattern, value);
}

/**
 * The runtime builder: first matching arm wins; later arms are skipped once a
 * result is captured. `exhaustive` is a *method* at runtime (the conditional
 * type gates its callability per instantiation).
 *
 * @internal
 */
class MatcherImpl {
  readonly #value: unknown;
  #matched = false;
  #result: unknown;

  constructor(value: unknown) {
    this.#value = value;
  }

  with(...args: readonly unknown[]): this {
    if (this.#matched) return this;
    const handler = args[args.length - 1] as (value: unknown) => unknown;
    for (let i = 0; i < args.length - 1; i++) {
      if (matches(args[i], this.#value)) {
        this.#matched = true;
        this.#result = handler(this.#value);
        return this;
      }
    }
    return this;
  }

  /**
   * Type-level only — pinning the output type has no runtime meaning, so the
   * builder is returned unchanged (as ts-pattern does).
   */
  returnType(): this {
    return this;
  }

  exhaustive(): unknown {
    if (this.#matched) return this.#result;
    throw new NonExhaustiveError(this.#value);
  }

  run(): unknown {
    return this.exhaustive();
  }
}
Object.freeze(MatcherImpl.prototype);

/**
 * Begin a match over `value`. Chain `.with(pattern, …patterns, handler)` arms;
 * terminate with `.exhaustive()` — or return the un-terminated builder to an
 * unthrown error combinator / `match({ errCases })`, which runs it for you.
 *
 * @remarks
 * This is unthrown's own matcher (the former ts-pattern re-export): the same
 * call-site shape, with exhaustiveness computed by plain `Exclude` over the
 * builder's `Remaining` parameter. Name every case of the input union; the
 * `P._` catch-all is the escape hatch, and is provably exhaustive even over an
 * unresolved generic input — which is the one place it is irreplaceable.
 *
 * @category Constructors
 */
export function match<const E>(value: E): Matcher<E, E, never> {
  return new MatcherImpl(value) as unknown as Matcher<E, E, never>;
}

/** @internal */
function pattern<M>(predicate: (value: unknown) => boolean): PatternMatcher<M> {
  return Object.freeze({ [PATTERN_BRAND]: predicate }) as PatternMatcher<M>;
}

// The `UNIVERSAL` marker is phantom (declaration-only): the cast brands the
// runtime object with the statically-known-universal type so the catch-all
// `.with` overload fires for `P._` / `P.any` and for nothing else.
const universal = pattern<unknown>(() => true) as UniversalPattern;

/**
 * The pattern namespace (unthrown's own; the former ts-pattern `P`):
 *
 * - `P._` / `P.any` — the universal catch-all, and an **escape hatch** rather
 *   than the default: matching the error channel means naming its cases, so
 *   reach for this only where they cannot be named. Matches anything, and
 *   (because its phantom type is `unknown`) makes the builder provably
 *   exhaustive even when the matched input is an unresolved type parameter —
 *   the generic-`E` helper, the one case with no alternative. `@unthrown/oxlint`'s
 *   `no-catch-all-pattern` (in its `recommended` preset) flags every other use;
 *   keep the deliberate ones behind a targeted `oxlint-disable`.
 * - `P.instanceOf(Cls)` — an `instanceof` check, narrowing to the class
 *   instance type (for union members that are not tagged, e.g. a third-party
 *   error class).
 * - `P.when(guard)` — an arbitrary type-guard predicate.
 * - `P.union(…patterns)` — matches when any sub-pattern matches.
 * - `P.string` / `P.number` — primitive-type wildcards.
 *
 * @category Constructors
 */
export const P = Object.freeze({
  _: universal,
  any: universal,
  instanceOf: <C extends abstract new (...args: never[]) => unknown>(
    cls: C,
  ): PatternMatcher<InstanceType<C>> => pattern((value) => value instanceof cls),
  when: <G>(guard: (value: unknown) => value is G): PatternMatcher<G> => pattern(guard),
  union: <const Pts extends readonly [unknown, ...unknown[]]>(
    ...patterns: Pts
  ): PatternMatcher<MatchedOf<Pts[number]>> =>
    pattern((value) => patterns.some((sub) => matches(sub, value))),
  string: pattern<string>((value) => typeof value === "string"),
  number: pattern<number>((value) => typeof value === "number"),
});
