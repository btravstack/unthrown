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

import {
  type Defect,
  defect,
  isDefectMarker,
  isMergedTriage,
  type MergedTriage,
} from "./defect.js";
import type {
  AsyncResult,
  Bound,
  DefectView,
  ErrOf,
  ErrTriage,
  ErrTriagePartial,
  ErrView,
  FailureView,
  NotThenable,
  OkOf,
  OkView,
  Result,
  TriageOut,
  TriageReturns,
} from "./types.js";

/**
 * Thrown by a {@link Result}'s `get` / `getErr` when the assertion is
 * wrong on a *modeled* result — `get()` on an `Err`, or `getErr()` on an
 * `Ok`.
 *
 * @remarks
 * The offending value is exposed two ways: the typed {@link UnwrapError.error}
 * property for programmatic access, and the standard `Error.cause` for the
 * runtime and devtools to chain — when `E` is an `Error` (e.g. a `TaggedError`)
 * its original stack is printed under "caused by".
 *
 * A `Defect` is never wrapped in an `UnwrapError`: its original cause is
 * re-thrown (with its original stack) instead.
 *
 * `get()` and `getErr()` are type-gated (`this: Result<T, never>` /
 * `Result<never, E>`), so the wrong-variant branch that throws this is
 * unreachable through well-typed code — it remains only as a defensive guard
 * against unsound runtime misuse (e.g. an `as` cast past the gate).
 *
 * @typeParam E - the type of the {@link UnwrapError.error} it carries.
 *
 * @category Errors
 */
export class UnwrapError<E = unknown> extends Error {
  /**
   * The offending value: the `Err` error for `get()`, or the `Ok` value for
   * `getErr()`.
   */
  readonly error: E;
  constructor(error: E) {
    super("unthrown: called unwrap on a non-matching Result", { cause: error });
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
      return f(this.value);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tap<R>(this: Result<T, E>, f: (value: T) => R & NotThenable<R>): Result<T, E> {
    if (this.tag !== "Ok") return this;
    try {
      f(this.value);
      return this;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  flatTap<E2>(this: Result<T, E>, f: (value: T) => Result<unknown, E2>): Result<T, E | E2> {
    if (this.tag !== "Ok") return this;
    try {
      const r = f(this.value);
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

  mapErr<H extends ErrTriage<E, unknown> | MergedTriage<E, unknown>>(
    this: Result<T, E>,
    handlers: H,
  ): Result<T, TriageOut<H>> {
    if (this.tag !== "Err") return passThrough(this);
    const handler = triageHandlerFor(handlers, this.error);
    if (!handler) return defectRes(this.error);
    try {
      const out = handler(this.error, defect);
      if (isDefectMarker(out)) return defectRes(out.cause);
      return errRes(out as TriageOut<H>);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  flatMapErr<
    H extends
      | ErrTriage<E, Result<unknown, unknown>>
      | MergedTriage<E, Result<unknown, unknown> | Defect>,
  >(this: Result<T, E>, handlers: H): Result<T | OkOf<TriageReturns<H>>, ErrOf<TriageReturns<H>>> {
    if (this.tag !== "Err") return passThrough(this);
    const handler = triageHandlerFor(handlers, this.error);
    if (!handler) return defectRes(this.error);
    try {
      const out = handler(this.error, defect);
      if (isDefectMarker(out)) return defectRes(out.cause);
      return out as Result<OkOf<TriageReturns<H>>, ErrOf<TriageReturns<H>>>;
    } catch (cause) {
      return defectRes(cause);
    }
  }

  recoverErr<H extends ErrTriage<E, unknown> | MergedTriage<E, unknown>>(
    this: Result<T, E>,
    handlers: H,
  ): Result<T | TriageOut<H>, never> {
    if (this.tag !== "Err") return passThrough(this);
    const handler = triageHandlerFor(handlers, this.error);
    if (!handler) return defectRes(this.error);
    try {
      const out = handler(this.error, defect);
      if (isDefectMarker(out)) return defectRes(out.cause);
      return okRes(out as TriageOut<H>);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapErr<H extends ErrTriagePartial<E, unknown> | MergedTriage<E, unknown>>(
    this: Result<T, E>,
    handlers: H,
  ): Result<T, E> {
    if (this.tag !== "Err") return this;
    const handler = triageHandlerFor(handlers, this.error);
    // Partial observation: a tag without a branch is simply not observed.
    if (!handler) return this;
    try {
      handler(this.error);
      return this;
    } catch (cause) {
      return observerThrowToDefect(cause, this.error);
    }
  }

  flatTapErr<
    H extends
      | ErrTriagePartial<E, Result<unknown, unknown>>
      | MergedTriage<E, Result<unknown, unknown>>,
  >(this: Result<T, E>, handlers: H): Result<T, E | ErrOf<TriageReturns<H>>> {
    if (this.tag !== "Err") return this;
    const handler = triageHandlerFor(handlers, this.error);
    // Partial observation: a tag without a branch is simply not observed.
    if (!handler) return this;
    try {
      const r = handler(this.error) as Result<unknown, unknown>;
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
      return f(this.cause);
    } catch (cause) {
      return defectRes(cause);
    }
  }

  tapDefect<R>(this: Result<T, E>, f: (cause: unknown) => R & NotThenable<R>): Result<T, E> {
    if (this.tag !== "Defect") return this;
    try {
      f(this.cause);
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
      f(this);
      return this;
    } catch (cause) {
      return observerThrowToDefect(cause, this.tag === "Err" ? this.error : this.cause);
    }
  }

  match<R>(
    this: Result<T, E>,
    cases: {
      ok: (value: T) => R;
      err: (error: E) => R;
      defect: (cause: unknown) => R;
    },
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

  get(this: Result<T, E>): T {
    switch (this.tag) {
      case "Ok":
        return this.value;
      case "Err":
        throw new UnwrapError(this.error);
      case "Defect":
        throw this.cause; // rethrow original cause, original stack
    }
  }

  /** @deprecated Use {@link Res.get}. */
  unwrap(this: Result<T, E>): T {
    // Runtime-identical alias; the cast only sidesteps `get`'s type-gate, which
    // is re-imposed on the public `unwrap` signature in `types.ts`.
    return (this as Result<T, never>).get();
  }

  getErr(this: Result<T, E>): E {
    switch (this.tag) {
      case "Err":
        return this.error;
      case "Ok":
        throw new UnwrapError(this.value);
      case "Defect":
        throw this.cause;
    }
  }

  /** @deprecated Use {@link Res.getErr}. */
  unwrapErr(this: Result<T, E>): E {
    // Runtime-identical alias; the cast only sidesteps `getErr`'s type-gate.
    return (this as Result<never, E>).getErr();
  }

  getOr<U>(this: Result<T, E>, fallback: U): T | U {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    return fallback;
  }

  /** @deprecated Use {@link Res.getOr}. */
  unwrapOr<U>(this: Result<T, E>, fallback: U): T | U {
    return this.getOr(fallback);
  }

  getOrElse<U>(this: Result<T, E>, f: (error: E) => U): T | U {
    if (this.tag === "Ok") return this.value;
    if (this.tag === "Defect") throw this.cause;
    return f(this.error);
  }

  /** @deprecated Use {@link Res.getOrElse}. */
  unwrapOrElse<U>(this: Result<T, E>, f: (error: E) => U): T | U {
    return this.getOrElse(f);
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

const RESULT_PROTO = Res.prototype;

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
 * untyped boundary. It checks the value carries the `Result` prototype, so a
 * look-alike plain object (`{ tag: "Ok" }`) is **not** matched. An `AsyncResult`
 * is not a `Result` and returns `false`.
 *
 * @returns `true` when `x` is a `Result` produced by this library.
 *
 * @example
 * ```ts
 * import { isResult, Ok } from "unthrown";
 *
 * isResult(Ok(1)); // => true
 * isResult({ tag: "Ok" }); // => false (look-alike, wrong prototype)
 * isResult(Ok(1).toAsync()); // => false (an AsyncResult is not a Result)
 *
 * const x: unknown = Ok(1);
 * if (isResult(x)) x.match({ ok: () => 1, err: () => 0, defect: () => -1 });
 * ```
 *
 * @category Guards
 */
export function isResult(x: unknown): x is Result<unknown, unknown> {
  return x instanceof Res;
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
 * Select the triage branch for an error: its `_tag`'s own-property handler if
 * present, otherwise the `Else` branch, otherwise `undefined` (the caller mints
 * a Defect — an unmodeled tag is an unmodeled failure, mirroring `matchTags`).
 * `Object.hasOwn` guards against a rogue tag (e.g. `"constructor"`) resolving
 * through the prototype chain to an unrelated `Object.prototype` member.
 *
 * @internal
 */
function triageHandlerFor(
  handlers: unknown,
  error: unknown,
): ((error: unknown, defect?: (cause: unknown) => Defect) => unknown) | undefined {
  if (isMergedTriage(handlers)) {
    // The explicit uniform form: one handler for every error, tagged or not.
    return handlers.handler as (error: unknown, defect?: (cause: unknown) => Defect) => unknown;
  }
  const triage = handlers as Record<string, unknown>;
  const tag =
    typeof error === "object" && error !== null && "_tag" in error
      ? (error as { _tag: unknown })._tag
      : undefined;
  const handler = typeof tag === "string" && Object.hasOwn(triage, tag) ? triage[tag] : undefined;
  return typeof handler === "function"
    ? (handler as (error: unknown, defect?: (cause: unknown) => Defect) => unknown)
    : undefined;
}

/**
 * A throw inside a *failure observer* (`tapErr` / `tapDefect` / `flatTapErr`)
 * must not destroy the failure being observed — that is the exact place (e.g. a
 * failing error-logger) where losing the underlying failure hurts most. The
 * resulting Defect aggregates both: `errors[0]` is the observer's throw,
 * `errors[1]` the original failure.
 *
 * @internal
 */
function observerThrowToDefect<T, E>(thrown: unknown, original: unknown): Result<T, E> {
  return defectRes(
    new AggregateError(
      [thrown, original],
      "unthrown: a failure-observer callback threw; errors[0] is the callback's throw, errors[1] the original failure",
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
  constructor(private readonly promise: Promise<Result<T, E>>) {}

  // oxlint-disable-next-line no-thenable -- AsyncResult is an intentional (success-only) thenable so `await` collapses it to a Result; see the Awaitable type. onrejected is still forwarded so a hypothetical internal rejection settles the await instead of hanging — though the internal promise never rejects.
  then<R1 = Result<T, E>, R2 = never>(
    onfulfilled?: ((value: Result<T, E>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  map<U>(f: (value: T) => U & NotThenable<U>): AsyncResult<U, E> {
    return new AsyncRes<U, E>(
      this.promise.then((r) => {
        if (r.tag !== "Ok") return passThrough(r);
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
        if (r.tag !== "Ok") return passThrough(r);
        try {
          return await f(r.value);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tap<R>(f: (value: T) => R & NotThenable<R>): AsyncResult<T, E> {
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

  flatTap<E2>(
    f: (value: T) => Result<unknown, E2> | AsyncResult<unknown, E2>,
  ): AsyncResult<T, E | E2> {
    return new AsyncRes<T, E | E2>(
      this.promise.then(async (r) => {
        if (r.tag !== "Ok") return passThrough(r);
        try {
          const inner = await f(r.value);
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
      this.promise.then(async (r) => {
        if (r.tag !== "Ok") return passThrough(r);
        try {
          const inner = await f(r.value);
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
    return new AsyncRes<Bound<T, K, U>, E>(
      this.promise.then((r) => {
        if (r.tag !== "Ok") return passThrough(r);
        try {
          return okRes({ ...scopeOf(r.value), [name]: f(r.value) }) as unknown as Result<
            Bound<T, K, U>,
            E
          >;
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  as<U>(value: U): AsyncResult<U, E> {
    return new AsyncRes<U, E>(
      this.promise.then((r) => (r.tag === "Ok" ? okRes<U, E>(value) : passThrough(r))),
    );
  }

  discard(): AsyncResult<void, E> {
    return new AsyncRes<void, E>(
      this.promise.then((r) => (r.tag === "Ok" ? okRes<void, E>(undefined) : passThrough(r))),
    );
  }

  // The precise generic-H triage signatures live on the public surface
  // (`AsyncResultMethods`); TypeScript cannot unify them across the
  // class/interface boundary (relating the two generic signatures infers `H`
  // from the guarded parameter and then fails to equate
  // `TriageReturns<H & guards>` with `TriageReturns<H>`), so these three
  // implementations are typed loosely — `never` error channels keep the
  // returns bivariantly compatible — and the interface re-imposes the
  // precision, mirroring how `unwrap`'s gate is re-imposed in `types.ts`.
  mapErr(handlers: ErrTriage<E, unknown> | MergedTriage<E, unknown>): AsyncResult<T, never> {
    return new AsyncRes<T, never>(
      this.promise.then((r) => {
        if (r.tag !== "Err") return passThrough(r);
        const handler = triageHandlerFor(handlers, r.error);
        if (!handler) return defectRes(r.error);
        try {
          const out = handler(r.error, defect);
          if (isDefectMarker(out)) return defectRes<T, never>(out.cause);
          return errRes<T, never>(out as never);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  flatMapErr(
    handlers:
      | ErrTriage<E, Result<unknown, unknown> | AsyncResult<unknown, unknown>>
      | MergedTriage<E, unknown>,
  ): AsyncResult<T, never> {
    return new AsyncRes<T, never>(
      this.promise.then(async (r) => {
        if (r.tag !== "Err") return passThrough(r);
        const handler = triageHandlerFor(handlers, r.error);
        if (!handler) return defectRes(r.error);
        try {
          const out = handler(r.error, defect);
          if (isDefectMarker(out)) return defectRes<T, never>(out.cause);
          return (await (out as
            | Result<unknown, unknown>
            | AsyncResult<unknown, unknown>)) as Result<T, never>;
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  recoverErr(handlers: ErrTriage<E, unknown> | MergedTriage<E, unknown>): AsyncResult<T, never> {
    return new AsyncRes<T, never>(
      this.promise.then((r) => {
        if (r.tag !== "Err") return passThrough(r);
        const handler = triageHandlerFor(handlers, r.error);
        if (!handler) return defectRes(r.error);
        try {
          const out = handler(r.error, defect);
          if (isDefectMarker(out)) return defectRes<T, never>(out.cause);
          return okRes<T, never>(out as T);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tapErr(handlers: ErrTriagePartial<E, unknown> | MergedTriage<E, unknown>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r.tag !== "Err") return r;
        const handler = triageHandlerFor(handlers, r.error);
        if (!handler) return r;
        try {
          handler(r.error);
          return r;
        } catch (cause) {
          return observerThrowToDefect<T, E>(cause, r.error);
        }
      }),
    );
  }

  flatTapErr(
    handlers:
      | ErrTriagePartial<E, Result<unknown, unknown> | AsyncResult<unknown, unknown>>
      | MergedTriage<E, unknown>,
  ): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then(async (r) => {
        if (r.tag !== "Err") return passThrough(r);
        const handler = triageHandlerFor(handlers, r.error);
        if (!handler) return r;
        try {
          const inner = await (handler(r.error) as
            | Result<unknown, unknown>
            | AsyncResult<unknown, unknown>);
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
      this.promise.then(async (r) => {
        if (r.tag !== "Defect") return r;
        try {
          return await f(r.cause);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }

  tapDefect<R>(f: (cause: unknown) => R & NotThenable<R>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r.tag !== "Defect") return r;
        try {
          f(r.cause);
          return r;
        } catch (cause) {
          return observerThrowToDefect<T, E>(cause, r.cause);
        }
      }),
    );
  }

  tapFailure<R>(f: (failure: FailureView<E, T>) => R & NotThenable<R>): AsyncResult<T, E> {
    return new AsyncRes<T, E>(
      this.promise.then((r) => {
        if (r.tag === "Ok") return r;
        try {
          f(r);
          return r;
        } catch (cause) {
          return observerThrowToDefect<T, E>(cause, r.tag === "Err" ? r.error : r.cause);
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

  get(): Promise<T> {
    return this.promise.then((r) => (r as Result<T, never>).get());
  }
  /** @deprecated Use {@link AsyncRes.get}. */
  unwrap(): Promise<T> {
    return this.get();
  }
  getErr(): Promise<E> {
    return this.promise.then((r) => (r as Result<never, E>).getErr());
  }
  /** @deprecated Use {@link AsyncRes.getErr}. */
  unwrapErr(): Promise<E> {
    return this.getErr();
  }
  getOr<U>(fallback: U): Promise<T | U> {
    return this.promise.then((r) => r.getOr(fallback));
  }
  /** @deprecated Use {@link AsyncRes.getOr}. */
  unwrapOr<U>(fallback: U): Promise<T | U> {
    return this.getOr(fallback);
  }
  getOrElse<U>(f: (error: E) => U): Promise<T | U> {
    return this.promise.then((r) => r.getOrElse(f));
  }
  /** @deprecated Use {@link AsyncRes.getOrElse}. */
  unwrapOrElse<U>(f: (error: E) => U): Promise<T | U> {
    return this.getOrElse(f);
  }
  getOrNull(): Promise<T | null> {
    return this.promise.then((r) => r.getOrNull());
  }
  getOrUndefined(): Promise<T | undefined> {
    return this.promise.then((r) => r.getOrUndefined());
  }
  getOrThrow(): Promise<T> {
    return this.promise.then((r) => r.getOrThrow());
  }
}
