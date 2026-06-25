// unthrown — explicit errors as values, with a separate defect channel for the
// unexpected.
//
// Three runtime states — Ok | Err | Defect — but the public type exposes only
// T and E. A Defect carries an unknown `cause` and is NEVER part of E. A defect
// stays a value until `unwrap`, the one place it finally throws (it "panics").
//
// Invariant to memorize: a Defect flows through every method untouched EXCEPT
// `match()` and `recoverDefect()`. Everything else (unwrapOr, getOrNull, ...)
// recovers your modeled Err, never an unmodeled defect.

// ----------------------------------------------------------------------------
// Defect plumbing
// ----------------------------------------------------------------------------

const DEFECT: unique symbol = Symbol("unthrown/defect");

/** A cause triaged as unexpected at a boundary. Returned from `qualify`. */
export type Defect = {
  readonly [DEFECT]: true;
  readonly cause: unknown;
};

/**
 * Wrap a cause as a defect — the value you return from a `qualify` function
 * when a failure is NOT a modeled domain error.
 */
export function defect(cause: unknown): Defect {
  return { [DEFECT]: true, cause };
}

// Internal guard for the qualify-time marker. Distinct from the public
// `isDefect(result)` state guard below — this one narrows the `E | Defect`
// union a `qualify` function returns, not a Result.
function isDefectMarker(x: unknown): x is Defect {
  return (
    typeof x === "object" && x !== null && (x as Record<PropertyKey, unknown>)[DEFECT] === true
  );
}

/** Thrown by `unwrap()` / `unwrapErr()` when the assertion is wrong on an Err. */
export class UnwrapError<E = unknown> extends Error {
  readonly error: E;
  constructor(error: E) {
    super("unthrown: called unwrap on a non-matching Result");
    this.name = "UnwrapError";
    this.error = error;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

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

export type AsyncResult<T, E> = PromiseLike<Result<T, E>> & {
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

// ----------------------------------------------------------------------------
// Internal representation
// ----------------------------------------------------------------------------

type State<T, E> =
  | { readonly tag: "ok"; readonly value: T }
  | { readonly tag: "err"; readonly error: E }
  | { readonly tag: "defect"; readonly cause: unknown };

class Res<T, E> implements Result<T, E> {
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

function defectRes<T, E>(cause: unknown): Result<T, E> {
  return new Res<T, E>({ tag: "defect", cause });
}

// ----------------------------------------------------------------------------
// Constructors
// ----------------------------------------------------------------------------

export function ok<T>(value: T): Result<T, never> {
  return new Res<T, never>({ tag: "ok", value });
}

export function err<E>(error: E): Result<never, E> {
  return new Res<never, E>({ tag: "err", error });
}

// ----------------------------------------------------------------------------
// Guards (standalone — narrow and expose the relevant field)
// ----------------------------------------------------------------------------

export function isOk<T, E>(r: Result<T, E>): r is OkView<T> {
  return r.isOk();
}
export function isErr<T, E>(r: Result<T, E>): r is ErrView<E> {
  return r.isErr();
}
export function isDefect<T, E>(r: Result<T, E>): r is DefectView {
  return r.isDefect();
}

// ----------------------------------------------------------------------------
// AsyncResult — same surface; callbacks may be async; thenable so `await`
// collapses it to a Result. Its internal promise NEVER rejects.
// ----------------------------------------------------------------------------

class AsyncRes<T, E> implements AsyncResult<T, E> {
  constructor(private readonly promise: Promise<Res<T, E>>) {}

  // oxlint-disable-next-line no-thenable -- AsyncResult is intentionally a thenable; this is the designed public contract
  then<R1 = Result<T, E>, R2 = never>(
    onfulfilled?: ((value: Result<T, E>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  map<U>(f: (value: T) => U | Promise<U>): AsyncResult<U, E> {
    return new AsyncRes<U, E>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "ok") return r as unknown as Res<U, E>;
        try {
          return new Res<U, E>({ tag: "ok", value: await f(r._state.value) });
        } catch (cause) {
          return new Res<U, E>({ tag: "defect", cause });
        }
      }),
    );
  }

  flatMap<U, E2>(
    f: (value: T) => Result<U, E2> | AsyncResult<U, E2> | Promise<Result<U, E2>>,
  ): AsyncResult<U, E | E2> {
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

  tap(f: (value: T) => void | Promise<void>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "ok") return r;
        try {
          await f(r._state.value);
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

  mapErr<E2>(f: (error: E) => E2 | Promise<E2>): AsyncResult<T, E2> {
    return new AsyncRes<T, E2>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "err") return r as unknown as Res<T, E2>;
        try {
          return new Res<T, E2>({ tag: "err", error: await f(r._state.error) });
        } catch (cause) {
          return new Res<T, E2>({ tag: "defect", cause });
        }
      }),
    );
  }

  orElse<U, E2>(
    f: (error: E) => Result<U, E2> | AsyncResult<U, E2> | Promise<Result<U, E2>>,
  ): AsyncResult<T | U, E2> {
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

  recover<U>(f: (error: E) => U | Promise<U>): AsyncResult<T | U, never> {
    return new AsyncRes<T | U, never>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "err") return r as unknown as Res<T | U, never>;
        try {
          return new Res<T | U, never>({
            tag: "ok",
            value: await f(r._state.error),
          });
        } catch (cause) {
          return new Res<T | U, never>({ tag: "defect", cause });
        }
      }),
    );
  }

  tapErr(f: (error: E) => void | Promise<void>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "err") return r;
        try {
          await f(r._state.error);
          return r;
        } catch (cause) {
          return new Res<T, E>({ tag: "defect", cause });
        }
      }),
    );
  }

  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2> | Promise<Result<U, E2>>,
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

  tapDefect(f: (cause: unknown) => void | Promise<void>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then(async (r) => {
        if (r._state.tag !== "defect") return r;
        try {
          await f(r._state.cause);
          return r;
        } catch (cause) {
          return new Res<T, E>({ tag: "defect", cause });
        }
      }),
    );
  }

  match<R>(cases: {
    ok: (value: T) => R | Promise<R>;
    err: (error: E) => R | Promise<R>;
    defect: (cause: unknown) => R | Promise<R>;
  }): Promise<R> {
    return this.promise.then((r) => r.match(cases)) as Promise<R>;
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
  unwrapOrElse(f: (error: E) => T | Promise<T>): Promise<T> {
    return this.promise.then(async (r) => {
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

// ----------------------------------------------------------------------------
// Boundary interop
// ----------------------------------------------------------------------------

/** Absence → modeled Err. The sanctioned alternative to shipping an Option. */
export function fromNullable<T, E>(
  value: T | null | undefined,
  onAbsent: () => E,
): Result<NonNullable<T>, E> {
  return value === null || value === undefined ? err(onAbsent()) : ok(value as NonNullable<T>);
}

/** Wrap a throwing sync fn; the caller MUST triage the cause into E or a defect. */
export function fromThrowable<A extends unknown[], T, E>(
  fn: (...args: A) => T,
  qualify: (cause: unknown) => E | Defect,
): (...args: A) => Result<T, E> {
  return (...args: A): Result<T, E> => {
    try {
      return ok(fn(...args)) as Result<T, E>;
    } catch (cause) {
      return qualifyToResult<T, E>(cause, qualify);
    }
  };
}

/** Wrap a Promise (or thunk); every rejection MUST be triaged into E or a defect. */
export function fromPromise<T, E>(
  promise: Promise<T> | (() => Promise<T>),
  qualify: (cause: unknown) => E | Defect,
): AsyncResult<T, E> {
  const p = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  const settled: Promise<Res<T, E>> = p.then(
    (value) => new Res<T, E>({ tag: "ok", value }),
    (cause) => qualifyToResult<T, E>(cause, qualify) as Res<T, E>,
  );
  return new AsyncRes<T, E>(settled);
}

/** Wrap a Promise asserted not to fail in a modeled way; any rejection is a defect. */
export function fromSafePromise<T>(
  promise: Promise<T> | (() => Promise<T>),
): AsyncResult<T, never> {
  const p = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  const settled: Promise<Res<T, never>> = p.then(
    (value) => new Res<T, never>({ tag: "ok", value }),
    (cause) => new Res<T, never>({ tag: "defect", cause }),
  );
  return new AsyncRes<T, never>(settled);
}

function qualifyToResult<T, E>(
  cause: unknown,
  qualify: (cause: unknown) => E | Defect,
): Result<T, E> {
  try {
    const q = qualify(cause);
    return isDefectMarker(q) ? defectRes<T, E>(q.cause) : (err(q) as Result<T, E>);
  } catch (qErr) {
    // a throw inside qualify is itself a defect
    return defectRes<T, E>(qErr);
  }
}

// ----------------------------------------------------------------------------
// Aggregation
// ----------------------------------------------------------------------------

export type OkOf<R> = R extends Result<infer T, unknown> ? T : never;
export type ErrOf<R> = R extends Result<unknown, infer E> ? E : never;

/** Collect a tuple of Results. First Err short-circuits; any Defect dominates. */
export function all<Rs extends readonly Result<unknown, unknown>[]>(
  results: readonly [...Rs],
): Result<{ [K in keyof Rs]: OkOf<Rs[K]> }, ErrOf<Rs[number]>> {
  const values: unknown[] = [];
  let firstErr: Result<unknown, unknown> | undefined;
  let firstDefect: Result<unknown, unknown> | undefined;

  for (const r of results) {
    const s = (r as Res<unknown, unknown>)._state;
    if (s.tag === "defect") firstDefect ??= r;
    else if (s.tag === "err") firstErr ??= r;
    else values.push(s.value);
  }

  if (firstDefect)
    return firstDefect as Result<{ [K in keyof Rs]: OkOf<Rs[K]> }, ErrOf<Rs[number]>>;
  if (firstErr) return firstErr as Result<{ [K in keyof Rs]: OkOf<Rs[K]> }, ErrOf<Rs[number]>>;
  return ok(values as { [K in keyof Rs]: OkOf<Rs[K]> });
}

// ----------------------------------------------------------------------------
// Result facade — a discoverable namespace alias for the standalone entry
// points. The free functions above remain the primary, tree-shakeable API;
// this object is a separate export, so `import { ok }` never pulls it in.
// (Value and type both named `Result` — the companion-object pattern.)
// ----------------------------------------------------------------------------

export const Result = {
  ok,
  err,
  defect,
  fromNullable,
  fromThrowable,
  fromPromise,
  fromSafePromise,
  all,
  isOk,
  isErr,
  isDefect,
} as const;
