// Boundary interop and aggregation. Every throwing/rejecting boundary is forced
// through `qualify`, which triages each cause into a modeled `E` or a `Defect`;
// there is no path that yields `unknown` in `E`.

import { Err, Ok } from "./constructors.js";
import {
  AsyncRes,
  defectRes,
  errRes,
  isResult,
  isThenable,
  okRes,
  silenceIfThenable,
} from "./core.js";
import { type Defect, defect, isDefectMarker } from "./defect.js";
import type {
  AsyncErrOf,
  AsyncOkOf,
  AsyncResult,
  ErrOf,
  NotThenable,
  OkOf,
  Result,
} from "./types.js";

/**
 * Bridge a nullable value into a {@link Result}: absence becomes a **modeled**
 * `Err`. The sanctioned alternative to an `Option` type.
 *
 * @remarks
 * `null` and `undefined` map to `Err(onAbsent())`; any other value (including
 * falsy ones like `0`, `""`, `false`) maps to `Ok`.
 *
 * @typeParam T - the (nullable) value type.
 * @typeParam E - the error produced when the value is absent.
 * @param value - the possibly-absent value.
 * @param onAbsent - lazily produces the error for the absent case.
 *
 * @category Interop
 *
 * @example
 * ```ts
 * import { fromNullable } from "unthrown";
 *
 * const map = new Map([["a", 1]]);
 * fromNullable(map.get("a"), () => "absent").getOr(0); // => 1
 * fromNullable(map.get("z"), () => "absent"); // => Err("absent")
 * fromNullable(0, () => "absent").getOr(-1); // => 0 (falsy but present)
 * ```
 */
export function fromNullable<T, E>(
  value: T | null | undefined,
  onAbsent: () => E,
): Result<NonNullable<T>, E> {
  return value === null || value === undefined ? Err(onAbsent()) : Ok(value as NonNullable<T>);
}

/**
 * Wrap a throwing synchronous function so it returns a {@link Result} instead of
 * throwing.
 *
 * @remarks
 * `qualify` **must** triage every thrown cause into a modeled error `E` or a
 * `Defect` (via the injected `defect` helper, its second argument) — there is no
 * path that leaves `unknown` in `E`. A throw inside `qualify` itself is treated
 * as a `Defect`. `qualify` is **synchronous**: an `async` qualify is rejected at
 * compile time ({@link NotThenable}) — its `Promise` would land in `E` un-triaged
 * — and a thenable slipped past the types at runtime becomes a `Defect` (never
 * an `Err(Promise)`), its orphaned rejection silenced.
 *
 * `fn` is **synchronous** too. An `async` `fn` rejects *after* this boundary has
 * already returned, so its rejection could never reach `qualify`: it becomes a
 * `Defect` (never `Ok(<Promise>)`) and the orphaned rejection is silenced rather
 * than left to float. Reach for {@link fromPromise} to wrap async work.
 *
 * The modeled error type is `Exclude<R, Defect>` — the `Defect` arm of
 * `qualify`'s return is **subtracted** from `E`, never inferred into it. So a
 * `qualify` that returns *only* `defect(cause)` yields `E = never` (a Defect is
 * out-of-band and must not pollute the error channel); reach for
 * {@link fromSafeThrowable} when every throw is a Defect.
 *
 * @typeParam A - the wrapped function's argument tuple.
 * @typeParam T - the wrapped function's return type.
 * @typeParam R - `qualify`'s return type; the modeled error `E` is
 * `Exclude<R, Defect>` (its `Defect` arm, if any, is subtracted).
 * @param fn - the throwing function to wrap.
 * @param qualify - triages a thrown `cause` into a modeled `E`, or marks it
 * unmodeled by returning `defect(cause)` (the helper passed as its second arg).
 * @returns a function with the same arguments returning `Result<T, E>`.
 *
 * @category Interop
 *
 * @example
 * ```ts
 * import { fromThrowable } from "unthrown";
 *
 * // Model the parse failure as an `Err`, everything unexpected as a `Defect`.
 * const parse = fromThrowable(
 *   (text: string) => JSON.parse(text) as unknown,
 *   (cause, defect) =>
 *     cause instanceof SyntaxError ? ("invalid_json" as const) : defect(cause),
 * );
 *
 * parse('{"ok":true}').getOr(null); // => { ok: true }
 * parse("nope"); // => Err("invalid_json")
 * ```
 */
export function fromThrowable<A extends unknown[], T, R>(
  fn: (...args: A) => T,
  qualify: (cause: unknown, defect: (cause: unknown) => Defect) => R & NotThenable<R>,
): (...args: A) => Result<T, Exclude<R, Defect>> {
  type E = Exclude<R, Defect>;
  const triage = qualify as (cause: unknown, defect: (cause: unknown) => Defect) => E | Defect;
  return (...args: A): Result<T, E> => {
    try {
      const value = fn(...args);
      return isThenable(value) ? thenableReturnDefect<T, E>(value) : (Ok(value) as Result<T, E>);
    } catch (cause) {
      return qualifyToResult<T, E>(cause, triage);
    }
  };
}

/**
 * Wrap a throwing synchronous function asserted **not** to fail in any modeled
 * way: any throw becomes a `Defect`.
 *
 * @remarks
 * The synchronous counterpart of {@link fromSafePromise}. Use it only when a
 * throw genuinely indicates a bug rather than an anticipated outcome — the
 * error channel is `never`, so there is nothing to triage; there is no
 * `qualify`. When some throws *are* anticipated, reach for
 * {@link fromThrowable} and triage them.
 *
 * `fn` is **synchronous**: an `async` `fn` becomes a `Defect` (never
 * `Ok(<Promise>)`), with its orphaned rejection silenced rather than left to
 * float. Reach for {@link fromSafePromise} to wrap async work.
 *
 * @typeParam A - the wrapped function's argument tuple.
 * @typeParam T - the wrapped function's return type.
 * @param fn - the throwing function to wrap.
 * @returns a function with the same arguments returning `Result<T, never>`.
 *
 * @category Interop
 *
 * @example
 * ```ts
 * import { fromSafeThrowable } from "unthrown";
 *
 * // A decode failure here is a bug (the row came from our own schema), so
 * // every throw is a defect — no throwaway `(cause, defect) => defect(cause)`.
 * const decode = fromSafeThrowable((row: Row) => userSchema.parse(row));
 *
 * decode(row); // => Result<User, never> — a throw becomes a Defect
 * ```
 */
export function fromSafeThrowable<A extends unknown[], T>(
  fn: (...args: A) => T,
): (...args: A) => Result<T, never> {
  return (...args: A): Result<T, never> => {
    try {
      const value = fn(...args);
      return isThenable(value) ? thenableReturnDefect<T, never>(value) : Ok(value);
    } catch (cause) {
      return defectRes<T, never>(cause);
    }
  };
}

/**
 * Wrap a `Promise` (or a thunk producing one) as an {@link AsyncResult}, forcing
 * every rejection to be triaged.
 *
 * @remarks
 * `qualify` **must** map each rejection cause into a modeled error `E` or a
 * `Defect` (via the injected `defect` helper, its second argument). The returned
 * `AsyncResult`'s internal promise never rejects; `await`-ing it always yields a
 * `Result`. A throw inside `qualify` is itself a `Defect`. `qualify` is
 * **synchronous**: an `async` qualify is rejected at compile time
 * ({@link NotThenable}), and a thenable slipped past the types at runtime
 * becomes a `Defect` (never an `Err(Promise)`), its orphaned rejection silenced.
 *
 * The modeled error type is `Exclude<R, Defect>` — the `Defect` arm of
 * `qualify`'s return is **subtracted** from `E`, never inferred into it. So a
 * `qualify` that returns *only* `defect(cause)` yields `E = never`; when every
 * rejection is a Defect, prefer {@link fromSafePromise}.
 *
 * @typeParam T - the resolved value type.
 * @typeParam R - `qualify`'s return type; the modeled error `E` is
 * `Exclude<R, Defect>` (its `Defect` arm, if any, is subtracted).
 * @param promise - the promise, or a thunk returning one.
 * @param qualify - triages a rejection `cause` into a modeled `E`, or marks it
 * unmodeled by returning `defect(cause)` (the helper passed as its second arg).
 * @param _guard - compile-time only; never pass it. The phantom rest-tuple that
 * enforces "qualify is synchronous": an `async` qualify makes this demand an
 * impossible extra argument (whose type spells out the error), while a
 * synchronous one leaves it empty. Encoded here — not on `qualify`'s return
 * type — so `T`'s inference from `promise` is undisturbed.
 *
 * @category Interop
 *
 * @example
 * ```ts
 * import { fromPromise } from "unthrown";
 *
 * // A rejection with a NotFoundError becomes a modeled `Err`; anything else a Defect.
 * const user = await fromPromise(fetchUser(id), (cause, defect) =>
 *   cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
 * );
 *
 * if (user.isOk()) user.value; // => the fetched user
 * // when fetchUser rejects with NotFoundError: user is Err("not_found")
 * ```
 */
export function fromPromise<T, R>(
  promise: Promise<T> | (() => Promise<T>),
  qualify: (cause: unknown, defect: (cause: unknown) => Defect) => R,
  // Phantom rest-tuple guard — the async-qualify ban, encoded OFF the callback's
  // return type: `R & NotThenable<R>` there made TS defer qualify's inference,
  // which collapsed `T` to `unknown` for an inline `.then(…)` chain argument.
  // With the conditional here instead, an async qualify demands an impossible
  // third argument (compile error carrying the message) while `T`/`R` infer
  // normally. Nothing is ever passed at runtime.
  //
  // `Extract` (not `[R] extends [PromiseLike<…>]`) so the ban also fires when
  // only SOME arms of a union return are thenable (`E | Promise<X>` — a
  // sometimes-async qualify is still an unqualified rejection path), and it
  // vacuously admits the always-throwing qualify (`R = never` extracts to
  // `never`) with no special case. The runtime thenable→Defect net in
  // `qualifyToResult` stays as the last resort for untyped callers.
  ..._guard: [Extract<R, PromiseLike<unknown>>] extends [never]
    ? []
    : ["unthrown: qualify must be synchronous — its Promise would land in E un-triaged"]
): AsyncResult<T, Exclude<R, Defect>> {
  type E = Exclude<R, Defect>;
  const triage = qualify as (cause: unknown, defect: (cause: unknown) => Defect) => E | Defect;
  // Promise.resolve() also absorbs a non-thenable passed from untyped code, so
  // this boundary never throws synchronously — it exists to prevent throws.
  const p =
    typeof promise === "function" ? Promise.resolve().then(promise) : Promise.resolve(promise);
  const settled: Promise<Result<T, E>> = p.then(
    (value) => okRes<T, E>(value),
    (cause) => qualifyToResult<T, E>(cause, triage),
  );
  return new AsyncRes<T, E>(settled);
}

/**
 * Wrap a `Promise` asserted **not** to fail in any modeled way: any rejection
 * becomes a `Defect`.
 *
 * @remarks
 * Use this only when a rejection genuinely indicates a bug rather than an
 * anticipated outcome — the error channel is `never`, so there is nothing to
 * triage. (`await`-ing still yields a `Result`; it never throws.) The
 * synchronous counterpart is {@link fromSafeThrowable}.
 *
 * @typeParam T - the resolved value type.
 * @param promise - the promise, or a thunk returning one.
 *
 * @category Interop
 *
 * @example
 * ```ts
 * import { fromSafePromise } from "unthrown";
 *
 * (await fromSafePromise(Promise.resolve(3))).get(); // => 3
 * // a rejection becomes a Defect (never a modeled Err):
 * await fromSafePromise(Promise.reject(new Error("boom"))); // => Defect(Error("boom"))
 * ```
 */
export function fromSafePromise<T>(
  promise: Promise<T> | (() => Promise<T>),
): AsyncResult<T, never> {
  // Promise.resolve() also absorbs a non-thenable passed from untyped code, so
  // this boundary never throws synchronously — it exists to prevent throws.
  const p =
    typeof promise === "function" ? Promise.resolve().then(promise) : Promise.resolve(promise);
  const settled: Promise<Result<T, never>> = p.then(
    (value) => okRes<T, never>(value),
    (cause) => defectRes<T, never>(cause),
  );
  return new AsyncRes<T, never>(settled);
}

/**
 * The settler a {@link fromExecutor} executor receives. Settles the pending
 * `AsyncResult` **once** — later calls are no-ops, exactly as `resolve` is on a
 * `Promise`.
 *
 * @typeParam T - the success type.
 * @typeParam E - the modeled error type.
 *
 * @category Types
 */
export type Settle<T, E> = (result: Result<T, E> | Defect) => void;

/**
 * Build an {@link AsyncResult} from a callback-style API — this library's
 * answer to `new Promise((resolve, reject) => …)`.
 *
 * @remarks
 * The settler takes a **`Result`**, not a value-or-reason pair: the caller names
 * the variant, so no `unknown` can enter `E` and there is no `qualify` to pass.
 * For a failure that is *not* modeled, settle the injected `defect` helper's
 * marker — the same injection `qualify` receives, and the only way to reach the
 * defect channel from inside an asynchronous callback (a `throw` there runs in
 * its own turn, long after the executor body returned).
 *
 * `T` and `E` cannot be inferred from the body, since `settle` is a parameter.
 * Supply them explicitly, or let them flow from an annotated target. Absent
 * either, both default to `never` (Thesis #3: no path may produce `unknown` in
 * `E`) — so an unannotated call is a compile error at the `settle(...)` call
 * site, not a silently-`unknown` channel.
 *
 * An executor that never settles yields an `AsyncResult` that never resolves —
 * the one hazard {@link fromPromise} does not have, and identical to
 * `new Promise`.
 *
 * @typeParam T - the success type.
 * @typeParam E - the modeled error type.
 * @param executor - runs immediately; receives the settler and the `defect` helper.
 *
 * @category Interop
 *
 * @example
 * ```ts
 * import { fromExecutor, Err, Ok } from "unthrown";
 *
 * const listen = (port: number) =>
 *   fromExecutor<Server, PortInUse>((settle, defect) => {
 *     server.once("error", (cause) =>
 *       isAddrInUse(cause) ? settle(Err(new PortInUse(port))) : settle(defect(cause)),
 *     );
 *     server.listen(port, () => settle(Ok(server)));
 *   });
 * ```
 */
export function fromExecutor<T = never, E = never>(
  executor: (settle: Settle<T, E>, defect: (cause: unknown) => Defect) => void,
): AsyncResult<T, E> {
  let resolve!: (result: Result<T, E>) => void;
  const promise = new Promise<Result<T, E>>((r) => {
    resolve = r;
  });

  const settle: Settle<T, E> = (result) => {
    if (isDefectMarker(result)) {
      resolve(defectRes<T, E>(result.cause));
      return;
    }
    if (!isResult(result)) {
      // A smuggled thenable (a raw-JS/cast caller passing a Promise instead of
      // a Result) would otherwise be dropped mid-flight; adopt-and-silence so
      // its later rejection can't float — the sibling of qualifyToResult's and
      // thenableReturnDefect's nets.
      //
      // Via `silenceIfThenable`, NOT a bare `isThenable`: `settle` is called
      // from the caller's own asynchronous code, outside the `try` around the
      // executor below, so a hostile `.then` getter throwing here would escape
      // into that turn AND leave `resolve` uncalled — an AsyncResult that never
      // settles, the one hazard this boundary is meant to bound. Silencing is
      // total, so the Defect below is always reached.
      silenceIfThenable(result);
      resolve(
        defectRes<T, E>(
          new TypeError("unthrown: fromExecutor's settle received a non-Result value"),
        ),
      );
      return;
    }
    resolve(result);
  };

  try {
    const returned: unknown = executor(settle, defect);
    if (isThenable(returned)) {
      void Promise.resolve(returned).then(undefined, (cause: unknown) => settle(defect(cause)));
    }
  } catch (cause) {
    settle(defect(cause));
  }

  return new AsyncRes<T, E>(promise);
}

function qualifyToResult<T, E>(
  cause: unknown,
  qualify: (cause: unknown, defect: (cause: unknown) => Defect) => E | Defect,
): Result<T, E> {
  try {
    const q = qualify(cause, defect);
    if (isDefectMarker(q)) return defectRes<T, E>(q.cause);
    if (isThenable(q)) {
      // An async `qualify` slipped past the compile-time NotThenable ban
      // (untyped/JS caller). Its Promise must never become the modeled error —
      // the boundary would be un-triaged — so surface a Defect instead. Also
      // adopt-and-silence the orphaned thenable: if the async qualify later
      // rejects, that rejection must not float as an unhandled rejection.
      void Promise.resolve(q).then(undefined, () => undefined);
      return defectRes<T, E>(
        new TypeError(
          "unthrown: qualify must be synchronous — it returned a thenable; triage the cause without awaiting",
        ),
      );
    }
    return errRes<T, E>(q);
  } catch (qErr) {
    // a throw inside qualify is itself a Defect
    return defectRes<T, E>(qErr);
  }
}

/**
 * The Defect minted when a **synchronous** boundary's `fn` returns a thenable —
 * i.e. an `async` function was handed to {@link fromThrowable} /
 * {@link fromSafeThrowable}.
 *
 * @remarks
 * This is the sibling of the thenable-`qualify` net in {@link qualifyToResult},
 * and it closes a strictly worse hole. A synchronous boundary only ever sees a
 * synchronous `throw`, so an async `fn`'s rejection never reaches `qualify` at
 * all: it would sit inside `Ok(<Promise>)`, un-triaged, and then float as an
 * unhandled rejection — which terminates the process on Node by default.
 *
 * Unlike the combinator callbacks, this cannot be banned at compile time
 * without collateral damage: `T & NotThenable<T>` on `fn`'s return makes a
 * **generic** function unassignable, so `fromSafeThrowable(structuredClone)`
 * stops compiling and `T` collapses to `unknown`. (The phantom rest-tuple guard
 * `fromPromise` uses fares worse.) So the ban is enforced here, at runtime,
 * where it costs nothing: a Defect, plus adopt-and-silence so the orphaned
 * rejection cannot float.
 *
 * @internal
 */
function thenableReturnDefect<T, E>(value: unknown): Result<T, E> {
  void Promise.resolve(value).then(undefined, () => undefined);
  return defectRes<T, E>(
    new TypeError(
      "unthrown: fromThrowable/fromSafeThrowable wrap a SYNCHRONOUS function, but `fn` returned a thenable — its rejection would escape qualification. Use fromPromise/fromSafePromise instead.",
    ),
  );
}

/**
 * The success channel of {@link all} / {@link allAsync}: a **positional tuple**
 * for a fixed-length input (including the empty tuple), or a homogeneous
 * **array** for a dynamic one.
 *
 * @remarks
 * The split keys off the input's `length`: a fixed tuple has a literal length
 * (`number extends Rs["length"]` is false → keep the positional `Ts`), while a
 * general array has `length: number` (→ collapse to `Ts[number][]`). Checking
 * length rather than `Rs extends [unknown, ...unknown[]]` keeps `all([])` typed
 * as `Result<[], …>` instead of `Result<never[], …>`.
 *
 * @typeParam Rs - the tuple/array of input `Result` types.
 * @typeParam Ts - per-element extracted success types (`OkOf` for `all`,
 * `AsyncOkOf` for `allAsync`).
 * @internal
 */
type AllOk<
  Rs extends readonly unknown[],
  Ts extends readonly unknown[],
> = number extends Rs["length"] ? Ts[number][] : Ts;

/** A `[key, error]` pair from a record aggregate, correlated per key. @internal */
type DictErrEntry<R> = { [K in keyof R]: readonly [K, ErrOf<R[K]>] }[keyof R];

/** The {@link AsyncResult} counterpart of {@link DictErrEntry}. @internal */
type AsyncDictErrEntry<R> = { [K in keyof R]: readonly [K, AsyncErrOf<R[K]>] }[keyof R];

/** A non-empty readonly list — `merge` runs only when an `Err` was collected. @internal */
type NonEmpty<T> = readonly [T, ...T[]];

/** A record of `Result`s — the input to {@link allFromDict}. */
type ResultRecord = Record<string, Result<unknown, unknown>>;
/** A record of `AsyncResult`s — the input to {@link allFromDictAsync}. */
type AsyncResultRecord = Record<string, AsyncResult<unknown, unknown>>;

/**
 * Fold an array of settled `Result`s: first `Err` wins, any `Defect` dominates,
 * else `Ok` of the values array.
 *
 * @internal
 */
/** The Defect minted for an out-of-contract non-`Result` element in an aggregate. */
function nonResultDefect(): Result<unknown, unknown> {
  return defectRes(new TypeError("unthrown: aggregate received a non-Result element"));
}

/**
 * Resolve every input concurrently (order preserved), adopting each one
 * defensively: a cast/untyped rejecting thenable becomes a `Defect` rather than
 * rejecting the internal promise, so the "an `AsyncResult`'s internal promise
 * never rejects" invariant holds even for out-of-contract input.
 *
 * @internal
 */
function settleAll(
  results: readonly AsyncResult<unknown, unknown>[],
): Promise<readonly Result<unknown, unknown>[]> {
  return Promise.all(
    results.map((r) =>
      Promise.resolve(r).then(
        (x) => x,
        (cause) => defectRes(cause),
      ),
    ),
  ) as Promise<readonly Result<unknown, unknown>[]>;
}

/** An accumulated `[index, error]` pair. @internal */
type IndexedErr = readonly [number, unknown];

function foldArray(
  results: readonly Result<unknown, unknown>[],
  merge?: (errors: NonEmpty<IndexedErr>) => unknown,
): Result<unknown, unknown> {
  let firstErr: Result<unknown, unknown> | undefined;
  let firstDefect: Result<unknown, unknown> | undefined;
  const values: unknown[] = [];
  const errors: IndexedErr[] = [];
  for (const [i, r] of results.entries()) {
    if (!isResult(r)) {
      // Out-of-contract element (a hole/undefined/non-Result, reachable only via
      // untyped or cast input). Surface it as a Defect — an unexpected failure —
      // rather than throwing on `.tag` (sync) or rejecting the internal promise
      // (async). A Defect dominates, so break.
      firstDefect ??= nonResultDefect();
      break;
    }
    if (r.tag === "Defect") {
      firstDefect ??= r;
      break; // any Defect dominates — nothing later can change the outcome
    } else if (r.tag === "Err") {
      // Fail-fast keeps the first Err; the validating fold accumulates every
      // one, paired with its index so the record fold can name it.
      if (merge) errors.push([i, r.error]);
      else firstErr ??= r;
    } else values.push(r.value);
  }
  // A Defect dominates even the accumulated errors: something in this batch is
  // broken in a way nobody modeled, so the modeled violations it beat were
  // computed alongside broken code and `merge` is never called.
  if (firstDefect) return firstDefect;
  if (merge && errors.length > 0) {
    // `merge` is user code, so the throw → defect rule applies: nothing escapes
    // an aggregate as a raw throw.
    try {
      return Err(merge(errors as unknown as NonEmpty<IndexedErr>));
    } catch (cause) {
      return defectRes(cause);
    }
  }
  return firstErr ?? Ok(values);
}

/**
 * Fold a record of settled `Result`s with the same rules, else `Ok` of the
 * record of values.
 *
 * @remarks
 * The positional fold already implements every rule (first `Err` wins, any
 * `Defect` dominates, a non-`Result` element becomes a `Defect`), so this pairs
 * the keys back onto its success value rather than restating them.
 *
 * `Object.fromEntries` is what makes a caller-supplied `"__proto__"` key safe:
 * it builds each key with CreateDataProperty, which defines an own property
 * instead of invoking the `__proto__` setter — the same guarantee the previous
 * explicit `Object.defineProperty` loop bought by hand.
 *
 * @internal
 */
function foldRecord(
  results: ResultRecord,
  merge?: (entries: NonEmpty<readonly [string, unknown]>) => unknown,
): Result<unknown, unknown> {
  const keys = Object.keys(results);
  return foldArray(
    Object.values(results),
    // The positional fold accumulates `[index, error]`; the record form names
    // each one by pairing the index back onto its key before `merge` sees it.
    merge && ((errors) => merge(nameErrors(errors, keys))),
  ).map((values) => Object.fromEntries(keys.map((key, i) => [key, (values as unknown[])[i]])));
}

/** Drop the accumulated indices — the positional forms merge errors alone. @internal */
function stripIndices<E>(errors: NonEmpty<IndexedErr>): NonEmpty<E> {
  return errors.map(([, e]) => e) as unknown as NonEmpty<E>;
}

/** Pair each accumulated index back onto its key. @internal */
function nameErrors<Entry>(errors: NonEmpty<IndexedErr>, keys: readonly string[]): NonEmpty<Entry> {
  return errors.map(([i, e]) => [keys[i] as string, e]) as unknown as NonEmpty<Entry>;
}

/**
 * Collect a tuple/array of {@link Result}s into a single `Result` of all their
 * success values.
 *
 * @remarks
 * Short-circuits on the **first** `Err` (later entries are not inspected for
 * their error); any `Defect` present **dominates**, winning even over an earlier
 * `Err`. A **fixed tuple** keeps its positional types — `all([Ok(1), Ok("a")])`
 * is `Result<[number, string], …>` — while a **dynamic array** `Result<T, E>[]`
 * collapses to `Result<T[], E>` with no cast. For a **record** keyed by name,
 * use {@link allFromDict}.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { all, Ok, Err } from "unthrown";
 *
 * all([Ok(1), Ok("a"), Ok(true)]).get(); // => [1, "a", true] (typed [number, string, boolean])
 * all([Ok(1), Err("e"), Ok(3)]); // => Err("e") (short-circuits on the first Err)
 * ```
 */
export function all<Rs extends readonly Result<unknown, unknown>[]>(
  results: readonly [...Rs],
): Result<AllOk<Rs, { [K in keyof Rs]: OkOf<Rs[K]> }>, ErrOf<Rs[number]>> {
  return foldArray(results) as unknown as Result<
    AllOk<Rs, { [K in keyof Rs]: OkOf<Rs[K]> }>,
    ErrOf<Rs[number]>
  >;
}

/**
 * Collect a **record** of {@link Result}s into a single `Result` of a record of
 * their success values — `allFromDict({ a: Result<A, E>, b: Result<B, E> })` is
 * `Result<{ a: A; b: B }, E>`. The named counterpart of {@link all}, for
 * parallel work you'd rather not tuple.
 *
 * @remarks
 * Same folding rules as {@link all}: first `Err` short-circuits, any `Defect`
 * dominates. This is **not** error accumulation.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { allFromDict, Ok, Err } from "unthrown";
 *
 * allFromDict({ id: Ok(1), name: Ok("ada") }).get(); // => { id: 1, name: "ada" }
 * allFromDict({ id: Ok(1), name: Err("missing") }); // => Err("missing")
 * ```
 */
export function allFromDict<R extends ResultRecord>(
  results: R,
): Result<{ [K in keyof R]: OkOf<R[K]> }, ErrOf<R[keyof R]>> {
  return foldRecord(results) as unknown as Result<
    { [K in keyof R]: OkOf<R[K]> },
    ErrOf<R[keyof R]>
  >;
}

/**
 * The asynchronous counterpart of {@link all}: combine a tuple/array of
 * {@link AsyncResult}s into one `AsyncResult` of all their success values.
 *
 * @remarks
 * The inputs are resolved **concurrently** (order preserved); the resolved
 * `Result`s are then folded with the same rules as {@link all} — first `Err`
 * short-circuits, any `Defect` dominates. As ever, the returned `AsyncResult`'s
 * internal promise never rejects. For a **record**, use {@link allFromDictAsync}.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { allAsync, fromSafePromise } from "unthrown";
 *
 * const both = allAsync([
 *   fromSafePromise(Promise.resolve(1)),
 *   fromSafePromise(Promise.resolve(2)),
 * ]);
 * (await both).get(); // => [1, 2]
 * ```
 */
export function allAsync<Rs extends readonly AsyncResult<unknown, unknown>[]>(
  results: readonly [...Rs],
): AsyncResult<AllOk<Rs, { [K in keyof Rs]: AsyncOkOf<Rs[K]> }>, AsyncErrOf<Rs[number]>> {
  // Each library AsyncResult is a never-rejecting thenable, so `settleAll`
  // adopts them concurrently; `foldArray` then applies the all() rules.
  const settled = settleAll(results).then((resolved) => foldArray(resolved));
  return new AsyncRes(settled) as unknown as AsyncResult<
    AllOk<Rs, { [K in keyof Rs]: AsyncOkOf<Rs[K]> }>,
    AsyncErrOf<Rs[number]>
  >;
}

/**
 * The asynchronous counterpart of {@link allFromDict}: combine a record of
 * {@link AsyncResult}s into one `AsyncResult` of a record of their values.
 *
 * @remarks
 * Resolved concurrently (order preserved), folded with the {@link all} rules,
 * and the internal promise never rejects.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { allFromDictAsync, fromSafePromise } from "unthrown";
 *
 * const both = allFromDictAsync({
 *   a: fromSafePromise(Promise.resolve(1)),
 *   b: fromSafePromise(Promise.resolve("x")),
 * });
 * (await both).get(); // => { a: 1, b: "x" }
 * ```
 */
export function allFromDictAsync<R extends AsyncResultRecord>(
  results: R,
): AsyncResult<{ [K in keyof R]: AsyncOkOf<R[K]> }, AsyncErrOf<R[keyof R]>> {
  const keys = Object.keys(results);
  // Re-pair the settled results with their keys and hand them to the sync record
  // fold, so the `all` rules and the `Object.fromEntries` prototype guarantee
  // come from one place.
  const settled = settleAll(Object.values(results)).then((resolved) =>
    foldRecord(Object.fromEntries(keys.map((key, i) => [key, resolved[i]])) as ResultRecord),
  );
  return new AsyncRes(settled) as unknown as AsyncResult<
    { [K in keyof R]: AsyncOkOf<R[K]> },
    AsyncErrOf<R[keyof R]>
  >;
}

/**
 * Collect a tuple/array of {@link Result}s, **accumulating every** `Err` and
 * merging them into a single modeled error — the accumulating counterpart of
 * {@link all}.
 *
 * @remarks
 * Same success channel as {@link all}: a **fixed tuple** keeps its positional
 * types, a **dynamic array** collapses to `Result<T[], E2>`. The difference is
 * the error channel — instead of the first `Err` winning, every `Err` is
 * collected in input order and handed to `merge`, whose return becomes the
 * modeled error.
 *
 * `merge` receives a **non-empty** list, so it is total: it is called only when
 * at least one `Err` was collected. It is **not** called when every element is
 * `Ok`, nor when a `Defect` is present.
 *
 * Any `Defect` still **dominates** — it wins over the accumulated errors, which
 * are discarded and never reach `merge`. A defect means something in this batch
 * failed in a way nobody modeled, so the violations computed alongside it are
 * not trustworthy. An out-of-contract non-`Result` element becomes a
 * `TypeError`-caused `Defect` the same way, and a throw inside `merge` becomes
 * a `Defect` too.
 *
 * `merge` must be **synchronous** — an `async` one is a compile error
 * ({@link NotThenable}), since a `Promise` in `E` is an unqualified rejection.
 *
 * For **schema-shaped** input (a request body, a form), reach for
 * `@unthrown/standard-schema`'s `fromSchema` instead — a validator already
 * hands you every issue as the modeled error. `validateAll` is for independent
 * checks you wrote yourself. For a **record** keyed by name, use
 * {@link validateAllFromDict}.
 *
 * @typeParam Rs - the tuple/array of input `Result` types.
 * @typeParam E2 - the merged error type.
 * @param results - the results to collect.
 * @param merge - folds the collected errors into one modeled error.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { validateAll, Ok, Err } from "unthrown";
 *
 * // every Err is collected, not just the first
 * validateAll([Ok(1), Err("stock"), Err("credit")], (errors) => errors.join(" and "));
 * // => Err("stock and credit")
 *
 * // all-Ok keeps the positional tuple; `merge` never runs
 * validateAll([Ok(1), Ok("a")], (errors) => errors.join());
 * // => Ok([1, "a"]) typed Result<[number, string], string>
 * ```
 */
export function validateAll<Rs extends readonly Result<unknown, unknown>[], E2>(
  results: readonly [...Rs],
  merge: (errors: NonEmpty<ErrOf<Rs[number]>>) => E2 & NotThenable<E2>,
): Result<AllOk<Rs, { [K in keyof Rs]: OkOf<Rs[K]> }>, E2> {
  return foldArray(results, (errors) => merge(stripIndices(errors))) as unknown as Result<
    AllOk<Rs, { [K in keyof Rs]: OkOf<Rs[K]> }>,
    E2
  >;
}

/**
 * Collect a **record** of {@link Result}s, accumulating every `Err` — the
 * accumulating counterpart of {@link allFromDict}, and the named counterpart of
 * {@link validateAll}.
 *
 * @remarks
 * `merge` receives a non-empty list of **`[key, error]` entries**, correlated
 * per key: `{ a: Result<A, E1>; b: Result<B, E2> }` yields
 * `["a", E1] | ["b", E2]`, so a `switch` on the key narrows the error and an
 * impossible pairing does not typecheck. That is what keeps two checks sharing
 * one error type distinguishable. Entries come in `Object.keys` order.
 *
 * Every other rule matches {@link validateAll}: any `Defect` dominates and
 * discards the accumulated errors, a throw in `merge` becomes a `Defect`, and
 * `merge` must be synchronous.
 *
 * @typeParam R - the record of input `Result` types.
 * @typeParam E2 - the merged error type.
 * @param results - the results to collect, keyed by name.
 * @param merge - folds the collected `[key, error]` entries into one error.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { validateAllFromDict, Ok, Err } from "unthrown";
 *
 * validateAllFromDict(
 *   { vatRate: Err("out of range"), currency: Ok("EUR"), dueDate: Err("past") },
 *   (entries) => entries.map(([key, error]) => `${key}: ${error}`).join("; "),
 * );
 * // => Err("vatRate: out of range; dueDate: past")
 * ```
 */
export function validateAllFromDict<R extends ResultRecord, E2>(
  results: R,
  merge: (entries: NonEmpty<DictErrEntry<R>>) => E2 & NotThenable<E2>,
): Result<{ [K in keyof R]: OkOf<R[K]> }, E2> {
  return foldRecord(results, (entries) =>
    merge(entries as NonEmpty<DictErrEntry<R>>),
  ) as unknown as Result<{ [K in keyof R]: OkOf<R[K]> }, E2>;
}

/**
 * The asynchronous counterpart of {@link validateAll}: collect a tuple/array of
 * {@link AsyncResult}s, accumulating every `Err` into one merged error.
 *
 * @remarks
 * Every {@link validateAll} rule holds, with the inputs resolved
 * **concurrently** (order preserved) — as with {@link allAsync}, no work is
 * short-circuited either way; the fail-fast/accumulating split is purely which
 * errors get reported. The internal promise never rejects: an out-of-contract
 * rejecting thenable becomes a dominating `Defect`. `merge` stays synchronous
 * here too — this is exactly where its rejection would land unqualified in `E`.
 * For a **record**, use {@link validateAllFromDictAsync}.
 *
 * @typeParam Rs - the tuple/array of input `AsyncResult` types.
 * @typeParam E2 - the merged error type.
 * @param results - the async results to collect.
 * @param merge - folds the collected errors into one modeled error.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { validateAllAsync, OkAsync, ErrAsync } from "unthrown";
 *
 * const checked = validateAllAsync(
 *   [OkAsync(1), ErrAsync("stock"), ErrAsync("credit")],
 *   (errors) => errors.join(" and "),
 * );
 * // (await checked) => Err("stock and credit")
 * ```
 */
export function validateAllAsync<Rs extends readonly AsyncResult<unknown, unknown>[], E2>(
  results: readonly [...Rs],
  merge: (errors: NonEmpty<AsyncErrOf<Rs[number]>>) => E2 & NotThenable<E2>,
): AsyncResult<AllOk<Rs, { [K in keyof Rs]: AsyncOkOf<Rs[K]> }>, E2> {
  const settled = settleAll(results).then((resolved) =>
    foldArray(resolved, (errors) => merge(stripIndices(errors))),
  );
  return new AsyncRes(settled) as unknown as AsyncResult<
    AllOk<Rs, { [K in keyof Rs]: AsyncOkOf<Rs[K]> }>,
    E2
  >;
}

/**
 * The asynchronous counterpart of {@link validateAllFromDict}: collect a record
 * of {@link AsyncResult}s, accumulating every `Err` into one merged error.
 *
 * @remarks
 * The {@link validateAllFromDict} rules, over inputs resolved concurrently as
 * in {@link validateAllAsync}.
 *
 * @typeParam R - the record of input `AsyncResult` types.
 * @typeParam E2 - the merged error type.
 * @param results - the async results to collect, keyed by name.
 * @param merge - folds the collected `[key, error]` entries into one error.
 *
 * @category Aggregate
 *
 * @example
 * ```ts
 * import { validateAllFromDictAsync, OkAsync, ErrAsync } from "unthrown";
 *
 * const checked = validateAllFromDictAsync(
 *   { stock: ErrAsync("none left"), credit: OkAsync(500) },
 *   (entries) => entries.map(([key, error]) => `${key}: ${error}`).join("; "),
 * );
 * // (await checked) => Err("stock: none left")
 * ```
 */
export function validateAllFromDictAsync<R extends AsyncResultRecord, E2>(
  results: R,
  merge: (entries: NonEmpty<AsyncDictErrEntry<R>>) => E2 & NotThenable<E2>,
): AsyncResult<{ [K in keyof R]: AsyncOkOf<R[K]> }, E2> {
  const keys = Object.keys(results);
  // Re-pair the settled results with their keys and hand them to the sync record
  // fold — the key naming, the `Object.fromEntries` prototype guarantee and the
  // throw → defect net all come from there rather than being restated.
  const settled = settleAll(Object.values(results)).then((resolved) =>
    foldRecord(
      Object.fromEntries(keys.map((key, i) => [key, resolved[i]])) as ResultRecord,
      (entries) => merge(entries as NonEmpty<AsyncDictErrEntry<R>>),
    ),
  );
  return new AsyncRes(settled) as unknown as AsyncResult<{ [K in keyof R]: AsyncOkOf<R[K]> }, E2>;
}
