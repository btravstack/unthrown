// unthrown — public type surface. Pure types, no runtime.

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
 * The fluent method surface every {@link Result} variant carries — the
 * combinators (`map`, `flatMap`, `mapErr`, `match`, `unwrap`, …), documented one
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
export type ResultMethods<T, E> = {
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
   * Transform the modeled error with `f`.
   *
   * Runs `f` only on `Err`; `Ok` passes through and a `Defect` is **never**
   * touched. If `f` throws, the throw becomes a `Defect`. An async callback is
   * rejected at compile time ({@link NotThenable}).
   *
   * @typeParam E2 - the mapped error type.
   * @param f - maps the current error to a new one.
   */
  mapErr<E2>(f: (error: E) => E2 & NotThenable<E2>): Result<T, E2>;
  /**
   * Recover from an `Err` by producing another `Result`.
   *
   * Runs `f` only on `Err`; `Ok` and `Defect` pass through. If `f` throws, the
   * throw becomes a `Defect`.
   *
   * @typeParam U - an alternative success type `f` may produce.
   * @typeParam E2 - the error type `f` may produce instead.
   * @param f - produces a fallback `Result` from the current error.
   */
  orElse<U, E2>(f: (error: E) => Result<U, E2>): Result<T | U, E2>;
  /**
   * Recover from an `Err` by producing a success value, emptying the error
   * channel.
   *
   * @remarks
   * The result type is `Result<T | U, never>`, but `never` describes only the
   * **error** channel — a `Defect` can still be present at runtime, so do not
   * read `never` as "total". Runs `f` only on `Err`; `Ok` and `Defect` pass
   * through. If `f` throws, the throw becomes a `Defect`. An async callback is
   * rejected at compile time ({@link NotThenable}).
   *
   * @typeParam U - the recovered success type.
   * @param f - produces a success value from the current error.
   */
  recover<U>(f: (error: E) => U & NotThenable<U>): Result<T | U, never>;
  /**
   * Run a side effect on the error and pass the `Result` through unchanged.
   *
   * Runs only on `Err`. If `f` throws, the result is a `Defect` whose cause is
   * an `AggregateError` of `[thrown, original failure]` — observing a failure
   * never destroys it. An async callback is rejected at compile time
   * ({@link NotThenable}).
   *
   * @param f - the side effect (its return value is ignored).
   */
  tapErr<R>(f: (error: E) => R & NotThenable<R>): Result<T, E>;
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
   * @typeParam E2 - the error type the effect may introduce.
   * @param f - the failable side effect; its `Ok` value is ignored.
   */
  flatTapErr<E2>(f: (error: E) => Result<unknown, E2>): Result<T, E | E2>;

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
   * @returns the `Ok` value.
   * @throws On `Err`, an {@link UnwrapError} carrying the error. On a `Defect`,
   * re-throws the **original cause** with its original stack, so an unhandled
   * Defect surfaces at the global handler as the real failure.
   */
  unwrap(): T;
  /**
   * Extract the modeled error.
   *
   * @returns the `Err` value.
   * @throws On `Ok`, an {@link UnwrapError} carrying the value. On a `Defect`,
   * re-throws the original cause.
   */
  unwrapErr(): E;
  /**
   * The success value, or `fallback` on `Err`.
   *
   * @typeParam U - the fallback type (may differ from `T`; the return widens to `T | U`).
   * @param fallback - returned when the result is an `Err` (may be a different type; the return widens to `T | U`).
   * @throws Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
   * it is never silently replaced.
   */
  unwrapOr<U>(fallback: U): T | U;
  /**
   * The success value, or `f(error)` on `Err`.
   *
   * @param f - lazily computes the fallback from the error.
   * @throws Re-throws on a `Defect`.
   */
  unwrapOrElse(f: (error: E) => T): T;
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
 * (the only way `await` can collapse it); the narrowing simply keeps it from
 * being treated as a raw promise (e.g. dropped into `Promise.all`).
 *
 * @typeParam T - the value `await` resolves to.
 *
 * @category Types
 */
export type Awaitable<T> = {
  then<R = T>(onfulfilled?: ((value: T) => R | PromiseLike<R>) | null): PromiseLike<R>;
};

/**
 * The async method surface every {@link AsyncResult} carries — the combinators
 * (`map`, `flatMap`, `mapErr`, `match`, `unwrap`, …) with their asynchronous
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
export type AsyncResultMethods<T, E> = {
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
   * ({@link NotThenable}).
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

  /**
   * Asynchronous {@link ResultMethods.mapErr | mapErr}. `f` is synchronous; a
   * throw becomes a `Defect`. An async callback is rejected at compile time
   * ({@link NotThenable}).
   */
  mapErr<E2>(f: (error: E) => E2 & NotThenable<E2>): AsyncResult<T, E2>;
  /**
   * Asynchronous {@link ResultMethods.orElse | orElse}. `f` may return a `Result`
   * or an `AsyncResult`.
   */
  orElse<U, E2>(f: (error: E) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<T | U, E2>;
  /**
   * Asynchronous {@link ResultMethods.recover | recover}. `f` is synchronous; a
   * throw becomes a `Defect`. An async callback is rejected at compile time
   * ({@link NotThenable}).
   */
  recover<U>(f: (error: E) => U & NotThenable<U>): AsyncResult<T | U, never>;
  /**
   * Asynchronous {@link ResultMethods.tapErr | tapErr}. `f` is synchronous; if it
   * throws, the result is a `Defect` whose cause is an `AggregateError` of
   * `[thrown, original failure]` — observing a failure never destroys it. An
   * async callback is rejected at compile time ({@link NotThenable}).
   */
  tapErr<R>(f: (error: E) => R & NotThenable<R>): AsyncResult<T, E>;
  /**
   * Asynchronous {@link ResultMethods.flatTapErr | flatTapErr} — the
   * error-channel mirror of `flatTap`. `f` may return a `Result` **or** an
   * `AsyncResult`; its `Ok` value is discarded, an `Err`/`Defect` from `f`
   * threads through, and if `f` throws, the result is a `Defect` whose cause is
   * an `AggregateError` of `[thrown, original failure]` — observing a failure
   * never destroys it.
   */
  flatTapErr<E2>(
    f: (error: E) => Result<unknown, E2> | AsyncResult<unknown, E2>,
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
   * Asynchronous {@link ResultMethods.match | match}. Handlers are synchronous;
   * resolves to a `Promise<R>`.
   */
  match<R>(cases: {
    ok: (value: T) => R;
    err: (error: E) => R;
    defect: (cause: unknown) => R;
  }): Promise<R>;
  /**
   * Asynchronous {@link ResultMethods.unwrap | unwrap}. The returned promise
   * rejects on `Err`/`Defect`.
   */
  unwrap(): Promise<T>;
  /** Asynchronous {@link ResultMethods.unwrapErr | unwrapErr}. */
  unwrapErr(): Promise<E>;
  /** Asynchronous {@link ResultMethods.unwrapOr | unwrapOr}. */
  unwrapOr<U>(fallback: U): Promise<T | U>;
  /** Asynchronous {@link ResultMethods.unwrapOrElse | unwrapOrElse}. */
  unwrapOrElse(f: (error: E) => T): Promise<T>;
  /** Asynchronous {@link ResultMethods.getOrNull | getOrNull}. */
  getOrNull(): Promise<T | null>;
  /** Asynchronous {@link ResultMethods.getOrUndefined | getOrUndefined}. */
  getOrUndefined(): Promise<T | undefined>;
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
 * qualify))`. The eliminators (`unwrap`, …) return promises; the binds
 * (`flatMap`, `flatTap`, `orElse`, `recoverDefect`) additionally accept an
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
export type AsyncOkOf<R> = R extends AsyncResult<infer T, unknown> ? T : never;
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
export type AsyncErrOf<R> = R extends AsyncResult<unknown, infer E> ? E : never;
