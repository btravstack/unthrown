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
// The only casts left are the inherent type-changing pass-throughs (e.g. `map`
// reusing an `Err` as a differently-typed `Result`) — the same `as unknown as`
// boxed uses, sound because the passed-through variant carries no value of the
// changed type.

import type { AsyncResult, DefectView, ErrView, OkView, Result } from "./types.js";

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

/**
 * Method holder for {@link Result}. Never instantiated with `new` and never
 * exported; the builders below attach its prototype to plain objects. Every
 * method types `this` as the public `Result` union, so it narrows on `tag`.
 *
 * @internal
 */
class Res<T, E> {
  map<U>(this: Result<T, E>, f: (value: T) => U): Result<U, E> {
    if (this.tag !== "Ok") return this as unknown as Result<U, E>;
    try {
      return okRes(f(this.value));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  flatMap<U, E2>(this: Result<T, E>, f: (value: T) => Result<U, E2>): Result<U, E | E2> {
    if (this.tag !== "Ok") return this as unknown as Result<U, E | E2>;
    try {
      return f(this.value) as Result<U, E | E2>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tap(this: Result<T, E>, f: (value: T) => void): Result<T, E> {
    if (this.tag !== "Ok") return this;
    try {
      f(this.value);
      return this;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  as<U>(this: Result<T, E>, value: U): Result<U, E> {
    if (this.tag !== "Ok") return this as unknown as Result<U, E>;
    return okRes(value);
  }

  mapErr<E2>(this: Result<T, E>, f: (error: E) => E2): Result<T, E2> {
    if (this.tag !== "Err") return this as unknown as Result<T, E2>;
    try {
      return errRes(f(this.error));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  orElse<U, E2>(this: Result<T, E>, f: (error: E) => Result<U, E2>): Result<T | U, E2> {
    if (this.tag !== "Err") return this as unknown as Result<T | U, E2>;
    try {
      return f(this.error) as Result<T | U, E2>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  recover<U>(this: Result<T, E>, f: (error: E) => U): Result<T | U, never> {
    if (this.tag !== "Err") return this as unknown as Result<T | U, never>;
    try {
      return okRes(f(this.error));
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapErr(this: Result<T, E>, f: (error: E) => void): Result<T, E> {
    if (this.tag !== "Err") return this;
    try {
      f(this.error);
      return this;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  recoverDefect<U, E2>(
    this: Result<T, E>,
    f: (cause: unknown) => Result<U, E2>,
  ): Result<T | U, E | E2> {
    if (this.tag !== "Defect") return this as unknown as Result<T | U, E | E2>;
    try {
      return f(this.cause) as Result<T | U, E | E2>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapDefect(this: Result<T, E>, f: (cause: unknown) => void): Result<T, E> {
    if (this.tag !== "Defect") return this;
    try {
      f(this.cause);
      return this;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  match<R>(
    this: Result<T, E>,
    cases: { ok: (value: T) => R; err: (error: E) => R; defect: (cause: unknown) => R },
  ): R {
    switch (this.tag) {
      case "Ok":
        return cases.ok(this.value);
      case "Err":
        return cases.err(this.error);
      case "Defect":
        return cases.defect(this.cause);
    }
  }

  unwrap(this: Result<T, E>): T {
    switch (this.tag) {
      case "Ok":
        return this.value;
      case "Err":
        throw new UnwrapError(this.error);
      case "Defect":
        throw this.cause; // rethrow original cause, original stack
    }
  }

  unwrapErr(this: Result<T, E>): E {
    switch (this.tag) {
      case "Err":
        return this.error;
      case "Ok":
        throw new UnwrapError(this.value);
      case "Defect":
        throw this.cause;
    }
  }

  unwrapOr(this: Result<T, E>, fallback: T): T {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    return fallback;
  }

  unwrapOrElse(this: Result<T, E>, f: (error: E) => T): T {
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

  isOk(this: Result<T, E>): boolean {
    return this.tag === "Ok";
  }
  isErr(this: Result<T, E>): boolean {
    return this.tag === "Err";
  }
  isDefect(this: Result<T, E>): boolean {
    return this.tag === "Defect";
  }

  toAsync(this: Result<T, E>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(Promise.resolve(this));
  }
}

const RESULT_PROTO = Res.prototype;

/**
 * Construct an `Ok` result — a plain object on the {@link Res} prototype.
 *
 * @internal
 */
export function okRes<T, E>(value: T): Result<T, E> {
  return Object.assign(Object.create(RESULT_PROTO), { tag: "Ok" as const, value }) as OkView<T, E>;
}

/**
 * Construct an `Err` result.
 *
 * @internal
 */
export function errRes<T, E>(error: E): Result<T, E> {
  return Object.assign(Object.create(RESULT_PROTO), { tag: "Err" as const, error }) as ErrView<
    E,
    T
  >;
}

/**
 * Construct a `Defect` result.
 *
 * @internal
 */
export function defectRes<T, E>(cause: unknown): Result<T, E> {
  return Object.assign(Object.create(RESULT_PROTO), {
    tag: "Defect" as const,
    cause,
  }) as DefectView<T, E>;
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
