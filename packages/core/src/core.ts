// unthrown — the runtime engine.
//
// `Result` is the PUBLIC discriminated union (tag/value/error/cause + methods).
// `Res` is its sole internal implementation: one class over a `State` union,
// exposing the public discriminant via getters. `Res` is never exported from
// `index.ts`; the three cast-builders below (`okRes`/`errRes`/`defectRes`) are
// the only place a `Res` instance is bridged to the `Result` type. `AsyncRes`
// wraps a `Promise<Result>` constructed never to reject. See CLAUDE.md →
// "Internal design".

import type { AsyncResult, Result } from "./types.js";

/**
 * Thrown by a {@link Result}'s `unwrap` / `unwrapErr` when the assertion is
 * wrong on a *modeled* result — `unwrap()` on an `Err`, or `unwrapErr()` on an
 * `Ok`.
 *
 * @remarks
 * A `Defect` is never wrapped in an `UnwrapError`: its original cause is
 * re-thrown (with its original stack) instead.
 *
 * @typeParam E - the type of the {@link UnwrapError.error} it carries.
 */
export class UnwrapError<E = unknown> extends Error {
  /**
   * The offending value: the `Err` error for `unwrap()`, or the `Ok` value for
   * `unwrapErr()`.
   */
  readonly error: E;
  constructor(error: E) {
    super("unthrown: called unwrap on a non-matching Result");
    this.name = "UnwrapError";
    this.error = error;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type State<T, E> =
  | { readonly tag: "ok"; readonly value: T }
  | { readonly tag: "err"; readonly error: E }
  | { readonly tag: "defect"; readonly cause: unknown };

const PUBLIC_TAG = { ok: "Ok", err: "Err", defect: "Defect" } as const;

/**
 * The sole runtime implementation of {@link Result}. Never re-exported from
 * `index.ts`. Bridged to the `Result` type only via `okRes`/`errRes`/`defectRes`.
 *
 * @internal
 */
class Res<T, E> {
  readonly _state: State<T, E>;

  // The public discriminant. `value`/`error`/`cause` are only reachable on the
  // matching variant of the `Result` union, so reading the wrong one is a type
  // error, not a runtime surprise.
  get tag(): "Ok" | "Err" | "Defect" {
    return PUBLIC_TAG[this._state.tag];
  }
  get value(): T {
    return (this._state as { value: T }).value;
  }
  get error(): E {
    return (this._state as { error: E }).error;
  }
  get cause(): unknown {
    return (this._state as { cause: unknown }).cause;
  }

  constructor(state: State<T, E>) {
    this._state = state;
  }

  map<U>(f: (value: T) => U): Result<U, E> {
    if (this._state.tag !== "ok") return this as unknown as Result<U, E>;
    try {
      return okRes(f(this._state.value));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  flatMap<U, E2>(f: (value: T) => Result<U, E2>): Result<U, E | E2> {
    if (this._state.tag !== "ok") return this as unknown as Result<U, E | E2>;
    try {
      return f(this._state.value) as Result<U, E | E2>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tap(f: (value: T) => void): Result<T, E> {
    if (this._state.tag !== "ok") return this as unknown as Result<T, E>;
    try {
      f(this._state.value);
      return this as unknown as Result<T, E>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  as<U>(value: U): Result<U, E> {
    if (this._state.tag !== "ok") return this as unknown as Result<U, E>;
    return okRes(value);
  }

  mapErr<E2>(f: (error: E) => E2): Result<T, E2> {
    if (this._state.tag !== "err") return this as unknown as Result<T, E2>;
    try {
      return errRes(f(this._state.error));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  orElse<U, E2>(f: (error: E) => Result<U, E2>): Result<T | U, E2> {
    if (this._state.tag !== "err") return this as unknown as Result<T | U, E2>;
    try {
      return f(this._state.error) as Result<T | U, E2>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  recover<U>(f: (error: E) => U): Result<T | U, never> {
    if (this._state.tag !== "err") return this as unknown as Result<T | U, never>;
    try {
      return okRes(f(this._state.error));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapErr(f: (error: E) => void): Result<T, E> {
    if (this._state.tag !== "err") return this as unknown as Result<T, E>;
    try {
      f(this._state.error);
      return this as unknown as Result<T, E>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  recoverDefect<U, E2>(f: (cause: unknown) => Result<U, E2>): Result<T | U, E | E2> {
    if (this._state.tag !== "defect") return this as unknown as Result<T | U, E | E2>;
    try {
      return f(this._state.cause) as Result<T | U, E | E2>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapDefect(f: (cause: unknown) => void): Result<T, E> {
    if (this._state.tag !== "defect") return this as unknown as Result<T, E>;
    try {
      f(this._state.cause);
      return this as unknown as Result<T, E>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  match<R>(cases: { ok: (value: T) => R; err: (error: E) => R; defect: (cause: unknown) => R }): R {
    switch (this._state.tag) {
      case "ok":
        return cases.ok(this._state.value);
      case "err":
        return cases.err(this._state.error);
      case "defect":
        return cases.defect(this._state.cause);
    }
  }

  unwrap(): T {
    switch (this._state.tag) {
      case "ok":
        return this._state.value;
      case "err":
        throw new UnwrapError(this._state.error);
      case "defect":
        throw this._state.cause; // rethrow original cause, original stack
    }
  }

  unwrapErr(): E {
    switch (this._state.tag) {
      case "err":
        return this._state.error;
      case "ok":
        throw new UnwrapError(this._state.value);
      case "defect":
        throw this._state.cause;
    }
  }

  unwrapOr(fallback: T): T {
    if (this._state.tag === "ok") return this._state.value;
    if (this._state.tag === "defect") throw this._state.cause;
    return fallback;
  }

  unwrapOrElse(f: (error: E) => T): T {
    if (this._state.tag === "ok") return this._state.value;
    if (this._state.tag === "defect") throw this._state.cause;
    return f(this._state.error);
  }

  getOrNull(): T | null {
    if (this._state.tag === "ok") return this._state.value;
    if (this._state.tag === "defect") throw this._state.cause;
    return null;
  }

  getOrUndefined(): T | undefined {
    if (this._state.tag === "ok") return this._state.value;
    if (this._state.tag === "defect") throw this._state.cause;
    return undefined;
  }

  isOk(): boolean {
    return this._state.tag === "ok";
  }
  isErr(): boolean {
    return this._state.tag === "err";
  }
  isDefect(): boolean {
    return this._state.tag === "defect";
  }

  toAsync(): AsyncResult<T, E> {
    return new AsyncRes<T, E>(Promise.resolve(this as unknown as Result<T, E>));
  }
}

/**
 * Construct an `Ok` result.
 *
 * @internal
 */
export function okRes<T, E>(value: T): Result<T, E> {
  return new Res<T, E>({ tag: "ok", value }) as unknown as Result<T, E>;
}

/**
 * Construct an `Err` result.
 *
 * @internal
 */
export function errRes<T, E>(error: E): Result<T, E> {
  return new Res<T, E>({ tag: "err", error }) as unknown as Result<T, E>;
}

/**
 * Construct a `Defect` result.
 *
 * @internal
 */
export function defectRes<T, E>(cause: unknown): Result<T, E> {
  return new Res<T, E>({ tag: "defect", cause }) as unknown as Result<T, E>;
}

/**
 * The sole runtime implementation of {@link AsyncResult}: wraps a
 * `Promise<Result>` constructed never to reject. Operates on the public `Result`
 * union (via `tag`), never on `Res` internals. Never re-exported from `index.ts`.
 *
 * @internal
 */
export class AsyncRes<T, E> implements AsyncResult<T, E> {
  constructor(private readonly promise: Promise<Result<T, E>>) {}

  // oxlint-disable-next-line no-thenable -- AsyncResult is an intentional (success-only) thenable so `await` collapses it to a Result; see the Awaitable type. onrejected is still forwarded so a hypothetical internal rejection settles the await instead of hanging — though the internal promise never rejects.
  then<R1 = Result<T, E>, R2 = never>(
    onfulfilled?: ((value: Result<T, E>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  map<U>(f: (value: T) => U): AsyncResult<U, E> {
    return new AsyncRes<U, E>(
      this.promise.then((r) => {
        if (r.tag !== "Ok") return r as unknown as Result<U, E>;
        try {
          return okRes(f(r.value));
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  flatMap<U, E2>(f: (value: T) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<U, E | E2> {
    return new AsyncRes<U, E | E2>(
      this.promise.then(async (r) => {
        if (r.tag !== "Ok") return r as unknown as Result<U, E | E2>;
        try {
          return (await f(r.value)) as Result<U, E | E2>;
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tap(f: (value: T) => void): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r.tag !== "Ok") return r;
        try {
          f(r.value);
          return r;
        } catch (cause) {
          return defectRes<T, E>(cause);
        }
      }),
    );
  }

  as<U>(value: U): AsyncResult<U, E> {
    return new AsyncRes<U, E>(
      this.promise.then((r) =>
        r.tag === "Ok" ? okRes<U, E>(value) : (r as unknown as Result<U, E>),
      ),
    );
  }

  mapErr<E2>(f: (error: E) => E2): AsyncResult<T, E2> {
    return new AsyncRes<T, E2>(
      this.promise.then((r) => {
        if (r.tag !== "Err") return r as unknown as Result<T, E2>;
        try {
          return errRes(f(r.error));
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  orElse<U, E2>(f: (error: E) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<T | U, E2> {
    return new AsyncRes<T | U, E2>(
      this.promise.then(async (r) => {
        if (r.tag !== "Err") return r as unknown as Result<T | U, E2>;
        try {
          return (await f(r.error)) as Result<T | U, E2>;
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  recover<U>(f: (error: E) => U): AsyncResult<T | U, never> {
    return new AsyncRes<T | U, never>(
      this.promise.then((r) => {
        if (r.tag !== "Err") return r as unknown as Result<T | U, never>;
        try {
          return okRes<T | U, never>(f(r.error));
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tapErr(f: (error: E) => void): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r.tag !== "Err") return r;
        try {
          f(r.error);
          return r;
        } catch (cause) {
          return defectRes<T, E>(cause);
        }
      }),
    );
  }

  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<T | U, E | E2> {
    return new AsyncRes<T | U, E | E2>(
      this.promise.then(async (r) => {
        if (r.tag !== "Defect") return r as unknown as Result<T | U, E | E2>;
        try {
          return (await f(r.cause)) as Result<T | U, E | E2>;
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tapDefect(f: (cause: unknown) => void): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r.tag !== "Defect") return r;
        try {
          f(r.cause);
          return r;
        } catch (cause) {
          return defectRes<T, E>(cause);
        }
      }),
    );
  }

  match<R>(cases: {
    ok: (value: T) => R;
    err: (error: E) => R;
    defect: (cause: unknown) => R;
  }): Promise<R> {
    return this.promise.then((r) => r.match(cases));
  }

  unwrap(): Promise<T> {
    return this.promise.then((r) => r.unwrap());
  }
  unwrapErr(): Promise<E> {
    return this.promise.then((r) => r.unwrapErr());
  }
  unwrapOr(fallback: T): Promise<T> {
    return this.promise.then((r) => r.unwrapOr(fallback));
  }
  unwrapOrElse(f: (error: E) => T): Promise<T> {
    return this.promise.then((r) => {
      if (r.tag === "Ok") return r.value;
      if (r.tag === "Defect") throw r.cause;
      return f(r.error);
    });
  }
  getOrNull(): Promise<T | null> {
    return this.promise.then((r) => r.getOrNull());
  }
  getOrUndefined(): Promise<T | undefined> {
    return this.promise.then((r) => r.getOrUndefined());
  }
}
