// unthrown — public type surface. Pure types, no runtime.

/**
 * The core type of the library: a computation that has either succeeded with a
 * value of type `T` or failed with a *modeled* error of type `E`.
 *
 * @remarks
 * A `Result` has **three** runtime states but only **two** type parameters:
 *
 * - **Ok** — a success carrying a `T`.
 * - **Err** — a modeled, anticipated failure carrying an `E`.
 * - **Defect** — an *unmodeled* failure (a thrown bug, an un-triaged rejection).
 *   A defect is deliberately **invisible to the type**: it never appears in `E`.
 *
 * The success combinators (`map`, `flatMap`, …) run only on `Ok`; the error
 * combinators (`mapErr`, `recover`, …) run only on `Err`. A `Defect` flows
 * through every method untouched **except** `match` and `recoverDefect` — those
 * are the only two that can observe it.
 *
 * Any value thrown by a callback inside a combinator is captured as a `Defect`
 * rather than escaping, so a pipeline can be folded once at the edge with
 * `match` and no surrounding `try`/`catch`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type (only anticipated domain failures).
 *
 * @example
 * ```ts
 * import { ok, err, type Result } from "unthrown";
 *
 * function half(n: number): Result<number, "odd"> {
 *   return n % 2 === 0 ? ok(n / 2) : err("odd");
 * }
 *
 * const message = half(10).match({
 *   ok: (n) => `got ${n}`,
 *   err: (e) => `failed: ${e}`,
 *   defect: (cause) => `bug: ${String(cause)}`,
 * });
 * ```
 */
export type Result<T, E> = {
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
   * Recover from a `Defect` — the **only** combinator that can touch one.
   *
   * @remarks
   * Runs `f` only when a `Defect` is present, re-entering the modeled world by
   * returning a `Result` (an `Ok` or a fresh `Err`). `Ok` and `Err` pass
   * through. Recovering a defect should be rare: usually you let it bubble to
   * the edge. If `f` throws, the throw becomes a new `Defect`.
   *
   * @typeParam U - a success type the recovery may produce.
   * @typeParam E2 - an error type the recovery may produce.
   * @param f - maps the defect's unknown cause to a recovering `Result`.
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
   * Exactly one handler runs. Together with the throw-to-defect guarantee, this
   * is typically the single place a pipeline is handled at the edge — mapping
   * `ok`/`err`/`defect` to (for example) 2xx / 4xx / 5xx with no `try`/`catch`.
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
   * defect surfaces at the global handler as the real failure.
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
   * @throws Re-throws on a `Defect` — a defect is a bug, not an absent value, so
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

  /** Whether this result is `Ok`. */
  isOk(): boolean;
  /** Whether this result is `Err`. */
  isErr(): boolean;
  /** Whether this result is a `Defect`. */
  isDefect(): boolean;

  /** Lift this synchronous `Result` into an {@link AsyncResult}. */
  toAsync(): AsyncResult<T, E>;
};

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
 * (`flatMap`, `orElse`, `recoverDefect`) additionally accept an `AsyncResult`.
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
 * An `Ok`-narrowed {@link Result} that additionally exposes its `value`. Yielded
 * by the {@link isOk} guard.
 *
 * @typeParam T - the success value type.
 */
export type OkView<T> = Result<T, never> & { readonly value: T };
/**
 * An `Err`-narrowed {@link Result} that additionally exposes its `error`.
 * Yielded by the {@link isErr} guard.
 *
 * @typeParam E - the modeled error type.
 */
export type ErrView<E> = Result<never, E> & { readonly error: E };
/**
 * A `Defect`-narrowed {@link Result} that additionally exposes its unknown
 * `cause`. Yielded by the {@link isDefect} guard.
 */
export type DefectView = Result<never, never> & { readonly cause: unknown };

/**
 * Extract the success type `T` from a `Result<T, unknown>`.
 *
 * @typeParam R - the `Result` type to inspect.
 */
export type OkOf<R> = R extends Result<infer T, unknown> ? T : never;
/**
 * Extract the error type `E` from a `Result<unknown, E>`.
 *
 * @typeParam R - the `Result` type to inspect.
 */
export type ErrOf<R> = R extends Result<unknown, infer E> ? E : never;
