// unthrown — the runtime engine.
//
// `Result` is the PUBLIC discriminated union (tag/value/error/cause + methods).
// `Res` is a method holder only: its prototype carries the implementations, and
// instances are built by `okRes`/`errRes`/`defectRes` with `Object.create` +
// the variant type — so a builder returns a value that already *is* a union
// member (no `as unknown as`). `Res` is never exported from `index.ts`.
// `AsyncRes` wraps a `Promise<Result>` constructed never to reject and operates
// purely on the public union (via `r.tag`). See CLAUDE.md → "Internal design".
//
// Type-changing pass-throughs (e.g. `map` reusing an `Err` as a differently-typed
// `Result`) all funnel through the single `passThrough` helper — one sound
// `as unknown as` in one place, rather than boxed's inline cast at every branch.
// The only other casts are the builders' construction (`as OkView`/…) and the
// `bind`/`let` scope merge (a computed key can't be spelled at the type level).

import { type Defect, defect, isDefectMarker } from "./defect.js";
import { match } from "./matcher.js";
import type {
  AsyncResult,
  Bound,
  DefectView,
  ErrMatcher,
  ErrOf,
  ErrView,
  ExhaustiveMatch,
  FailureView,
  MatchErrOut,
  MatchOut,
  NotThenable,
  OkOf,
  OkView,
  Result,
} from "./types.js";

/**
 * Thrown by a {@link Result}'s `get` / `getErr` when the assertion is
 * wrong on a *modeled* result — `get()` on an `Err`, or `getErr()` on an
 * `Ok`.
 *
 * @remarks
 * The offending value is exposed two ways: the typed {@link GetError.error}
 * property for programmatic access, and the standard `Error.cause` for the
 * runtime and devtools to chain — when `E` is an `Error` (e.g. a `TaggedError`)
 * its original stack is printed under "caused by".
 *
 * A `Defect` is never wrapped in a `GetError`: its original cause is
 * re-thrown (with its original stack) instead.
 *
 * `get()` and `getErr()` are type-gated (`this: Result<T, never>` /
 * `Result<never, E>`), so the wrong-variant branch that throws this is
 * unreachable through well-typed code — it remains only as a defensive guard
 * against unsound runtime misuse (e.g. an `as` cast past the gate).
 *
 * @typeParam E - the type of the {@link GetError.error} it carries.
 *
 * @category Errors
 */
export class GetError<E = unknown> extends Error {
  /**
   * The offending value: the `Err` error for `get()`, or the `Ok` value for
   * `getErr()`.
   */
  readonly error: E;
  constructor(error: E) {
    super("unthrown: get() / getErr() called on a non-matching Result variant", { cause: error });
    this.name = "GetError";
    this.error = error;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Method holder for {@link Result}. Never instantiated with `new` and never
 * exported; the builders below attach its prototype to plain objects. Every
 * method types `this` as the public `Result` union, so it narrows on `tag`.
 *
 * @internal
 */
class Res<T, E> {
  map<U>(this: Result<T, E>, f: (value: T) => U & NotThenable<U>): Result<U, E> {
    if (this.tag !== "Ok") return passThrough(this);
    try {
      return okRes(f(this.value));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  flatMap<U, E2>(this: Result<T, E>, f: (value: T) => Result<U, E2>): Result<U, E | E2> {
    if (this.tag !== "Ok") return passThrough(this);
    try {
      const r = f(this.value);
      return isResult(r) ? r : nonResultCallbackDefect(r);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tap<R>(this: Result<T, E>, f: (value: T) => R & NotThenable<R>): Result<T, E> {
    if (this.tag !== "Ok") return this;
    try {
      silenceIfThenable(f(this.value));
      return this;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  flatTap<E2>(this: Result<T, E>, f: (value: T) => Result<unknown, E2>): Result<T, E | E2> {
    if (this.tag !== "Ok") return this;
    try {
      const r = f(this.value);
      if (!isResult(r)) return nonResultCallbackDefect(r);
      // Keep the original value on success; an Err/Defect from `f` short-circuits.
      return r.tag === "Ok" ? this : passThrough(r);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  bind<K extends string, U, E2>(
    this: Result<T, E>,
    name: K,
    f: (scope: T) => Result<U, E2>,
  ): Result<Bound<T, K, U>, E | E2> {
    if (this.tag !== "Ok") return passThrough(this);
    try {
      const r = f(this.value);
      if (!isResult(r)) return nonResultCallbackDefect(r);
      if (r.tag !== "Ok") return passThrough(r);
      // The merged scope can't be spelled at the type level (a computed key
      // widens to an index signature), so the constructed Ok is cast to `Bound`.
      return okRes({ ...scopeOf(this.value), [name]: r.value }) as unknown as Result<
        Bound<T, K, U>,
        E | E2
      >;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  let<K extends string, U>(
    this: Result<T, E>,
    name: K,
    f: (scope: T) => U & NotThenable<U>,
  ): Result<Bound<T, K, U>, E> {
    if (this.tag !== "Ok") return passThrough(this);
    try {
      return okRes({ ...scopeOf(this.value), [name]: f(this.value) }) as unknown as Result<
        Bound<T, K, U>,
        E
      >;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  as<U>(this: Result<T, E>, value: U): Result<U, E> {
    if (this.tag !== "Ok") return passThrough(this);
    return okRes(value);
  }

  discard(this: Result<T, E>): Result<void, E> {
    if (this.tag !== "Ok") return passThrough(this);
    // explicit <void, E>: inference from the argument would land on undefined, not void
    return okRes<void, E>(undefined);
  }

  // The type-guard/boolean overload pair lives on the public surface
  // (`ResultMethods`); this single implementation signature covers both.
  ensure<E2>(
    this: Result<T, E>,
    predicate: (value: T) => boolean,
    onFail: (value: T) => E2,
  ): Result<T, E | E2> {
    if (this.tag !== "Ok") return passThrough(this);
    try {
      // A passing value flows through as the SAME Ok (the passThrough
      // philosophy: nothing changed, so nothing is reallocated).
      return predicate(this.value) ? this : errRes(onFail(this.value));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  mapErrCases<M extends ExhaustiveMatch<unknown>>(
    this: Result<T, E>,
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): Result<T, MatchErrOut<M>> {
    if (this.tag !== "Err") return passThrough(this);
    try {
      const out = runMatch(f, this.error);
      if (isDefectMarker(out)) return defectRes(out.cause);
      return errRes(out as MatchErrOut<M>);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  flatMapErrCases<M extends ExhaustiveMatch<Result<unknown, unknown> | Defect>>(
    this: Result<T, E>,
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): Result<T | OkOf<MatchOut<M>>, ErrOf<MatchOut<M>>> {
    if (this.tag !== "Err") return passThrough(this);
    try {
      const out = runMatch(f, this.error);
      if (isDefectMarker(out)) return defectRes(out.cause);
      if (!isResult(out)) return nonResultCallbackDefect(out);
      return out as Result<OkOf<MatchOut<M>>, ErrOf<MatchOut<M>>>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  recoverErrCases<M extends ExhaustiveMatch<unknown>>(
    this: Result<T, E>,
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): Result<T | MatchErrOut<M>, never> {
    if (this.tag !== "Err") return passThrough(this);
    try {
      const out = runMatch(f, this.error);
      if (isDefectMarker(out)) return defectRes(out.cause);
      return okRes(out as MatchErrOut<M>);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapErrCases(
    this: Result<T, E>,
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => ExhaustiveMatch<unknown>,
  ): Result<T, E> {
    if (this.tag !== "Err") return this;
    try {
      const out = runMatch(f, this.error);
      // Branch *values* are discarded here — but the injected `defect(cause)`
      // marker is not a value, it is the lint-clean, expression-position form of
      // a `throw` (Thesis #5). So it takes the same route a `throw` in this
      // branch would: the observed error survives alongside the caller's cause.
      if (isDefectMarker(out)) return observerThrowToDefect(out.cause, this.error);
      silenceIfThenable(out);
      return this;
    } catch (cause) {
      return observerThrowToDefect(cause, this.error);
    }
  }

  flatTapErrCases<M extends ExhaustiveMatch<Result<unknown, unknown>>>(
    this: Result<T, E>,
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): Result<T, E | ErrOf<MatchOut<M>>> {
    if (this.tag !== "Err") return this;
    try {
      const r = runMatch(f, this.error);
      // A deliberate `defect(cause)` branch is the expression-position form of a
      // `throw` (Thesis #5), so it is treated like one: this is a failure
      // *observer*, and the observed error survives alongside the caller's cause.
      // (Contrast a branch returning a Defect-state `Result` below — an effect
      // that blew up on its own, which short-circuits and replaces the error.)
      if (isDefectMarker(r)) return observerThrowToDefect(r.cause, this.error);
      if (!isResult(r)) return nonResultCallbackDefect(r);
      // Keep the original error on the effect's success; an Err/Defect threads through.
      return r.tag === "Ok" ? this : passThrough(r);
    } catch (cause) {
      return observerThrowToDefect(cause, this.error);
    }
  }

  recoverDefect<U, E2>(
    this: Result<T, E>,
    f: (cause: unknown) => Result<U, E2>,
  ): Result<T | U, E | E2> {
    if (this.tag !== "Defect") return this;
    try {
      const r = f(this.cause);
      return isResult(r) ? r : nonResultCallbackDefect(r);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapDefect<R>(this: Result<T, E>, f: (cause: unknown) => R & NotThenable<R>): Result<T, E> {
    if (this.tag !== "Defect") return this;
    try {
      silenceIfThenable(f(this.cause));
      return this;
    } catch (cause) {
      return observerThrowToDefect(cause, this.cause);
    }
  }

  tapFailure<R>(
    this: Result<T, E>,
    f: (failure: FailureView<E, T>) => R & NotThenable<R>,
  ): Result<T, E> {
    if (this.tag === "Ok") return this;
    try {
      silenceIfThenable(f(this));
      return this;
    } catch (cause) {
      return observerThrowToDefect(cause, this.tag === "Err" ? this.error : this.cause);
    }
  }

  match<ROk, RDefect, M extends ExhaustiveMatch<unknown>>(
    this: Result<T, E>,
    cases: {
      ok: (value: T) => ROk;
      errCases: (matcher: ErrMatcher<E>) => M;
      defect: (cause: unknown) => RDefect;
    },
  ): ROk | RDefect | MatchOut<M> {
    switch (this.tag) {
      case "Ok":
        return cases.ok(this.value);
      case "Err":
        // The `errCases` handler returns the un-terminated builder; `.run()`
        // executes `.exhaustive()`. Type-forced exhaustive for well-typed
        // callers; a value slipping past the types (widened cast, JS caller) with
        // no matching case throws the matcher's `NonExhaustiveError` — `match` is
        // an edge eliminator, so it surfaces rather than being caught into a Defect.
        return cases.errCases(match(this.error) as ErrMatcher<E>).run() as MatchOut<M>;
      case "Defect":
        return cases.defect(this.cause);
    }
  }

  get(this: Result<T, E>): T {
    switch (this.tag) {
      case "Ok":
        return this.value;
      case "Err":
        throw new GetError(this.error);
      case "Defect":
        throw this.cause; // rethrow original cause, original stack
    }
  }

  getErr(this: Result<T, E>): E {
    switch (this.tag) {
      case "Err":
        return this.error;
      case "Ok":
        throw new GetError(this.value);
      case "Defect":
        throw this.cause;
    }
  }

  getOr<U>(this: Result<T, E>, fallback: U): T | U {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    return fallback;
  }

  getOrElse<U>(this: Result<T, E>, f: (error: E) => U): T | U {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    return f(this.error);
  }

  getOrNull(this: Result<T, E>): T | null {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    return null;
  }

  getOrUndefined(this: Result<T, E>): T | undefined {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    return undefined;
  }

  getOrThrow(this: Result<T, E>): T {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    throw this.error;
  }

  isOk(this: Result<T, E>): this is OkView<T, E> {
    return this.tag === "Ok";
  }

  isErr(this: Result<T, E>): this is ErrView<E, T> {
    return this.tag === "Err";
  }

  isDefect(this: Result<T, E>): this is DefectView<T, E> {
    return this.tag === "Defect";
  }

  toAsync(this: Result<T, E>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(Promise.resolve(this));
  }
}

/**
 * Cross-copy brand: `Symbol.for` yields the same symbol in every copy of the
 * library (the dual CJS/ESM build, a duplicated install, another realm), so
 * {@link isResult} can recognise a `Result` built by another copy whose `Res`
 * class fails the `instanceof` check. Defined non-enumerably on the prototype,
 * before it is frozen.
 *
 * @internal
 */
const RESULT_BRAND = Symbol.for("unthrown.Result");

const RESULT_PROTO = Res.prototype;
Object.defineProperty(RESULT_PROTO, RESULT_BRAND, { value: true });
// Frozen prototype: the shared combinators cannot be swapped out from under
// every instance (the instances themselves are frozen by the builders below).
Object.freeze(RESULT_PROTO);

/**
 * Construct an `Ok` result — a plain object on the {@link Res} prototype.
 *
 * @internal
 */
export function okRes<T, E>(value: T): Result<T, E> {
  // Frozen so the `readonly` surface is real at runtime: a variant cannot be
  // forged by mutating `tag`/payload after construction.
  return Object.freeze(
    Object.assign(Object.create(RESULT_PROTO), {
      tag: "Ok" as const,
      value,
    }),
  ) as OkView<T, E>;
}

/**
 * Construct an `Err` result.
 *
 * @internal
 */
export function errRes<T, E>(error: E): Result<T, E> {
  return Object.freeze(
    Object.assign(Object.create(RESULT_PROTO), {
      tag: "Err" as const,
      error,
    }),
  ) as ErrView<E, T>;
}

/**
 * Construct a `Defect` result.
 *
 * @internal
 */
export function defectRes<T, E>(cause: unknown): Result<T, E> {
  return Object.freeze(
    Object.assign(Object.create(RESULT_PROTO), {
      tag: "Defect" as const,
      cause,
    }),
  ) as DefectView<T, E>;
}

/**
 * Type guard: is `x` a {@link Result} (any of `Ok` / `Err` / `Defect`)?
 *
 * @remarks
 * Unlike {@link isOk} / {@link isErr} / {@link isDefect}, which narrow a value
 * already known to be a `Result`, this narrows from `unknown` — useful at an
 * untyped boundary. It checks the value carries the `Result` prototype
 * (`instanceof` first, falling back to the `Symbol.for("unthrown.Result")`
 * brand the prototype carries — so a `Result` built by **another copy** of
 * unthrown, e.g. the CJS and ESM builds loaded side by side, is still
 * recognised). A look-alike plain object (`{ tag: "Ok" }`) carries neither and
 * is **not** matched. An `AsyncResult` is not a `Result` and returns `false`.
 *
 * @returns `true` when `x` is a `Result` produced by this library.
 *
 * @example
 * ```ts
 * import { isResult, Ok, P } from "unthrown";
 *
 * isResult(Ok(1)); // => true
 * isResult({ tag: "Ok" }); // => false (look-alike, wrong prototype)
 * isResult(Ok(1).toAsync()); // => false (an AsyncResult is not a Result)
 *
 * const x: unknown = Ok(1);
 * if (isResult(x))
 *   // `E` is `unknown` here — an untyped boundary has no cases to enumerate,
 *   // so the `P._` escape hatch is the only arm that can terminate the match:
 *   // oxlint-disable-next-line unthrown/no-catch-all-pattern -- untyped boundary: `E` is `unknown`
 *   x.match({
 *     ok: () => 1,
 *     errCases: (m) => m.with(P._, () => 0),
 *     defect: () => -1,
 *   });
 * ```
 *
 * @category Guards
 */
export function isResult(x: unknown): x is Result<unknown, unknown> {
  if (x instanceof Res) return true;
  // Dual-copy / cross-realm fallback: another copy of unthrown has its own
  // `Res`, so `instanceof` fails — but its prototype carries the shared
  // `Symbol.for` brand. Reading the brand off the prototype chain keeps the
  // guarantee that a structural look-alike (no unthrown prototype) still fails.
  // Fail-closed: this guard exists for untyped boundaries, so a hostile input
  // (a Proxy `get` trap or a throwing getter at the brand key) is `false`,
  // never a throw.
  try {
    return (
      (typeof x === "object" || typeof x === "function") &&
      x !== null &&
      Reflect.get(x, RESULT_BRAND) === true
    );
  } catch {
    return false;
  }
}

/**
 * Reuse a non-matching variant (an `Err` or `Defect`) as a differently-typed
 * `Result`, with no runtime work. Sound because the passed-through variant
 * carries no value of the changed success type, so retyping it is a no-op — only
 * the phantom type parameter moves. This is the single sanctioned home for that
 * assertion (the same one boxed applies inline at every pass-through); every
 * combinator's short-circuit branch funnels through here instead of casting.
 *
 * @internal
 */
function passThrough<T, E>(self: Result<unknown, unknown>): Result<T, E> {
  return self as unknown as Result<T, E>;
}

/**
 * Runtime thenable probe, shared by the combinator-side net below and the
 * boundary nets in `interop.ts`.
 *
 * @remarks
 * Reading `.then` can itself **throw** — a hostile getter, or a Proxy `get`
 * trap — so this is deliberately not a total function, and every caller must
 * account for that. Two shapes are sanctioned, and there is no third:
 *
 * - inside a `try` that routes the throw to a `Defect` (the boundaries in
 *   `interop.ts`, where a hostile value arriving at a triage point *is* an
 *   unmodeled failure and should surface as one); or
 * - through {@link silenceIfThenable}, for a value being **discarded**, where
 *   there is no Defect channel to route to and the only correct answer is to
 *   drop it without throwing.
 *
 * Calling it bare, outside both, is a bug: the throw escapes into whatever
 * context invoked it.
 *
 * @internal
 */
export function isThenable(x: unknown): boolean {
  return (
    (typeof x === "object" || typeof x === "function") &&
    x !== null &&
    typeof (x as { then?: unknown }).then === "function"
  );
}

/**
 * Adopt-and-silence a thenable a combinator is about to **discard**.
 *
 * @remarks
 * The observers (`tap`, `tapErrCases`, `tapDefect`, `tapFailure`) throw their
 * callback's return value away, and the `Result`-returning combinators reject a
 * non-`Result` one. Either way, a thenable that slipped past `NotThenable` (a
 * cast, a raw-JS caller) is dropped while still in flight — and if it later
 * rejects, nothing is holding it, so the rejection floats unhandled and takes
 * the process down on Node by default. Worse for an observer: its whole job is
 * to make a failure visible, and this is the one path where the failure is
 * invisible.
 *
 * Adopting it costs one microtask and makes the rejection a no-op. The
 * boundaries already do exactly this for a thenable `qualify` and a thenable
 * `fn` (see `interop.ts`); this is the same net on the combinator side.
 *
 * @internal
 */
export function silenceIfThenable(value: unknown): void {
  try {
    if (isThenable(value)) void Promise.resolve(value).then(undefined, () => undefined);
  } catch {
    // A hostile `then` getter threw — there is nothing adoptable here.
  }
}

/**
 * The Defect minted when a callback constrained to return a `Result` returns
 * something else — reachable only from untyped/cast callers (in typed code the
 * constraint is a compile error). The combinator-side sibling of the
 * aggregates' non-`Result`-element guard: surface the out-of-contract value as
 * a `Defect` here rather than letting a poison value throw a raw `TypeError`
 * further down the pipeline.
 *
 * @internal
 */
function nonResultCallbackDefect<T, E>(returned?: unknown): Result<T, E> {
  // The out-of-contract value is discarded — silence it first if it is a
  // thenable, so a later rejection cannot float (see `silenceIfThenable`).
  silenceIfThenable(returned);
  return defectRes(new TypeError("unthrown: a combinator callback returned a non-Result value"));
}

/**
 * Drive an error-combinator callback: build `match(error)`, hand it (plus the
 * injected `defect`) to the callback, and `.run()` the returned exhaustive
 * builder to its output. `.run()` executes `.exhaustive()` — type-forced
 * exhaustive, so it always matches for well-typed callers; a value that slips
 * through the types (a widened cast, a JS caller) throws `NonExhaustiveError`,
 * which the caller's `try/catch` turns into a `Defect` — an unmodeled failure.
 *
 * @internal
 */
function runMatch<E>(
  f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => { run: () => unknown },
  error: E,
): unknown {
  return f(match(error) as ErrMatcher<E>, defect).run();
}

/**
 * A throw inside a *failure observer* (`tapErrCases` / `tapDefect` /
 * `tapFailure` / `flatTapErrCases`) must not destroy the failure being observed
 * — that is the exact place (e.g. a failing error-logger) where losing the
 * underlying failure hurts most. The resulting Defect aggregates both:
 * `errors[0]` is the observer's own failure, `errors[1]` the original failure.
 *
 * An observer branch returning the injected `defect(cause)` marker
 * (`tapErrCases` / `flatTapErrCases`) takes the same route: it is the
 * lint-clean, expression-position form of a `throw` (Thesis #5), so it must not
 * behave differently from one.
 *
 * @internal
 */
function observerThrowToDefect<T, E>(thrown: unknown, original: unknown): Result<T, E> {
  return defectRes(
    new AggregateError(
      [thrown, original],
      "unthrown: a failure-observer callback failed; errors[0] is the callback's failure (a throw, or a deliberate defect), errors[1] the original failure",
    ),
  );
}

/**
 * Validate that a `bind`/`let` scope is a real (non-null) object before merging a
 * key into it.
 *
 * @remarks
 * Do-notation accumulates an **object** scope: a chain starts at `Do()` (an
 * empty object) and every `bind`/`let` returns an object, so in typed code the
 * scope is always an object. The method lives on the general `Result` surface,
 * though, so a primitive `Ok` (e.g. `Ok(5).bind(...)`, or a chain whose value was
 * `map`-ped away from its scope) could reach it. Rather than let `{ ...5 }`
 * silently collapse to `{}` and drop the prior scope, we throw here — the
 * surrounding `try` turns it into a `Defect`, surfacing the misuse as the
 * bug it is (a defect is a bug, not an absent value). A `this: object` constraint
 * was rejected: TypeScript does not hard-enforce a constraint inferred solely
 * from `this`, and it breaks `AsyncRes implements AsyncResult`.
 *
 * @internal
 */
function scopeOf(value: unknown): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("bind/let requires an object scope — start a do-chain with Do()");
  }
  return value;
}

/**
 * The sole runtime implementation of {@link AsyncResult}: wraps a
 * `Promise<Result>` constructed never to reject. Operates on the public `Result`
 * union (via `tag`), never on `Res` internals. Never re-exported from `index.ts`.
 *
 * @internal
 */
export class AsyncRes<T, E> implements AsyncResult<T, E> {
  // A native #private field: invisible to property access and untouchable even
  // via Object.defineProperty, so the wrapped promise cannot be tampered with.
  readonly #promise: Promise<Result<T, E>>;

  constructor(promise: Promise<Result<T, E>>) {
    this.#promise = promise;
  }

  /**
   * Lift a **synchronous** `Result` combinator over the wrapped promise.
   *
   * @remarks
   * Every method below that does no `await` of its own is exactly its `Res`
   * twin applied to the settled `Result` — same tag check, same try/catch, same
   * throw→defect net. Delegating instead of restating it keeps the two surfaces
   * from drifting: a fix to the sync combinator is the fix to the async one.
   * The methods that DO await a callback's result (`flatMap`, `flatTap`,
   * `bind`, `flatMapErrCases`, `flatTapErrCases`, `recoverDefect` — the ones
   * whose callback may hand back an `AsyncResult`) genuinely differ and are
   * still written out in full.
   *
   * @internal
   */
  #lift<U, E2>(f: (r: Result<T, E>) => Result<U, E2>): AsyncResult<U, E2> {
    return new AsyncRes<U, E2>(this.#promise.then(f));
  }

  // oxlint-disable-next-line no-thenable -- AsyncResult is an intentional (success-only) thenable so `await` collapses it to a Result; see the Awaitable type. onrejected is still forwarded so a hypothetical internal rejection settles the await instead of hanging — though the internal promise never rejects.
  then<R1 = Result<T, E>, R2 = never>(
    onfulfilled?: ((value: Result<T, E>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.#promise.then(onfulfilled, onrejected);
  }

  map<U>(f: (value: T) => U & NotThenable<U>): AsyncResult<U, E> {
    return this.#lift((r) => r.map(f));
  }

  flatMap<U, E2>(f: (value: T) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<U, E | E2> {
    return new AsyncRes<U, E | E2>(
      this.#promise.then(async (r) => {
        if (r.tag !== "Ok") return passThrough(r);
        try {
          const inner = await f(r.value);
          return isResult(inner) ? inner : nonResultCallbackDefect<U, E | E2>(inner);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tap<R>(f: (value: T) => R & NotThenable<R>): AsyncResult<T, E> {
    return this.#lift((r) => r.tap(f));
  }

  flatTap<E2>(
    f: (value: T) => Result<unknown, E2> | AsyncResult<unknown, E2>,
  ): AsyncResult<T, E | E2> {
    return new AsyncRes<T, E | E2>(
      this.#promise.then(async (r) => {
        if (r.tag !== "Ok") return passThrough(r);
        try {
          const inner = await f(r.value);
          if (!isResult(inner)) return nonResultCallbackDefect(inner);
          // Keep the original value on success; an Err/Defect from `f` wins.
          return inner.tag === "Ok" ? r : passThrough(inner);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  bind<K extends string, U, E2>(
    name: K,
    f: (scope: T) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<Bound<T, K, U>, E | E2> {
    return new AsyncRes<Bound<T, K, U>, E | E2>(
      this.#promise.then(async (r) => {
        if (r.tag !== "Ok") return passThrough(r);
        try {
          const inner = await f(r.value);
          if (!isResult(inner)) return nonResultCallbackDefect(inner);
          if (inner.tag !== "Ok") return passThrough(inner);
          return okRes({ ...scopeOf(r.value), [name]: inner.value }) as unknown as Result<
            Bound<T, K, U>,
            E | E2
          >;
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  let<K extends string, U>(
    name: K,
    f: (scope: T) => U & NotThenable<U>,
  ): AsyncResult<Bound<T, K, U>, E> {
    return this.#lift((r) => r.let(name, f));
  }

  as<U>(value: U): AsyncResult<U, E> {
    return this.#lift((r) => r.as(value));
  }

  discard(): AsyncResult<void, E> {
    return this.#lift((r) => r.discard());
  }

  // Like the matcher methods below, `ensure` is typed loosely here (`never`
  // channels) because TypeScript cannot relate this single implementation
  // signature to the public type-guard/boolean overload pair across the
  // class/`implements` boundary; `AsyncResultMethods` re-imposes the precision.
  ensure(
    predicate: (value: T) => boolean,
    onFail: (value: T) => unknown,
  ): AsyncResult<never, never> {
    return this.#lift((r) => r.ensure(predicate, onFail) as Result<never, never>);
  }

  // The precise generic-M matcher signatures live on the public surface
  // (`AsyncResultMethods`); TypeScript cannot unify them across the
  // class/`implements` boundary (relating the two generic signatures fails to
  // equate `MatchErrOut<M>` on each side), so these implementations are typed
  // loosely — `never` error channels keep the returns bivariantly compatible —
  // and the interface re-imposes the precision, mirroring how `get`'s `this`
  // gate is re-imposed in `types.ts`.
  mapErrCases(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => ExhaustiveMatch<unknown>,
  ): AsyncResult<T, never> {
    return this.#lift((r) => r.mapErrCases(f) as Result<T, never>);
  }

  flatMapErrCases(
    f: (
      matcher: ErrMatcher<E>,
      defect: (cause: unknown) => Defect,
    ) => ExhaustiveMatch<Result<unknown, unknown> | AsyncResult<unknown, unknown> | Defect>,
  ): AsyncResult<T, never> {
    return new AsyncRes<T, never>(
      this.#promise.then(async (r) => {
        if (r.tag !== "Err") return passThrough(r);
        try {
          const out = runMatch(f, r.error);
          if (isDefectMarker(out)) return defectRes<T, never>(out.cause);
          const inner = await (out as Result<unknown, unknown> | AsyncResult<unknown, unknown>);
          if (!isResult(inner)) return nonResultCallbackDefect<T, never>(inner);
          return inner as Result<T, never>;
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  recoverErrCases(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => ExhaustiveMatch<unknown>,
  ): AsyncResult<T, never> {
    return this.#lift((r) => r.recoverErrCases(f) as Result<T, never>);
  }

  tapErrCases(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => ExhaustiveMatch<unknown>,
  ): AsyncResult<T, E> {
    return this.#lift((r) => r.tapErrCases(f));
  }

  flatTapErrCases(
    f: (
      matcher: ErrMatcher<E>,
      defect: (cause: unknown) => Defect,
    ) => ExhaustiveMatch<Result<unknown, unknown> | AsyncResult<unknown, unknown>>,
  ): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.#promise.then(async (r) => {
        if (r.tag !== "Err") return passThrough(r);
        try {
          const out = runMatch(f, r.error);
          // Checked BEFORE the await, mirroring the async `flatMapErrCases`: the
          // marker is never thenable, so awaiting it would be a no-op microtask.
          // Same observer treatment as the sync surface — the observed error
          // survives alongside the caller's cause.
          if (isDefectMarker(out)) return observerThrowToDefect(out.cause, r.error);
          const inner = await (out as Result<unknown, unknown> | AsyncResult<unknown, unknown>);
          if (!isResult(inner)) return nonResultCallbackDefect(inner);
          // Keep the original error on success; an Err/Defect from the effect wins.
          return inner.tag === "Ok" ? passThrough(r) : passThrough(inner);
        } catch (cause) {
          return observerThrowToDefect(cause, r.error);
        }
      }),
    );
  }

  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<T | U, E | E2> {
    return new AsyncRes<T | U, E | E2>(
      this.#promise.then(async (r) => {
        if (r.tag !== "Defect") return r;
        try {
          const inner = await f(r.cause);
          return isResult(inner) ? inner : nonResultCallbackDefect<T | U, E | E2>(inner);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tapDefect<R>(f: (cause: unknown) => R & NotThenable<R>): AsyncResult<T, E> {
    return this.#lift((r) => r.tapDefect(f));
  }

  tapFailure<R>(f: (failure: FailureView<E, T>) => R & NotThenable<R>): AsyncResult<T, E> {
    return this.#lift((r) => r.tapFailure(f));
  }

  match<ROk, RDefect, M extends ExhaustiveMatch<unknown>>(cases: {
    ok: (value: T) => ROk;
    errCases: (matcher: ErrMatcher<E>) => M;
    defect: (cause: unknown) => RDefect;
  }): Promise<ROk | RDefect | MatchOut<M>> {
    return this.#promise.then((r) => r.match(cases));
  }

  get(): Promise<T> {
    return this.#promise.then((r) => (r as Result<T, never>).get());
  }
  getErr(): Promise<E> {
    return this.#promise.then((r) => (r as Result<never, E>).getErr());
  }
  getOr<U>(fallback: U): Promise<T | U> {
    return this.#promise.then((r) => r.getOr(fallback));
  }
  getOrElse<U>(f: (error: E) => U): Promise<T | U> {
    return this.#promise.then((r) => r.getOrElse(f));
  }
  getOrNull(): Promise<T | null> {
    return this.#promise.then((r) => r.getOrNull());
  }
  getOrUndefined(): Promise<T | undefined> {
    return this.#promise.then((r) => r.getOrUndefined());
  }
  getOrThrow(): Promise<T> {
    // The cast sidesteps `getOrThrow`'s `this` gate (non-empty error channel),
    // re-imposed on the public `AsyncResultMethods` signature — mirroring `get`.
    return this.#promise.then((r) => (r as Result<T, unknown>).getOrThrow());
  }
}

// Same hardening as `Res.prototype` above: the shared async combinators cannot
// be swapped out from under every instance. (The wrapped promise is already a
// native #private field, unreachable from outside.)
Object.freeze(AsyncRes.prototype);
