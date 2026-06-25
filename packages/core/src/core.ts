// unthrown — the runtime engine. Three states (Ok | Err | Defect) live in a
// single `Res` class over a `State` discriminated union; `AsyncRes` wraps a
// `Promise<Res>` constructed never to reject.
//
// `Res._state` is public-at-runtime so module-mates (AsyncRes, aggregation) can
// branch on it, but it is ABSENT from the `Result` type — so user code never
// sees it. This module must never be re-exported from `index.ts`; that is what
// keeps the representation (and the third state) hidden. See design-memory §2.8.

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

/**
 * The sole runtime implementation of {@link Result}. Never re-exported from
 * `index.ts`, which is what keeps `_state` (and the third runtime state) hidden
 * from the public type.
 *
 * @internal
 */
export class Res<T, E> implements Result<T, E> {
  // public-at-runtime, but absent from the Result<T,E> interface, so user code
  // never sees it; AsyncResult (same module) reads it for branching.
  readonly _state: State<T, E>;

  // exposed only on the narrowed views via the standalone guards
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
      return new Res<U, E>({ tag: "ok", value: f(this._state.value) });
    } catch (cause) {
      return defectRes<U, E>(cause);
    }
  }

  flatMap<U, E2>(f: (value: T) => Result<U, E2>): Result<U, E | E2> {
    if (this._state.tag !== "ok") return this as unknown as Result<U, E | E2>;
    try {
      return f(this._state.value) as Result<U, E | E2>;
    } catch (cause) {
      return defectRes<U, E | E2>(cause);
    }
  }

  tap(f: (value: T) => void): Result<T, E> {
    if (this._state.tag !== "ok") return this;
    try {
      f(this._state.value);
      return this;
    } catch (cause) {
      return defectRes<T, E>(cause);
    }
  }

  as<U>(value: U): Result<U, E> {
    if (this._state.tag !== "ok") return this as unknown as Result<U, E>;
    return new Res<U, E>({ tag: "ok", value });
  }

  mapErr<E2>(f: (error: E) => E2): Result<T, E2> {
    if (this._state.tag !== "err") return this as unknown as Result<T, E2>;
    try {
      return new Res<T, E2>({ tag: "err", error: f(this._state.error) });
    } catch (cause) {
      return defectRes<T, E2>(cause);
    }
  }

  orElse<U, E2>(f: (error: E) => Result<U, E2>): Result<T | U, E2> {
    if (this._state.tag !== "err") return this as unknown as Result<T | U, E2>;
    try {
      return f(this._state.error) as Result<T | U, E2>;
    } catch (cause) {
      return defectRes<T | U, E2>(cause);
    }
  }

  recover<U>(f: (error: E) => U): Result<T | U, never> {
    if (this._state.tag !== "err") return this as unknown as Result<T | U, never>;
    try {
      return new Res<T | U, never>({ tag: "ok", value: f(this._state.error) });
    } catch (cause) {
      return defectRes<T | U, never>(cause);
    }
  }

  tapErr(f: (error: E) => void): Result<T, E> {
    if (this._state.tag !== "err") return this;
    try {
      f(this._state.error);
      return this;
    } catch (cause) {
      return defectRes<T, E>(cause);
    }
  }

  recoverDefect<U, E2>(f: (cause: unknown) => Result<U, E2>): Result<T | U, E | E2> {
    if (this._state.tag !== "defect") return this as unknown as Result<T | U, E | E2>;
    try {
      return f(this._state.cause) as Result<T | U, E | E2>;
    } catch (cause) {
      return defectRes<T | U, E | E2>(cause);
    }
  }

  tapDefect(f: (cause: unknown) => void): Result<T, E> {
    if (this._state.tag !== "defect") return this;
    try {
      f(this._state.cause);
      return this;
    } catch (cause) {
      return defectRes<T, E>(cause);
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
    return new AsyncRes<T, E>(Promise.resolve(this));
  }
}

/**
 * Construct a `Result` already in the `defect` state.
 *
 * @internal
 */
export function defectRes<T, E>(cause: unknown): Result<T, E> {
  return new Res<T, E>({ tag: "defect", cause });
}

/**
 * The sole runtime implementation of {@link AsyncResult}: wraps a
 * `Promise<Res>` constructed never to reject. Never re-exported from `index.ts`.
 *
 * @internal
 */
export class AsyncRes<T, E> implements AsyncResult<T, E> {
  constructor(private readonly promise: Promise<Res<T, E>>) {}

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
        if (r._state.tag !== "ok") return r as unknown as Res<U, E>;
        try {
          return new Res<U, E>({ tag: "ok", value: f(r._state.value) });
        } catch (cause) {
          return new Res<U, E>({ tag: "defect", cause });
        }
      }),
    );
  }

  flatMap<U, E2>(f: (value: T) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<U, E | E2> {
    return new AsyncRes<U, E | E2>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "ok") return r as unknown as Res<U, E | E2>;
        try {
          return (await f(r._state.value)) as Res<U, E | E2>;
        } catch (cause) {
          return new Res<U, E | E2>({ tag: "defect", cause });
        }
      }),
    );
  }

  tap(f: (value: T) => void): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r._state.tag !== "ok") return r;
        try {
          f(r._state.value);
          return r;
        } catch (cause) {
          return new Res<T, E>({ tag: "defect", cause });
        }
      }),
    );
  }

  as<U>(value: U): AsyncResult<U, E> {
    return new AsyncRes<U, E>(
      this.promise.then((r) =>
        r._state.tag === "ok" ? new Res<U, E>({ tag: "ok", value }) : (r as unknown as Res<U, E>),
      ),
    );
  }

  mapErr<E2>(f: (error: E) => E2): AsyncResult<T, E2> {
    return new AsyncRes<T, E2>(
      this.promise.then((r) => {
        if (r._state.tag !== "err") return r as unknown as Res<T, E2>;
        try {
          return new Res<T, E2>({ tag: "err", error: f(r._state.error) });
        } catch (cause) {
          return new Res<T, E2>({ tag: "defect", cause });
        }
      }),
    );
  }

  orElse<U, E2>(f: (error: E) => Result<U, E2> | AsyncResult<U, E2>): AsyncResult<T | U, E2> {
    return new AsyncRes<T | U, E2>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "err") return r as unknown as Res<T | U, E2>;
        try {
          return (await f(r._state.error)) as Res<T | U, E2>;
        } catch (cause) {
          return new Res<T | U, E2>({ tag: "defect", cause });
        }
      }),
    );
  }

  recover<U>(f: (error: E) => U): AsyncResult<T | U, never> {
    return new AsyncRes<T | U, never>(
      this.promise.then((r) => {
        if (r._state.tag !== "err") return r as unknown as Res<T | U, never>;
        try {
          return new Res<T | U, never>({ tag: "ok", value: f(r._state.error) });
        } catch (cause) {
          return new Res<T | U, never>({ tag: "defect", cause });
        }
      }),
    );
  }

  tapErr(f: (error: E) => void): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r._state.tag !== "err") return r;
        try {
          f(r._state.error);
          return r;
        } catch (cause) {
          return new Res<T, E>({ tag: "defect", cause });
        }
      }),
    );
  }

  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<T | U, E | E2> {
    return new AsyncRes<T | U, E | E2>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "defect") return r as unknown as Res<T | U, E | E2>;
        try {
          return (await f(r._state.cause)) as Res<T | U, E | E2>;
        } catch (cause) {
          return new Res<T | U, E | E2>({ tag: "defect", cause });
        }
      }),
    );
  }

  tapDefect(f: (cause: unknown) => void): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r._state.tag !== "defect") return r;
        try {
          f(r._state.cause);
          return r;
        } catch (cause) {
          return new Res<T, E>({ tag: "defect", cause });
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
      const s = r._state;
      if (s.tag === "ok") return s.value;
      if (s.tag === "defect") throw s.cause;
      return f(s.error);
    });
  }
  getOrNull(): Promise<T | null> {
    return this.promise.then((r) => r.getOrNull());
  }
  getOrUndefined(): Promise<T | undefined> {
    return this.promise.then((r) => r.getOrUndefined());
  }
}
