// unthrown — public type surface. Pure types, no runtime.

import type { Defect } from "./defect.js";
import type { match } from "./matcher.js";

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
 * The built-in match builder over an error union `E`, as produced by
 * `match(error)`. This is what an error combinator's callback receives — chain
 * `.with(pattern, handler)` on it; the combinator itself calls `.exhaustive()`,
 * so the callback returns the **un-terminated** builder.
 *
 * @remarks
 * Named via `ReturnType<typeof match<E>>` (i.e. `Matcher<E, E, never>`),
 * keeping this alias stable however the builder evolves.
 *
 * @typeParam E - the error union being matched.
 * @category Types
 */
export type ErrMatcher<E> = ReturnType<typeof match<E>>;

/**
 * The shape an error-combinator callback must return: an **exhaustive**
 * match builder. `exhaustive` is required to be *callable* — on a builder
 * that hasn't covered every case the matcher types it as a branded diagnostic
 * (not a function), so a non-exhaustive chain fails to satisfy this and errors
 * at the call site. `run` carries the output type.
 *
 * @typeParam O - the union of the branch return types (the builder's output).
 * @internal
 */
export type ExhaustiveMatch<O> = {
  exhaustive: (...args: never[]) => unknown;
  run: () => O;
};

/**
 * The output of an `ExhaustiveMatch` — the union of its branch returns.
 *
 * @internal
 */
export type MatchOut<M> = M extends ExhaustiveMatch<infer O> ? O : never;

/**
 * The outgoing modeled-error type a transforming match produces: the builder's
 * output with the `Defect` arm **subtracted** (`Exclude<O, Defect>`, the same
 * inference as the boundary `qualify`, Thesis #3). A branch that returns
 * `defect(cause)` therefore contributes nothing to the modeled channel.
 *
 * @internal
 */
export type MatchErrOut<M> = Exclude<MatchOut<M>, Defect>;

/**
 * The fluent method surface every {@link Result} variant carries — the
 * combinators (`map`, `flatMap`, `mapErrCases`, `match`, `get`, …), documented one
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
   * Validate the success value — keep the `Ok` when `predicate` holds,
   * otherwise fail into the **modeled** channel with `Err(onFail(value))`.
   *
   * @remarks
   * The named form of `flatMap((v) => (p(v) ? Ok(v) : Err(e)))`. With a
   * **type-guard** predicate (`(v): v is U`) the success type is **refined** to
   * `U` on the way through (this overload). Runs only on `Ok` — a passing value
   * flows through as the *same* `Ok`; `Err` and `Defect` pass through
   * untouched. A throw in `predicate` or `onFail` becomes a `Defect`.
   *
   * Both callbacks are synchronous: an async `onFail` is rejected at compile
   * time ({@link NotThenable}), and an async predicate does not type-check
   * either — its `Promise<boolean>` is not a `boolean` (and, being truthy,
   * would have silently always passed).
   *
   * @typeParam U - the refined success type (type-guard form).
   * @typeParam E2 - the error type `onFail` produces.
   * @param predicate - the check; a type guard refines `T` to `U`.
   * @param onFail - maps the failing value to the modeled error.
   *
   * @example
   * ```ts
   * // boolean form: gate a value
   * Ok(-1).ensure((n) => n > 0, (n) => `negative: ${n}`); // Err("negative: -1")
   *
   * // type-guard form: refine the success type
   * declare const r: Result<string | number, "e">;
   * const s = r.ensure(
   *   (v): v is string => typeof v === "string",
   *   () => "not_a_string" as const,
   * ); // Result<string, "e" | "not_a_string">
   * ```
   */
  ensure<U extends T, E2>(
    predicate: (value: T) => value is U,
    onFail: (value: T) => E2 & NotThenable<E2>,
  ): Result<U, E | E2>;
  /**
   * Boolean form of {@link ResultMethods.ensure | ensure} — validates without
   * refining, keeping the success type `T`.
   */
  ensure<E2>(
    predicate: (value: T) => boolean,
    onFail: (value: T) => E2 & NotThenable<E2>,
  ): Result<T, E | E2>;

  /**
   * Transform the modeled error by **matching it exhaustively**.
   *
   * @remarks
   * The callback receives `match(error)` (an {@link ErrMatcher}) and the
   * injected `defect` helper. Chain `.with(pattern, handler)` and **return the
   * un-terminated builder** — `mapErrCases` calls `.exhaustive()` itself, so a
   * missing case is a compile error at the call site (there is no `.exhaustive()`
   * to forget, and no way to slip in `.otherwise()`). The outgoing error type is
   * the union of the branch returns with the `Defect` arm subtracted
   * (`Exclude<O, Defect>`) — a branch returning `defect(cause)` converts that case
   * to a `Defect` and drops it from `E`. Runs only on `Err`; `Ok` and `Defect`
   * pass through. A branch that throws also becomes a `Defect`.
   *
   * `.with(P._, …)` is the deliberate uniform/catch-all (it makes the match
   * exhaustive). Match on anything the matcher supports — `_tag`, `code`,
   * structural shape, guards, or grouped patterns `.with(a, b, handler)`.
   *
   * @typeParam M - the exhaustive builder the callback returns.
   * @param f - builds the match over the error (returns the un-terminated builder).
   */
  mapErrCases<M extends ExhaustiveMatch<unknown>>(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): Result<T, MatchErrOut<M>>;

  /**
   * Sequence from an `Err` by producing another `Result` — the error-channel
   * mirror of {@link ResultMethods.flatMap | flatMap}, **matching the error
   * exhaustively** ({@link ErrMatcher}; the combinator calls `.exhaustive()`).
   *
   * Each branch returns a `Result`; the outgoing channels are the unions of the
   * branch-returned `Result`s' channels. A branch may return `defect(cause)`.
   * Runs only on `Err`; `Ok` and `Defect` pass through.
   *
   * @typeParam M - the exhaustive builder the callback returns.
   * @param f - builds the match; each branch produces a fallback `Result`.
   */
  flatMapErrCases<M extends ExhaustiveMatch<Result<unknown, unknown> | Defect>>(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): Result<T | OkOf<MatchOut<M>>, ErrOf<MatchOut<M>>>;

  /**
   * Recover from an `Err` by producing a success value, emptying the error
   * channel — **matching the error exhaustively** ({@link ErrMatcher}). Pairs
   * with {@link ResultMethods.recoverDefect | recoverDefect}.
   *
   * @remarks
   * The result type is `Result<T | U, never>`, but `never` describes only the
   * **error** channel — a `Defect` can still be present at runtime. A branch may
   * return `defect(cause)` (which stays a `Defect`, not a recovery). Runs only on
   * `Err`; `Ok` and `Defect` pass through.
   *
   * @typeParam M - the exhaustive builder the callback returns.
   * @param f - builds the match; each branch produces a success value.
   */
  recoverErrCases<M extends ExhaustiveMatch<unknown>>(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): Result<T | MatchErrOut<M>, never>;

  /**
   * Run a side effect on the error — **matched exhaustively** ({@link ErrMatcher})
   * — and pass the `Result` through unchanged.
   *
   * @remarks
   * The callback builds a match whose branches run side effects; their return
   * values are ignored and the original `Err` flows through. Exhaustive like the
   * transformers (use `.with(P._, …)` for a catch-all). If a branch throws, the
   * result is a `Defect` whose cause is an `AggregateError` of `[thrown, original
   * failure]` — observing a failure never destroys it. An **async branch is
   * rejected at compile time** ({@link NotThenable} on the builder output):
   * because the branch results are discarded, a returned `Promise` would float
   * unobserved and its rejection would vanish. The one branch return that is
   * **not** discarded is the injected `defect(cause)` marker: it is the
   * lint-clean, expression-position form of a `throw`, so it follows the throw
   * rule above (an `AggregateError` of `[the branch's cause, original
   * failure]`), never a silent no-op. A failable
   * `Result`-returning effect belongs in
   * {@link ResultMethods.flatTapErrCases | flatTapErrCases}.
   *
   * @param f - builds the match; branch returns are ignored, bar `defect(cause)`.
   */
  tapErrCases<R>(
    f: (
      matcher: ErrMatcher<E>,
      defect: (cause: unknown) => Defect,
    ) => ExhaustiveMatch<R & NotThenable<R>>,
  ): Result<T, E>;

  /**
   * Run a **failable** side effect on the error, keeping the original error but
   * threading the effect's own error — **matched exhaustively**
   * ({@link ErrMatcher}).
   *
   * @remarks
   * The error-channel mirror of {@link ResultMethods.flatTap | flatTap}: each
   * branch returns a `Result` whose **success value is discarded** — on the
   * effect's `Ok` the original `Err` flows through, while an `Err`/`Defect` from a
   * branch short-circuits and threads its error. Note the asymmetry with a
   * *throw*: a branch that **returns** a Defect-state `Result` **replaces** the
   * original `Err` (Defect-dominance, the short-circuit rule — it is not
   * aggregated), whereas a branch that **throws** produces a `Defect`
   * aggregating `[thrown, original failure]` (observing a failure by throwing
   * never destroys it). A branch returning the injected `defect(cause)` marker —
   * reachable under a `returnType` pin — follows the *throw* rule, since it is
   * the lint-clean, expression-position form of one.
   *
   * @typeParam M - the exhaustive builder the callback returns.
   * @param f - builds the match; each branch is a failable effect (its `Ok` is ignored).
   */
  flatTapErrCases<E2>(
    f: (
      matcher: ErrMatcher<E>,
      defect: (cause: unknown) => Defect,
    ) => ExhaustiveMatch<Result<unknown, E2>>,
  ): Result<T, E | E2>;

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
   * duplicated across {@link ResultMethods.tapErrCases | tapErrCases} and
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
   * {@link ResultMethods.recoverErrCases | recoverErrCases} /
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
   * Exhaustively fold all three runtime states into a single value.
   *
   * @remarks
   * Exactly one handler runs. Together with the throw-to-Defect guarantee, this
   * is typically the single place a pipeline is handled at the edge — mapping
   * `Ok`/`Err`/`Defect` to (for example) 2xx / 4xx / 5xx with no `try`/`catch`.
   *
   * The `errCases` handler does not take a single blanket callback: it receives
   * `match(error)` (an {@link ErrMatcher}) and **matches the error exhaustively**,
   * exactly like the error combinators — which is why the key carries the same
   * `…Cases` suffix. Chain `.with(pattern, handler)` and **return the
   * un-terminated builder** — `match` calls `.exhaustive()` itself, so a missing
   * case is a compile error at the call site (no `.exhaustive()` to forget). Use
   * `.with(P._, …)` for a uniform catch-all. Unlike the combinators the branches
   * receive **no `defect` helper** — `match` is total elimination to a value,
   * with no `Defect` output channel; the `defect` case handles a `Result` that
   * already carries one. (A `Result` is also a discriminated union — for richer
   * whole-`Result` matching, `match(result).with(…)`.)
   *
   * @typeParam ROk - the `ok` handler return type.
   * @typeParam RDefect - the `defect` handler return type.
   * @typeParam M - the exhaustive builder the `errCases` handler returns.
   * @param cases - the `ok`/`defect` handlers plus the `errCases` matcher builder.
   */
  match<ROk, RDefect, M extends ExhaustiveMatch<unknown>>(cases: {
    ok: (value: T) => ROk;
    errCases: (matcher: ErrMatcher<E>) => M;
    defect: (cause: unknown) => RDefect;
  }): ROk | RDefect | MatchOut<M>;
  /**
   * Extract the success value.
   *
   * @remarks
   * Compiles only when the error channel is empty (`E = never`) — eliminate
   * modeled errors first (`match` / `recoverErrCases` / `flatMapErrCases`), or reach for the
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
   * The success value, or `fallback` on `Err`.
   *
   * @typeParam U - the fallback type (may differ from `T`; the return widens to `T | U`).
   * @param fallback - returned when the result is an `Err` (may be a different type; the return widens to `T | U`).
   * @throws Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
   * it is never silently replaced.
   */
  getOr<U>(fallback: U): T | U;
  /**
   * The success value, or `f(error)` on `Err`.
   *
   * @typeParam U - the fallback type (may differ from `T`; the return widens to `T | U`).
   * @param f - lazily computes the fallback from the error (may return a different type; the return widens to `T | U`).
   * @throws Re-throws on a `Defect`.
   */
  getOrElse<U>(f: (error: E) => U): T | U;
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
   * A deliberate escape hatch off the errors-as-values model — it **throws the
   * `Err` value as-is** at the call site. Its purpose is to move a literal
   * `throw` behind a method, so a `no-throw` lint rule can ban raw throws while
   * this one sanctioned extraction remains — _not_ to replace principled
   * handling. When you can keep the error a value, prefer
   * {@link ResultMethods.match | match} / {@link ResultMethods.recoverErrCases | recoverErrCases} /
   * {@link ResultMethods.flatMapErrCases | flatMapErrCases}.
   *
   * Type-gated as the **complement** of {@link ResultMethods.get | get}: it
   * compiles only when the error channel is **non-empty** (`E` is not `never`) —
   * there must be a modeled error for it to throw. On a `Result<T, never>` there
   * is nothing to throw, so `getOrThrow` does not compile; use `get()` (which
   * gates the other way). Together they partition extraction by the error
   * channel's state, with no overlap.
   *
   * @returns the `Ok` value.
   * @throws the modeled `error` on `Err`; re-throws the original `cause` on a
   * `Defect` (a panic, like the rest of the `getOr…` family).
   */
  getOrThrow(
    this: [E] extends [never]
      ? "unthrown: getOrThrow is unnecessary here — the Err channel is empty (E = never), so there is nothing to throw. Use get() instead."
      : Result<T, E>,
  ): T;

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
// oxlint-disable-next-line typescript/consistent-type-definitions -- deliberately an interface, not a `type` intersection: interfaces are the only construct that can carry a VERIFIED `out T, out E` variance annotation, which the intersection form silently loses (TS measures intersection variance structurally, where the matcher makes `E` invariant — a concrete `Err` then fails to widen into a generic error union)
export interface OkView<out T, out E = never> extends ResultMethods<T, E> {
  readonly tag: "Ok";
  readonly value: T;
}
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
// oxlint-disable-next-line typescript/consistent-type-definitions -- see OkView: the variance annotations require an interface
export interface ErrView<out E, out T = never> extends ResultMethods<T, E> {
  readonly tag: "Err";
  readonly error: E;
}
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
// oxlint-disable-next-line typescript/consistent-type-definitions -- see OkView: the variance annotations require an interface
export interface DefectView<out T = never, out E = never> extends ResultMethods<T, E> {
  readonly tag: "Defect";
  readonly cause: unknown;
}

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
 * the built-in `match(...).with({ tag: "Ok" }, …).exhaustive()`), *and* it
 * carries the full method surface ({@link ResultMethods}) for fluent chaining.
 * Either way, the payload (`value`/`error`/`cause`) is only reachable after you
 * narrow — so "check before you access" still holds.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type (only anticipated domain failures).
 *
 * @example
 * ```ts
 * import { Ok, Err, P, type Result } from "unthrown";
 *
 * function half(n: number): Result<number, "odd"> {
 *   return n % 2 === 0 ? Ok(n / 2) : Err("odd");
 * }
 *
 * const message = half(10).match({
 *   ok: (n) => `got ${n}`,
 *   errCases: (matcher) => matcher.with(P._, (e) => `failed: ${e}`),
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
 * (`map`, `flatMap`, `mapErrCases`, `match`, `get`, …) with their asynchronous
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
   *
   * @remarks
   * The async branch of `f`'s return type is spelled `Awaitable<Result<U, E2>> &
   * { flatMap: unknown }` rather than `AsyncResult<U, E2>`: this is what you get
   * by returning an `AsyncResult` (it satisfies both), but inference runs through
   * the `Awaitable` then-channel so `U`/`E2` stay precise instead of collapsing
   * to `unknown`, while the `{ flatMap: unknown }` marker still rejects a bare
   * `Promise` (it has no `flatMap`). Just return a `Result` or an `AsyncResult`.
   */
  flatMap<U, E2>(
    // async branch spelled `Awaitable & { flatMap }` for junk-free inference — see @remarks
    f: (value: T) => Result<U, E2> | (Awaitable<Result<U, E2>> & { flatMap: unknown }),
  ): AsyncResult<U, E | E2>;
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
    // See `flatMap` above for why the async branch is `Awaitable<…> & { flatMap }`
    // rather than `AsyncResult<…>` (junk-free `E2` inference; excludes raw Promises).
    f: (value: T) => Result<unknown, E2> | (Awaitable<Result<unknown, E2>> & { flatMap: unknown }),
  ): AsyncResult<T, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.bind | bind} (do-notation). `f` may return
   * a `Result` **or** an `AsyncResult`; its value is bound under `name` in the
   * accumulating scope.
   */
  bind<K extends string, U, E2>(
    name: K,
    // See `flatMap` above for why the async branch is `Awaitable<…> & { flatMap }`
    // rather than `AsyncResult<…>` (junk-free `U`/`E2` inference; excludes raw Promises).
    f: (scope: T) => Result<U, E2> | (Awaitable<Result<U, E2>> & { flatMap: unknown }),
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
   * Asynchronous {@link ResultMethods.ensure | ensure}: validate the success
   * value — and, with a type-guard predicate (this overload), **refine** it —
   * failing into the modeled channel with `Err(onFail(value))`. Both callbacks
   * are synchronous (an async `onFail` is rejected at compile time,
   * {@link NotThenable}); a throw in either becomes a `Defect`.
   */
  ensure<U extends T, E2>(
    predicate: (value: T) => value is U,
    onFail: (value: T) => E2 & NotThenable<E2>,
  ): AsyncResult<U, E | E2>;
  /** Boolean form of the asynchronous {@link ResultMethods.ensure | ensure} — validates without refining, keeping `T`. */
  ensure<E2>(
    predicate: (value: T) => boolean,
    onFail: (value: T) => E2 & NotThenable<E2>,
  ): AsyncResult<T, E | E2>;

  /**
   * Asynchronous {@link ResultMethods.mapErrCases | mapErrCases} — the same exhaustive
   * {@link ErrMatcher} form; the combinator calls `.exhaustive()`.
   */
  mapErrCases<M extends ExhaustiveMatch<unknown>>(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): AsyncResult<T, MatchErrOut<M>>;

  /**
   * Asynchronous {@link ResultMethods.flatMapErrCases | flatMapErrCases} — the same
   * exhaustive {@link ErrMatcher} form. Unlike the sync form, a branch may
   * return a `Result` **or** an `AsyncResult`.
   */
  flatMapErrCases<
    M extends ExhaustiveMatch<Result<unknown, unknown> | AsyncResult<unknown, unknown> | Defect>,
  >(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): AsyncResult<
    T | OkOf<MatchOut<M>> | AsyncOkOf<MatchOut<M>>,
    ErrOf<MatchOut<M>> | AsyncErrOf<MatchOut<M>>
  >;

  /**
   * Asynchronous {@link ResultMethods.recoverErrCases | recoverErrCases} — the same
   * exhaustive {@link ErrMatcher} form. Branches are synchronous; a throw
   * becomes a `Defect`.
   */
  recoverErrCases<M extends ExhaustiveMatch<unknown>>(
    f: (matcher: ErrMatcher<E>, defect: (cause: unknown) => Defect) => M,
  ): AsyncResult<T | MatchErrOut<M>, never>;

  /**
   * Asynchronous {@link ResultMethods.tapErrCases | tapErrCases}. `f` is synchronous; if it
   * throws — or a branch returns the injected `defect(cause)` marker, the
   * expression-position form of a throw — the result is a `Defect` whose cause
   * is an `AggregateError` of `[thrown, original failure]` — observing a failure
   * never destroys it. An
   * async branch is rejected at compile time ({@link NotThenable} on the
   * builder output) — other branch results are discarded, so a rejected
   * `Promise` would float unobserved. The
   * {@link AsyncResultMethods.tap | tap} fire-and-forget caveat applies here
   * too — a failable effect belongs in
   * {@link AsyncResultMethods.flatTapErrCases | flatTapErrCases}.
   */
  tapErrCases<R>(
    f: (
      matcher: ErrMatcher<E>,
      defect: (cause: unknown) => Defect,
    ) => ExhaustiveMatch<R & NotThenable<R>>,
  ): AsyncResult<T, E>;

  /**
   * Asynchronous {@link ResultMethods.flatTapErrCases | flatTapErrCases} — the
   * error-channel mirror of `flatTap`. `f` may return a `Result` **or** an
   * `AsyncResult`; its `Ok` value is discarded, an `Err`/`Defect` from `f`
   * threads through, and if `f` throws — or a branch returns the injected
   * `defect(cause)` marker, the expression-position form of a throw — the result
   * is a `Defect` whose cause is an `AggregateError` of `[thrown, original
   * failure]` — observing a failure never destroys it.
   */
  flatTapErrCases<E2>(
    f: (
      matcher: ErrMatcher<E>,
      defect: (cause: unknown) => Defect,
    ) => ExhaustiveMatch<Result<unknown, E2> | AsyncResult<unknown, E2>>,
  ): AsyncResult<T, E | E2>;

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
   * Asynchronous {@link ResultMethods.match | match}. Handlers are synchronous
   * (the `errCases` handler returns an exhaustive {@link ErrMatcher} builder, no
   * `defect` helper); resolves to a `Promise` of the folded value.
   */
  match<ROk, RDefect, M extends ExhaustiveMatch<unknown>>(cases: {
    ok: (value: T) => ROk;
    errCases: (matcher: ErrMatcher<E>) => M;
    defect: (cause: unknown) => RDefect;
  }): Promise<ROk | RDefect | MatchOut<M>>;
  /**
   * Asynchronous {@link ResultMethods.get | get}. Compiles only when the
   * error channel is empty (`this: AsyncResult<T, never>`); the returned promise
   * rejects on a `Defect` (rethrowing its cause).
   */
  get(this: AsyncResult<T, never>): Promise<T>;
  /**
   * Asynchronous {@link ResultMethods.getErr | getErr}. Compiles only when
   * the success channel is empty (`this: AsyncResult<never, E>`); the returned
   * promise rejects on a `Defect` (rethrowing its cause).
   */
  getErr(this: AsyncResult<never, E>): Promise<E>;
  /** Asynchronous {@link ResultMethods.getOr | getOr}. */
  getOr<U>(fallback: U): Promise<T | U>;
  /** Asynchronous {@link ResultMethods.getOrElse | getOrElse}. */
  getOrElse<U>(f: (error: E) => U): Promise<T | U>;
  /** Asynchronous {@link ResultMethods.getOrNull | getOrNull}. */
  getOrNull(): Promise<T | null>;
  /** Asynchronous {@link ResultMethods.getOrUndefined | getOrUndefined}. */
  getOrUndefined(): Promise<T | undefined>;
  /**
   * Asynchronous {@link ResultMethods.getOrThrow | getOrThrow} — the returned
   * promise **rejects** with the modeled error on `Err` (or the original cause
   * on a `Defect`), rather than throwing synchronously. Gated the same way: it
   * compiles only when the error channel is non-empty (`E` is not `never`).
   */
  getOrThrow(
    this: [E] extends [never]
      ? "unthrown: getOrThrow is unnecessary here — the Err channel is empty (E = never), so there is nothing to throw. Use get() instead."
      : AsyncResult<T, E>,
  ): Promise<T>;
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
 * (`flatMap`, `flatTap`, `flatMapErrCases`, `recoverDefect`) additionally accept an
 * `AsyncResult`. Its combinators are documented one per entry on
 * {@link AsyncResultMethods}.
 *
 * To pattern-match an `AsyncResult`, `await` it first: `match(await ar)`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- see OkView: the variance annotations require an interface
export interface AsyncResult<out T, out E>
  extends Awaitable<Result<T, E>>, AsyncResultMethods<T, E> {}

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
