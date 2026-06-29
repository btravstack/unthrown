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
 * The method surface every {@link Result} variant carries. Factored out so the
 * three variants ({@link OkView}, {@link ErrView}, {@link DefectView}) can each
 * intersect it. Not part of the public API on its own.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @internal
 */
export type ResultMethods<T, E> = {
  /**
   * Transform the success value with `f`.
   *
   * Runs `f` only on `Ok`; `Err` and `Defect` pass through untouched. If `f`
   * throws, the thrown value is captured as a `Defect`.
   *
   * @typeParam U - the mapped success type.
   * @param f - maps the current success value to a new one.
   */
  map<U>(f: (value: T) => U): Result<U, E>;
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
   * Runs only on `Ok`. If `f` throws, the throw becomes a `Defect`.
   *
   * @param f - the side effect (its return value is ignored).
   */
  tap(f: (value: T) => void): Result<T, E>;
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
   * through. A throw becomes a `Defect`.
   *
   * @typeParam K - the key the value is stored under.
   * @typeParam U - the value type.
   * @param name - the scope key.
   * @param f - computes a value from the accumulated scope.
   */
  let<K extends string, U>(name: K, f: (scope: T) => U): Result<Bound<T, K, U>, E>;
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
   * touched. If `f` throws, the throw becomes a `Defect`.
   *
   * @typeParam E2 - the mapped error type.
   * @param f - maps the current error to a new one.
   */
  mapErr<E2>(f: (error: E) => E2): Result<T, E2>;
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
   * through. If `f` throws, the throw becomes a `Defect`.
   *
   * @typeParam U - the recovered success type.
   * @param f - produces a success value from the current error.
   */
  recover<U>(f: (error: E) => U): Result<T | U, never>;
  /**
   * Run a side effect on the error and pass the `Result` through unchanged.
   *
   * Runs only on `Err`. If `f` throws, the throw becomes a `Defect`.
   *
   * @param f - the side effect (its return value is ignored).
   */
  tapErr(f: (error: E) => void): Result<T, E>;
  /**
   * Run a **failable** side effect on the error, keeping the original error but
   * threading the effect's own error.
   *
   * @remarks
   * The error-channel mirror of {@link ResultMethods.flatTap | flatTap}: `f`
   * returns a `Result`, but its **success value is discarded** — on the effect's
   * `Ok` the original `Err` flows through unchanged, while an `Err` (or `Defect`)
   * from `f` short-circuits and threads its error (`Result<T, E | E2>`). Runs only
   * on `Err`; `Ok` and `Defect` pass through. If `f` throws, the throw becomes a
   * `Defect`. Use it for a failable effect _during_ error handling (e.g. writing
   * the error to an audit log that may itself fail).
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
   * `Defect` through unchanged.
   *
   * @param f - the side effect over the unknown cause.
   */
  tapDefect(f: (cause: unknown) => void): Result<T, E>;

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
   * @param fallback - returned when the result is an `Err`.
   * @throws Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
   * it is never silently replaced.
   */
  unwrapOr(fallback: T): T;
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

/** The `Ok` variant of a {@link Result}: a success carrying a `value`. */
export type OkView<T, E = never> = ResultMethods<T, E> & {
  readonly tag: "Ok";
  readonly value: T;
};
/** The `Err` variant of a {@link Result}: a modeled failure carrying an `error`. */
export type ErrView<E, T = never> = ResultMethods<T, E> & {
  readonly tag: "Err";
  readonly error: E;
};
/** The `Defect` variant of a {@link Result}: an unmodeled failure carrying a `cause`. */
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
 */
export type Awaitable<T> = {
  then<R = T>(onfulfilled?: ((value: T) => R | PromiseLike<R>) | null): PromiseLike<R>;
};

/**
 * The asynchronous counterpart of {@link Result}: an awaitable wrapper with the
 * same method surface, collapsing to a `Result<T, E>` when `await`-ed.
 *
 * @remarks
 * **Combinator callbacks are synchronous.** A raw `Promise` may never enter an
 * `AsyncResult` method — that would be an un-qualified async boundary, and its
 * rejection would silently become a `Defect`, skipping the triage that
 * {@link fromPromise} forces. To do further async work, re-enter through a
 * qualified boundary and compose it: `ar.flatMap((v) => fromPromise(work(v),
 * qualify))`. The eliminators (`unwrap`, …) return promises; the binds
 * (`flatMap`, `flatTap`, `orElse`, `recoverDefect`) additionally accept an
 * `AsyncResult`.
 *
 * To pattern-match an `AsyncResult`, `await` it first: `match(await ar)`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 */
export type AsyncResult<T, E> = Awaitable<Result<T, E>> & {
  /** Asynchronous `map`. `f` is synchronous; a throw becomes a `Defect`. */
  map<U>(f: (value: T) => U): AsyncResult<U, E>;
  /**
   * Asynchronous `flatMap`. `f` may return a `Result` **or** an `AsyncResult`
   * (never a raw `Promise`); a throw becomes a `Defect`.
   */
  flatMap<U, E2>(f: (value: T) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<U, E | E2>;
  /** Asynchronous `tap`. `f` is synchronous; a throw becomes a `Defect`. */
  tap(f: (value: T) => void): AsyncResult<T, E>;
  /**
   * Asynchronous `flatTap` — a failable tap that keeps the original value. `f`
   * may return a `Result` **or** an `AsyncResult`; its `Ok` value is discarded,
   * an `Err`/`Defect` short-circuits, and a throw becomes a `Defect`.
   */
  flatTap<E2>(
    f: (value: T) => Result<unknown, E2> | AsyncResult<unknown, E2>,
  ): AsyncResult<T, E | E2>;
  /**
   * Asynchronous `bind` (do-notation). `f` may return a `Result` **or** an
   * `AsyncResult`; its value is bound under `name` in the accumulating scope.
   */
  bind<K extends string, U, E2>(
    name: K,
    f: (scope: T) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<Bound<T, K, U>, E | E2>;
  /** Asynchronous `let` (do-notation). `f` returns a plain value, bound under `name`. */
  let<K extends string, U>(name: K, f: (scope: T) => U): AsyncResult<Bound<T, K, U>, E>;
  /** Asynchronous `as`. */
  as<U>(value: U): AsyncResult<U, E>;

  /** Asynchronous `mapErr`. `f` is synchronous; a throw becomes a `Defect`. */
  mapErr<E2>(f: (error: E) => E2): AsyncResult<T, E2>;
  /** Asynchronous `orElse`. `f` may return a `Result` or an `AsyncResult`. */
  orElse<U, E2>(f: (error: E) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<T | U, E2>;
  /** Asynchronous `recover`. `f` is synchronous; a throw becomes a `Defect`. */
  recover<U>(f: (error: E) => U): AsyncResult<T | U, never>;
  /** Asynchronous `tapErr`. `f` is synchronous; a throw becomes a `Defect`. */
  tapErr(f: (error: E) => void): AsyncResult<T, E>;
  /**
   * Asynchronous `flatTapErr` — a failable tap on the error that keeps the
   * original error. `f` may return a `Result` **or** an `AsyncResult`; its `Ok`
   * value is discarded, an `Err`/`Defect` from `f` threads through, and a throw
   * becomes a `Defect`.
   */
  flatTapErr<E2>(
    f: (error: E) => Result<unknown, E2> | AsyncResult<unknown, E2>,
  ): AsyncResult<T, E | E2>;

  /** Asynchronous `recoverDefect`. `f` may return a `Result` or an `AsyncResult`. */
  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<T | U, E | E2>;
  /** Asynchronous `tapDefect`. */
  tapDefect(f: (cause: unknown) => void): AsyncResult<T, E>;

  /** Asynchronous `match`. Handlers are synchronous; resolves to `R`. */
  match<R>(cases: {
    ok: (value: T) => R;
    err: (error: E) => R;
    defect: (cause: unknown) => R;
  }): Promise<R>;
  /** Asynchronous `unwrap`. The returned promise rejects on `Err`/`Defect`. */
  unwrap(): Promise<T>;
  /** Asynchronous `unwrapErr`. */
  unwrapErr(): Promise<E>;
  /** Asynchronous `unwrapOr`. */
  unwrapOr(fallback: T): Promise<T>;
  /** Asynchronous `unwrapOrElse`. */
  unwrapOrElse(f: (error: E) => T): Promise<T>;
  /** Asynchronous `getOrNull`. */
  getOrNull(): Promise<T | null>;
  /** Asynchronous `getOrUndefined`. */
  getOrUndefined(): Promise<T | undefined>;
};

/**
 * Extract the success type `T` from a `Result`.
 *
 * @typeParam R - the `Result` type to inspect.
 */
export type OkOf<R> = R extends { readonly tag: "Ok"; readonly value: infer T } ? T : never;
/**
 * Extract the error type `E` from a `Result`.
 *
 * @typeParam R - the `Result` type to inspect.
 */
export type ErrOf<R> = R extends { readonly tag: "Err"; readonly error: infer E } ? E : never;
/**
 * Extract the success type `T` from an {@link AsyncResult}.
 *
 * @typeParam R - the `AsyncResult` type to inspect.
 */
export type AsyncOkOf<R> = R extends AsyncResult<infer T, unknown> ? T : never;
/**
 * Extract the error type `E` from an {@link AsyncResult}.
 *
 * @typeParam R - the `AsyncResult` type to inspect.
 */
export type AsyncErrOf<R> = R extends AsyncResult<unknown, infer E> ? E : never;
