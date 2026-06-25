// unthrown — public type surface. Pure types, no runtime.
//
// `Result<T, E>` exposes only T and E. The third runtime state — a Defect — is
// invisible here by design; it is carried by the internal representation in
// `core.ts`, never by this type. See `docs/design-memory.md` §2.1 and §2.8.

export type Result<T, E> = {
  // success channel — runs on Ok; passes Err/Defect through untouched
  map<U>(f: (value: T) => U): Result<U, E>;
  flatMap<U, E2>(f: (value: T) => Result<U, E2>): Result<U, E | E2>;
  tap(f: (value: T) => void): Result<T, E>;
  as<U>(value: U): Result<U, E>;

  // error channel — touches Err only, NEVER Defect
  mapErr<E2>(f: (error: E) => E2): Result<T, E2>;
  orElse<U, E2>(f: (error: E) => Result<U, E2>): Result<T | U, E2>;
  recover<U>(f: (error: E) => U): Result<T | U, never>;
  tapErr(f: (error: E) => void): Result<T, E>;

  // defect channel — the only door to a Defect
  recoverDefect<U, E2>(f: (cause: unknown) => Result<U, E2>): Result<T | U, E | E2>;
  tapDefect(f: (cause: unknown) => void): Result<T, E>;

  // eliminators
  match<R>(cases: { ok: (value: T) => R; err: (error: E) => R; defect: (cause: unknown) => R }): R;
  unwrap(): T;
  unwrapErr(): E;
  unwrapOr(fallback: T): T;
  unwrapOrElse(f: (error: E) => T): T;
  getOrNull(): T | null;
  getOrUndefined(): T | undefined;

  isOk(): boolean;
  isErr(): boolean;
  isDefect(): boolean;

  toAsync(): AsyncResult<T, E>;
};

/**
 * A success-only thenable: awaitable, but deliberately NOT a full `PromiseLike`.
 * An `AsyncResult`'s internal promise never rejects, so `await`-ing one always
 * yields a `Result` and never throws — there is no rejection channel to model,
 * and none is advertised. (At runtime it is still a thenable, which is the only
 * way `await` can collapse it to a `Result`.)
 */
export type Awaitable<T> = {
  then<R = T>(onfulfilled?: ((value: T) => R | PromiseLike<R>) | null): PromiseLike<R>;
};

export type AsyncResult<T, E> = Awaitable<Result<T, E>> & {
  map<U>(f: (value: T) => U | Promise<U>): AsyncResult<U, E>;
  flatMap<U, E2>(
    f: (value: T) => Result<U, E2> | AsyncResult<U, E2> | Promise<Result<U, E2>>,
  ): AsyncResult<U, E | E2>;
  tap(f: (value: T) => void | Promise<void>): AsyncResult<T, E>;
  as<U>(value: U): AsyncResult<U, E>;

  mapErr<E2>(f: (error: E) => E2 | Promise<E2>): AsyncResult<T, E2>;
  orElse<U, E2>(
    f: (error: E) => Result<U, E2> | AsyncResult<U, E2> | Promise<Result<U, E2>>,
  ): AsyncResult<T | U, E2>;
  recover<U>(f: (error: E) => U | Promise<U>): AsyncResult<T | U, never>;
  tapErr(f: (error: E) => void | Promise<void>): AsyncResult<T, E>;

  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2> | Promise<Result<U, E2>>,
  ): AsyncResult<T | U, E | E2>;
  tapDefect(f: (cause: unknown) => void | Promise<void>): AsyncResult<T, E>;

  match<R>(cases: {
    ok: (value: T) => R | Promise<R>;
    err: (error: E) => R | Promise<R>;
    defect: (cause: unknown) => R | Promise<R>;
  }): Promise<R>;
  unwrap(): Promise<T>;
  unwrapErr(): Promise<E>;
  unwrapOr(fallback: T): Promise<T>;
  unwrapOrElse(f: (error: E) => T | Promise<T>): Promise<T>;
  getOrNull(): Promise<T | null>;
  getOrUndefined(): Promise<T | undefined>;
};

// Narrowing views exposed by the standalone guards (handy in tests & call sites)
export type OkView<T> = Result<T, never> & { readonly value: T };
export type ErrView<E> = Result<never, E> & { readonly error: E };
export type DefectView = Result<never, never> & { readonly cause: unknown };

export type OkOf<R> = R extends Result<infer T, unknown> ? T : never;
export type ErrOf<R> = R extends Result<unknown, infer E> ? E : never;
