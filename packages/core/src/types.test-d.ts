// Type-level test suite. These assertions have no runtime; they are checked by
// `tsc` (the `typecheck` script runs this file through `tsconfig.test-d.json`,
// which relaxes the unused-locals rules so throwaway assertion bindings are
// allowed). A failing assertion is a compile error.
//
// `Expect<Equal<A, B>>` is a hard error when `A` and `B` differ; `@ts-expect-error`
// guards the cases that must NOT compile.

// `defect` is deliberately NOT re-exported from index.ts (Thesis #5 — it is
// injected at triage sites only). Imported directly from its internal module,
// for the returnType()-under-a-pin assertion below only; the public surface
// stays untouched.
import { defect } from "./defect.js";
import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  type AsyncErrOf,
  type AsyncOkOf,
  type AsyncResult,
  Do,
  type ErrOf,
  Err,
  ErrAsync,
  type ErrView,
  type FailureView,
  fromExecutor,
  fromPromise,
  fromSafeThrowable,
  fromThrowable,
  isDefect,
  isErr,
  isOk,
  isResult,
  match,
  P,
  Ok,
  OkAsync,
  type OkOf,
  type Result,
  TaggedError,
  type TaggedErrorInstance,
} from "./index.js";

// --- assertion helpers -------------------------------------------------------

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// --- constructors ------------------------------------------------------------

const okV = Ok(1);
type _ok = Expect<Equal<typeof okV, Result<number, never>>>;

const errV = Err<string>("e");
type _err = Expect<Equal<typeof errV, Result<never, string>>>;

// pre-lifted async constructors mirror Ok/Err but produce an AsyncResult
const okAsyncV = OkAsync(1);
type _okAsync = Expect<Equal<typeof okAsyncV, AsyncResult<number, never>>>;

const errAsyncV = ErrAsync<string>("e");
type _errAsync = Expect<Equal<typeof errAsyncV, AsyncResult<never, string>>>;

// no-arg overloads construct a `void` success (not `undefined`); the existing
// _ok/_okAsync assertions above pin that 1-arg inference is unchanged
const okVoidV = Ok();
type _okVoid = Expect<Equal<typeof okVoidV, Result<void, never>>>;
const okAsyncVoidV = OkAsync();
type _okAsyncVoid = Expect<Equal<typeof okAsyncVoidV, AsyncResult<void, never>>>;

// --- aggregation: `all` keeps positional tuple types -------------------------

const tuple = all([Ok(1), Ok("x"), Ok(true)]);
type _tuple = Expect<Equal<typeof tuple, Result<[number, string, boolean], never>>>;

// the empty tuple stays `[]`, not `never[]` (regression guard)
const empty = all([]);
type _empty = Expect<Equal<typeof empty, Result<[], never>>>;

// a dynamic array collapses to `T[]`
declare const arr: Result<number, "e">[];
const collapsed = all(arr);
type _collapsed = Expect<Equal<typeof collapsed, Result<number[], "e">>>;

// the error channel is the union of every element's error
declare const r1: Result<number, "e1">;
declare const r2: Result<string, "e2">;
const mixedErr = all([r1, r2]);
type _mixedErr = Expect<Equal<typeof mixedErr, Result<[number, string], "e1" | "e2">>>;

// `allFromDict` produces a record of values, keyed by name
const dict = allFromDict({ id: Ok(1), name: Ok("ada") });
type _dict = Expect<Equal<typeof dict, Result<{ id: number; name: string }, never>>>;

// async counterparts
const tupleAsync = allAsync([r1.toAsync(), r2.toAsync()]);
type _tupleAsync = Expect<Equal<typeof tupleAsync, AsyncResult<[number, string], "e1" | "e2">>>;

const dictAsync = allFromDictAsync({ id: Ok(1).toAsync(), name: Ok("ada").toAsync() });
type _dictAsync = Expect<Equal<typeof dictAsync, AsyncResult<{ id: number; name: string }, never>>>;

// --- boundaries: `Defect` is subtracted from the error channel ---------------

// a Defect-only qualify yields `E = never`
const defectOnly = fromPromise(Promise.resolve(1), (c, defect) => defect(c));
type _defectOnly = Expect<Equal<typeof defectOnly, AsyncResult<number, never>>>;

// a mixed qualify keeps only the modeled arm
const mixedQualify = fromPromise(Promise.resolve(1), (c, defect) =>
  c === 1 ? ("nf" as const) : defect(c),
);
type _mixedQualify = Expect<Equal<typeof mixedQualify, AsyncResult<number, "nf">>>;

// the same subtraction on `fromThrowable`
const throwable = fromThrowable(
  (s: string) => s.length,
  (c, defect) => defect(c),
);
type _throwable = Expect<Equal<ReturnType<typeof throwable>, Result<number, never>>>;

// `fromSafeThrowable` needs no qualify at all: E is never, arguments preserved
const safeThrowable = fromSafeThrowable((s: string, radix: number) => Number.parseInt(s, radix));
type _safeThrowable = Expect<
  Equal<typeof safeThrowable, (s: string, radix: number) => Result<number, never>>
>;

// qualify is mandatory — there is no one-arg boundary
// @ts-expect-error - the qualify argument is required
fromPromise(Promise.resolve(1));

// qualify is synchronous — an async qualify would put a Promise in E (an
// un-triaged boundary) and let its own rejection float. On `fromPromise` the
// ban is a phantom rest-tuple guard (an async qualify demands an impossible
// extra argument), NOT `NotThenable` on the return — that intersection made TS
// defer qualify's inference and collapse `T` to `unknown` for an inline
// `.then(…)` chain argument (see the guard below).
const asyncQualify = async (c: unknown) => c;
// @ts-expect-error - an async qualify is banned on fromPromise
fromPromise(Promise.resolve(1), asyncQualify);
// @ts-expect-error - an async qualify is banned on fromThrowable
fromThrowable(() => 1, asyncQualify);
// …and so is a SOMETIMES-thenable one (a union return with a thenable arm) —
// the guard extracts the thenable arms, so a conditional `Promise` can't slip
// an unqualified rejection path past the ban either
const sometimesAsyncQualify = (c: unknown) => (c ? Promise.resolve("late") : ("e" as const));
// @ts-expect-error - a union return with a thenable arm is banned on fromPromise
fromPromise(Promise.resolve(1), sometimesAsyncQualify);

// REGRESSION GUARD: an inline `.then` chain as the promise argument keeps its
// value type (it collapsed to `unknown` while the ban lived on qualify's
// return type as `R & NotThenable<R>`).
const inlineThen = fromPromise(
  Promise.resolve().then(() => ({ a: 1 })),
  () => "e" as const,
);
type _inlineThen = Expect<Equal<typeof inlineThen, AsyncResult<{ a: number }, "e">>>;
// an always-throwing qualify returns `never` — legal (the throw is a Defect)
const throwingQualify = fromPromise(Promise.resolve(1), (): never => {
  throw new Error("boom");
});
type _throwingQualify = Expect<Equal<typeof throwingQualify, AsyncResult<number, never>>>;

// REGRESSION GUARD: a concrete `Err` widens into a GENERIC error union — the
// variant views and `AsyncResult` are interfaces carrying verified
// `out T, out E` annotations precisely so this covariance survives an
// unresolved type parameter (as an intersection, their variance was measured
// structurally, where the matcher makes `E` invariant, and this failed).
function _widenErr<G>(): Result<number, G | "boom"> {
  return Err("boom" as const);
}
void _widenErr;
function _widenErrAsync<G>(): AsyncResult<number, G | "boom"> {
  return ErrAsync("boom" as const);
}
void _widenErrAsync;
function _widenOk<G>(): Result<number, G | "boom"> {
  return Ok(1);
}
void _widenOk;

// --- combinators -------------------------------------------------------------

// flatMap widens the error channel
const flatMapped = r1.flatMap(() => Err<"e2">("e2"));
type _flatMapped = Expect<Equal<typeof flatMapped, Result<never, "e1" | "e2">>>;

// A raw Promise may NEVER enter an AsyncResult combinator (Thesis #3): the
// callback must return a Result or an AsyncResult, so its rejection can't
// silently become a Defect. Pins that the param bound rejects a `Promise`.
declare const ar: AsyncResult<number, "e">;
// @ts-expect-error - a raw Promise callback return is not assignable
ar.flatMap((n) => Promise.resolve(Ok(n)));
// @ts-expect-error - a raw Promise callback return is not assignable
ar.flatTap(() => Promise.resolve(Ok(1)));
// bind: same ban, from a Do-scope AsyncResult so the call otherwise typechecks
declare const arDo: AsyncResult<{ a: number }, "e">;
// @ts-expect-error - a raw Promise callback return is not assignable
arDo.bind("x", () => Promise.resolve(Ok(1)));

// REGRESSION GUARD: chaining a callback that returns a value typed as the
// opaque `AsyncResult<U, E2>` alias (not a freshly-minted Ok/fromPromise) must
// preserve `U` and `E2` — not collapse them to `unknown`. Inferring through the
// full `AsyncResult` method surface junks them; inferring through the
// `Awaitable` then-channel keeps them precise (see the async binds in types.ts).
declare const aliasedAsync: () => AsyncResult<void, Error>;
// flatMap: the success type survives (was collapsing to `unknown`)
const chained = ar.flatMap(() => aliasedAsync());
type _chained = Expect<Equal<typeof chained, AsyncResult<void, "e" | Error>>>;
// flatTap: the threaded error survives (value kept as `number`)
const flatTappedAsyncAlias = ar.flatTap(() => aliasedAsync());
type _flatTappedAsyncAlias = Expect<
  Equal<typeof flatTappedAsyncAlias, AsyncResult<number, "e" | Error>>
>;
// bind: the callback's error survives on the accumulated error channel
declare const arScope: AsyncResult<{ a: number }, "e">;
const boundAsyncAlias = arScope.bind("v", () => aliasedAsync());
type _boundAsyncErr = Expect<Equal<AsyncErrOf<typeof boundAsyncAlias>, "e" | Error>>;
type _boundAsyncOk = Expect<
  Equal<AsyncOkOf<typeof boundAsyncAlias>, { a: number; readonly v: void }>
>;
// a sync `Result`-returning callback keeps its channels too (no `unknown` leak)
const chainedSync = ar.flatMap((n) => Ok(n * 2));
type _chainedSync = Expect<Equal<typeof chainedSync, AsyncResult<number, "e">>>;

// ErrView's parameter order is <E, T> (error first) — the reverse of OkView /
// DefectView / Result — because `Result<T, E>` narrows to `ErrView<E, T>`.
type _errViewErr = Expect<Equal<ErrView<"boom", number>["error"], "boom">>;
type _errViewNarrow = Expect<
  Equal<Extract<Result<number, "boom">, { readonly tag: "Err" }>, ErrView<"boom", number>>
>;

// flatTap KEEPS the value type and widens the error channel
const flatTapped = r1.flatTap(() => Err<"e2">("e2"));
type _flatTapped = Expect<Equal<typeof flatTapped, Result<number, "e1" | "e2">>>;

// flatTapErrCases KEEPS the value type and widens the error channel (error-side mirror);
// as an observer it takes the *partial* triage object
const flatTapErred = r1.flatTapErrCases((matcher) => matcher.with(P._, () => Err<"e2">("e2")));
type _flatTapErred = Expect<Equal<typeof flatTapErred, Result<number, "e1" | "e2">>>;

// recoverErrCases empties the error channel (to `never`)
const recovered = r1.recoverErrCases((matcher) => matcher.with(P._, () => 0));
type _recovered = Expect<Equal<typeof recovered, Result<number, never>>>;

// discard collapses the success type to `void` (not `undefined`) — and the async mirror
const discarded = r1.discard();
type _discarded = Expect<Equal<typeof discarded, Result<void, "e1">>>;

const discardedAsync = ar.discard();
type _discardedAsync = Expect<Equal<typeof discardedAsync, AsyncResult<void, "e">>>;

// map changes the value type; mapErrCases changes the error type
const mapped = r1.map((n) => `${n}`);
type _mapped = Expect<Equal<typeof mapped, Result<string, "e1">>>;
const errMapped = r1.mapErrCases((matcher) => matcher.with(P._, () => 0 as const));
type _errMapped = Expect<Equal<typeof errMapped, Result<number, 0>>>;

// --- do-notation: bind/let accumulate a named scope, errors union ------------

// the accumulated scope is readonly (it mustn't be mutated mid-chain)
const doChain = Do()
  .bind("a", () => Ok(1))
  .bind("b", ({ a }) => (a > 0 ? Ok("x") : Err<"e1">("e1")))
  .let("c", ({ a, b }) => a + b.length);
type _doChain = Expect<
  Equal<
    typeof doChain,
    Result<{ readonly a: number; readonly b: string; readonly c: number }, "e1">
  >
>;

// the bound scope is typed in each step's callback (compiles → keys are present)
const doScoped = Do()
  .bind("user", () => Ok({ name: "ada" }))
  .let("upper", ({ user }) => user.name.toUpperCase());
type _doScoped = Expect<
  Equal<typeof doScoped, Result<{ readonly user: { name: string }; readonly upper: string }, never>>
>;

// async do-notation accumulates the same way
const doAsync = Do()
  .toAsync()
  .bind("a", () => Ok(1))
  .let("b", ({ a }) => a + 1);
type _doAsync = Expect<
  Equal<typeof doAsync, AsyncResult<{ readonly a: number; readonly b: number }, never>>
>;

// re-binding a key OVERWRITES it (not an unsound `number & string` intersection)
const doRebind = Do()
  .bind("a", () => Ok(1))
  .bind("a", () => Ok("x"));
type _doRebind = Expect<Equal<typeof doRebind, Result<{ readonly a: string }, never>>>;

// --- guards narrow (methods AND standalone) ----------------------------------

declare const g: Result<number, string>;

if (g.isOk()) {
  type _gv = Expect<Equal<typeof g.value, number>>;
}
if (g.isErr()) {
  type _ge = Expect<Equal<typeof g.error, string>>;
}
if (g.isDefect()) {
  type _gc = Expect<Equal<typeof g.cause, unknown>>;
}
if (isOk(g)) {
  type _sv = Expect<Equal<typeof g.value, number>>;
}
if (isErr(g)) {
  type _se = Expect<Equal<typeof g.error, string>>;
}
if (isDefect(g)) {
  type _sc = Expect<Equal<typeof g.cause, unknown>>;
}

// isResult narrows `unknown` to a Result
declare const u: unknown;
if (isResult(u)) {
  type _isResult = Expect<Equal<typeof u, Result<unknown, unknown>>>;
}

// the payload is unreachable before narrowing
// @ts-expect-error - `.value` only exists on the Ok variant
const _noValue = g.value;
// @ts-expect-error - `.error` only exists on the Err variant
const _noError = g.error;

// --- get / getErr are gated on an empty opposite channel ---------------

declare const rNever: Result<number, never>;
declare const rFallible: Result<number, "e">;
declare const rErrOnly: Result<never, "e">;
rNever.get(); // ok: E = never
rErrOnly.getErr(); // ok: T = never
// @ts-expect-error - get requires E = never
rFallible.get();
// @ts-expect-error - getErr requires T = never
rFallible.getErr();

declare const arNever: AsyncResult<number, never>;
declare const arFallible: AsyncResult<number, "e">;
arNever.get();
// @ts-expect-error - async get requires E = never
arFallible.get();
// @ts-expect-error - async getErr requires T = never
arFallible.getErr();

// getOrThrow is gated as the COMPLEMENT of get: it compiles only when the error
// channel is NON-empty (E ≠ never) — there must be a modeled error to throw.
type _getOrThrow = Expect<Equal<ReturnType<typeof rFallible.getOrThrow>, number>>;
type _getOrThrowAsync = Expect<Equal<ReturnType<typeof arFallible.getOrThrow>, Promise<number>>>;
// @ts-expect-error - getOrThrow requires E ≠ never (nothing to throw; use get())
rNever.getOrThrow();
// @ts-expect-error - async getOrThrow requires E ≠ never
arNever.getOrThrow();

// --- extractor types ---------------------------------------------------------

type _okOf = Expect<Equal<OkOf<Result<number, "e">>, number>>;
type _errOf = Expect<Equal<ErrOf<Result<number, "e">>, "e">>;
type _asyncOkOf = Expect<Equal<AsyncOkOf<AsyncResult<number, "e">>, number>>;
type _asyncErrOf = Expect<Equal<AsyncErrOf<AsyncResult<number, "e">>, "e">>;

// --- tagged errors: match's `errCases` matcher is exhaustive ----------------------

class TagA extends TaggedError("TagA") {}
class TagB extends TaggedError("TagB") {}
declare const tagged: Result<number, TagA | TagB>;

// A matcher covering every tag compiles.
tagged.match({
  ok: () => 1,
  defect: () => 2,
  errCases: (matcher) => matcher.with(P.tag("TagA"), () => 3).with(P.tag("TagB"), () => 4),
});

tagged.match({
  ok: () => 1,
  defect: () => 2,
  // @ts-expect-error - the TagB branch is missing, so the builder is not exhaustive
  errCases: (matcher) => matcher.with(P.tag("TagA"), () => 3),
});

// The 4.x call shape — an `err` key taking the error value — no longer compiles:
// the matcher handler is now `errCases`, so a leftover `err` key is an excess
// property. This is the loud replacement for the former silent runtime break (a
// throwing `err` handler returned `never`, vacuously satisfying the matcher
// constraint, then threw the matcher object at runtime).
tagged.match({
  ok: (value) => value,
  errCases: (matcher) => matcher.with(P._, (e) => e),
  // @ts-expect-error - `err` is not a valid handler key (renamed to `errCases` in 5.0)
  err: (error: unknown) => {
    throw error;
  },
  defect: (cause) => {
    throw cause;
  },
});

// The folded type unions the ok/defect returns with the err branches' returns.
const folded = tagged.match({
  ok: () => "ok" as const,
  defect: () => "defect" as const,
  errCases: (matcher) =>
    matcher.with(P.tag("TagA"), () => "a" as const).with(P.tag("TagB"), () => "b" as const),
});
type _folded = Expect<Equal<typeof folded, "ok" | "defect" | "a" | "b">>;

// `ok` and `defect` have independent type params, so divergent object returns
// still union cleanly (a single shared `R` would fail to infer here).
const foldedObjects = tagged.match({
  ok: (n) => ({ ok: n }),
  defect: () => ({ bug: true }),
  errCases: (matcher) => matcher.with(P._, (e) => ({ err: e._tag })),
});
type _foldedObjects = Expect<
  Equal<typeof foldedObjects, { ok: number } | { bug: boolean } | { err: "TagA" | "TagB" }>
>;

// Generic-E catch-all (issue #145, fixed by the built-in matcher): the catch-all
// `.with` arm is a STATE TRANSITION to `Remaining = never` (an overload keyed on
// the statically-universal `P._` type), not a lazily-deferred `Exclude` — so a
// catch-all-terminated builder is provably exhaustive even when `E` is an
// unresolved type parameter, and a generic boundary helper can use `match`.
function _genericMatch<T, E>(result: Result<T, E>): void {
  result.match({
    ok: () => undefined,
    errCases: (matcher) => matcher.with(P._, () => undefined),
    defect: () => undefined,
  });
}
void _genericMatch;
// The issue #145 repro verbatim: a generic boundary helper (bounded E, catch-all
// terminated) folding an AsyncResult — must compile.
class _AppFailure extends Error {}
async function _resultToPromise<T, E extends _AppFailure = never>(
  ar: AsyncResult<T, E>,
): Promise<T> {
  const result = await ar;
  return result.match({
    ok: (value) => value,
    errCases: (matcher) =>
      matcher.with(P._, (error) => {
        throw error;
      }),
    defect: (cause) => {
      throw cause;
    },
  });
}
void _resultToPromise;
// A generic catch-all in a combinator position re-emits the error unchanged.
function _genericReemit<T, E>(r: Result<T, E>): Result<T, E> {
  return r.mapErrCases((matcher) => matcher.with(P._, (e) => e));
}
void _genericReemit;
// …but tag arms alone still cannot prove exhaustiveness over an unresolved E —
// only the statically-universal catch-all can.
function _genericMatchTags<T, E>(result: Result<T, E>): void {
  result.match({
    ok: () => undefined,
    // @ts-expect-error - tag arms are not provably exhaustive over an unresolved E
    errCases: (matcher) => matcher.with(P.tag("X"), () => undefined),
    defect: () => undefined,
  });
}
void _genericMatchTags;
// The guard-based form also works for any E — the pre-#145-fix boundary shape.
function _genericGuards<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw result.error;
  if (result.isDefect()) throw result.cause;
  return result.value;
}
type _genericGuardsT = Expect<Equal<ReturnType<typeof _genericGuards>, unknown>>;

// `_tag` is the literal; `options.name` is independent (still a literal `_tag`)
class Named extends TaggedError("@scope/Named", { name: "Named" }) {}
type _namedTag = Expect<Equal<(typeof Named)["prototype"]["_tag"], "@scope/Named">>;

// `name` is reserved (the display label) — rejected as a payload key at the call
// site, and never shadowed on the instance type.
class WithCode extends TaggedError("WithCode")<{ code: number }> {}
new WithCode({ code: 1 });
// @ts-expect-error - a `name` payload key is reserved, not constructable
new WithCode({ code: 1, name: "nope" });
// @ts-expect-error - a `message` payload key is reserved (owned by Error)
new WithCode({ code: 1, message: "nope" });
// @ts-expect-error - a `stack` payload key is reserved (Error's trace)
new WithCode({ code: 1, stack: "nope" });
// `cause` is deliberately NOT reserved — Error.cause is `unknown`, so a typed
// payload `cause` is a legitimate structured field.
class WithCause extends TaggedError("WithCause")<{ cause: unknown }> {}
new WithCause({ cause: "anything" });
// Even a forced `name` payload does not narrow `Error.name`: it stays `string`.
type _nameNotShadowed = Expect<
  Equal<TaggedErrorInstance<"X", { code: number; name: "lit" }>["name"], string>
>;
// Likewise a forced `message` payload does not narrow `Error.message`.
type _messageNotShadowed = Expect<
  Equal<TaggedErrorInstance<"X", { code: number; message: "lit" }>["message"], string>
>;
// And a forced `stack` payload does not shadow `Error.stack` either.
type _stackNotShadowed = Expect<
  Equal<TaggedErrorInstance<"X", { code: number; stack: 123 }>["stack"], string | undefined>
>;
// The message is defined per subclass the standard way — `override message`,
// which may interpolate the payload via `this`.
class WithMsg extends TaggedError("WithMsg")<{ ticketId: string }> {
  override message = `ticket ${this.ticketId} not found`;
}
new WithMsg({ ticketId: "t1" });

// ---------------------------------------------------------------------------
declare const sometimesFlag: boolean;
declare function sometimesWork(): Promise<number>;

// Thenable callbacks are rejected: an async callback's rejection would bypass
// qualification and float as an unhandled rejection (Thesis #3).
// ---------------------------------------------------------------------------
{
  const r = Ok(1) as Result<number, "e">;
  const ar = r.toAsync();

  // @ts-expect-error — async tap callback is banned (sync surface)
  r.tap(async () => {});
  // @ts-expect-error — async map callback is banned (sync surface)
  r.map(async (n) => n + 1);
  // A raw Promise / async branch would bypass qualification where the
  // combinator awaits it — flatMapErrCases / flatTapErrCases — so those reject it via
  // their builder-output constraint; tapErrCases rejects it too, because its branch
  // results are DISCARDED (a rejected Promise would float unobserved). Only
  // the non-awaiting transformers mapErrCases / recoverErrCases run the handler
  // synchronously with no await, so an async branch there is merely a visible
  // Promise-valued result, not a rejection bypass.
  // @ts-expect-error — an async flatMapErrCases branch is banned
  r.flatMapErrCases((matcher) => matcher.with(P._, async () => Ok(1)));
  // @ts-expect-error — an async flatTapErrCases branch is banned
  r.flatTapErrCases((matcher) => matcher.with(P._, async () => Ok(1)));
  // @ts-expect-error — an async tapErrCases branch is banned (discarded, would float)
  r.tapErrCases((matcher) => matcher.with(P._, async () => {}));
  // A SOMETIMES-async callback is banned too. `[R] extends [PromiseLike<…>]`
  // is false for a partial union, so `sometimesFlag ? 1 : sometimesWork()` used to compile on
  // every one of these — an unawaited effect whose rejection the pipeline never
  // sees. `NotThenable` is spelled with `Extract` for exactly this, the same
  // reasoning `fromPromise`'s async-qualify guard already used.
  // @ts-expect-error — sometimes-async map callback is banned
  r.map(() => (sometimesFlag ? 1 : sometimesWork()));
  // @ts-expect-error — sometimes-async tap callback is banned
  r.tap(() => (sometimesFlag ? 1 : sometimesWork()));
  // @ts-expect-error — sometimes-async let callback is banned
  r.let("k", () => (sometimesFlag ? 1 : sometimesWork()));
  // @ts-expect-error — sometimes-async tapDefect callback is banned
  r.tapDefect(() => (sometimesFlag ? 1 : sometimesWork()));
  // @ts-expect-error — sometimes-async tapFailure callback is banned
  r.tapFailure(() => (sometimesFlag ? 1 : sometimesWork()));

  // @ts-expect-error — async tapDefect callback is banned
  r.tapDefect(async () => {});
  // @ts-expect-error — async tapFailure callback is banned
  r.tapFailure(async () => {});
  // @ts-expect-error — async let callback is banned
  Ok({}).let("x", async () => 1);

  // @ts-expect-error — async tap callback is banned (async surface)
  ar.tap(async () => {});
  // @ts-expect-error — async map callback is banned (async surface)
  ar.map(async (n) => n + 1);
  // @ts-expect-error — an async flatMapErrCases branch is banned (async surface)
  ar.flatMapErrCases((matcher) => matcher.with(P._, async () => Ok(1)));
  // @ts-expect-error — an async flatTapErrCases branch is banned (async surface)
  ar.flatTapErrCases((matcher) => matcher.with(P._, async () => Ok(1)));
  // @ts-expect-error — an async tapErrCases branch is banned (async surface)
  ar.tapErrCases((matcher) => matcher.with(P._, async () => {}));
  // @ts-expect-error — async tapDefect callback is banned (async surface)
  ar.tapDefect(async () => {});
  // @ts-expect-error — async tapFailure callback is banned (async surface)
  ar.tapFailure(async () => {});
  const emptyAsync = Ok({}).toAsync();
  // @ts-expect-error — async let callback is banned (async surface)
  emptyAsync.let("x", async () => 1);

  // Synchronous callbacks still infer exactly as before.
  const mapped = r.map((n) => n + 1);
  type _MapKeeps = Expect<Equal<typeof mapped, Result<number, "e">>>;
  const recovered = r.recoverErrCases((matcher) => matcher.with(P._, (e) => e.length));
  type _RecoverKeeps = Expect<Equal<typeof recovered, Result<number, never>>>;

  // match handlers may still be async (edge elimination is not a combinator):
  // ok/defect directly, and the err matcher's branches too (no NotThenable here).
  void r.match({
    ok: async (n) => n,
    errCases: (matcher) => matcher.with(P._, async (e) => e.length),
    defect: async () => 0,
  });
}

// --- ensure: validate a success, or refine its type with a guard --------------

{
  const r = Ok(1) as Result<number, "e">;

  // boolean form: T is kept, E widens to E | E2
  const gated = r.ensure(
    (n) => n > 0,
    () => "neg" as const,
  );
  type _Gated = Expect<Equal<typeof gated, Result<number, "e" | "neg">>>;

  // type-guard form: the success type is refined to U
  const mixed = Ok("x") as Result<string | number, "e">;
  const refined = mixed.ensure(
    (v): v is string => typeof v === "string",
    () => "not_a_string" as const,
  );
  type _Refined = Expect<Equal<typeof refined, Result<string, "e" | "not_a_string">>>;

  // async surface mirrors both overloads
  const arE = r.toAsync();
  const gatedAsync = arE.ensure(
    (n) => n > 0,
    () => "neg" as const,
  );
  type _GatedAsync = Expect<Equal<typeof gatedAsync, AsyncResult<number, "e" | "neg">>>;
  const refinedAsync = mixed.toAsync().ensure(
    (v): v is string => typeof v === "string",
    () => "nas" as const,
  );
  type _RefinedAsync = Expect<Equal<typeof refinedAsync, AsyncResult<string, "e" | "nas">>>;

  // an async onFail would smuggle a Promise into E — banned (NotThenable).
  // The directive sits on the ARGUMENT, not on the call: TypeScript 7 reports
  // the overload failure at the offending argument node, where 6.x reported it
  // at the call expression.
  r.ensure(
    (n) => n > 0,
    // @ts-expect-error - an async onFail is banned (sync surface)
    async () => "neg",
  );
  arE.ensure(
    (n) => n > 0,
    // @ts-expect-error - an async onFail is banned (async surface)
    async () => "neg",
  );
  // an async predicate would be always-truthy — Promise<boolean> is not boolean
  const asyncPredicate = async (n: number) => n > 0;
  // @ts-expect-error - an async predicate is banned
  r.ensure(asyncPredicate, () => "neg" as const);
}

// --- tapFailure: the callback receives the discriminated failure variant ----
// (a payload union `E | unknown` would collapse to `unknown`; the variant keeps
// `E` reachable by narrowing on `tag`)

{
  const r = Ok(1) as Result<number, "e">;
  r.tapFailure((f) => {
    type _IsFailureView = Expect<Equal<typeof f, FailureView<"e", number>>>;
    if (f.tag === "Err") {
      type _ErrPayloadTyped = Expect<Equal<typeof f.error, "e">>;
    } else {
      type _DefectPayload = Expect<Equal<typeof f.cause, unknown>>;
    }
  });
  const kept = r.tapFailure(() => {});
  type _TapFailureKeeps = Expect<Equal<typeof kept, Result<number, "e">>>;

  const keptAsync = r.toAsync().tapFailure(() => {});
  type _TapFailureKeepsAsync = Expect<Equal<typeof keptAsync, AsyncResult<number, "e">>>;
}

// --- getOr widens: the fallback may be a different type ----

{
  const r = Ok(1) as Result<number, "e">;
  const widened = r.getOr(null);
  type _Widens = Expect<Equal<typeof widened, number | null>>;
}

// --- getOrElse widens: the fallback function may return a different type ----

{
  const r = Ok(1) as Result<number, "e">;
  const widened = r.getOrElse(() => null);
  type _Widens = Expect<Equal<typeof widened, number | null>>;
}

// --- error triage: mapErrCases/flatMapErrCases/recoverErrCases take a matcher and
// --- call `.exhaustive()` for you; the callback returns the un-terminated builder

{
  class NotFound extends TaggedError("NotFound")<{ id: string }> {}
  class Conflict extends TaggedError("Conflict")<{ key: string }> {}
  class Mapped extends TaggedError("Mapped") {}
  const r = Ok(1) as Result<number, NotFound | Conflict>;

  // exhaustive per-tag; the outgoing E is the union of the branch returns
  const triaged = r.mapErrCases((matcher) =>
    matcher
      .with(P.tag("NotFound"), (e) => `nf:${e.id}` as const)
      .with(P.tag("Conflict"), () => new Mapped()),
  );
  type _Triaged = Expect<Equal<ErrOf<typeof triaged>, `nf:${string}` | Mapped>>;

  // each branch receives the narrowed variant
  r.mapErrCases((matcher) =>
    matcher
      .with(P.tag("NotFound"), (e) => {
        type _Narrowed = Expect<Equal<typeof e, NotFound>>;
        return e;
      })
      .with(P.tag("Conflict"), (e) => e),
  );

  // a throwing branch types as `never` and drops out of the outgoing union
  const thrown = r.mapErrCases((matcher) =>
    matcher
      .with(P.tag("NotFound"), () => new Mapped())
      .with(P.tag("Conflict"), (e) => {
        throw e.key;
      }),
  );
  type _ThrowDrops = Expect<Equal<ErrOf<typeof thrown>, Mapped>>;

  // the sanctioned deliberate-defect form: the injected `defect` helper — its
  // Defect arm is subtracted from the outgoing union (Exclude<O, Defect>, the
  // same inference as a qualify boundary)
  const defected = r.mapErrCases((matcher, defect) =>
    matcher
      .with(P.tag("NotFound"), () => new Mapped())
      .with(P.tag("Conflict"), (e) => defect(e.key)),
  );
  type _DefectDrops = Expect<Equal<ErrOf<typeof defected>, Mapped>>;

  // the P._ escape hatch reaches every case; a defect-only match empties the channel
  const allDefected = r.mapErrCases((matcher, defect) => matcher.with(P._, (e) => defect(e)));
  type _AllDefected = Expect<Equal<typeof allDefected, Result<number, never>>>;

  // the P._ escape hatch receives the full union
  const merged = r.mapErrCases((matcher) =>
    matcher.with(P._, (e) => {
      type _MergedParam = Expect<Equal<typeof e, NotFound | Conflict>>;
      return e;
    }),
  );
  type _Merged = Expect<Equal<ErrOf<typeof merged>, NotFound | Conflict>>;

  // NOT exhaustive: a missing case makes `.exhaustive()` uncallable, so the
  // builder is not an ExhaustiveMatch and the call fails at the call site
  // @ts-expect-error — Conflict is unhandled
  r.mapErrCases((matcher) => matcher.with(P.tag("NotFound"), (e) => e));

  // flatMapErrCases: channels are the unions of the branch-returned Results' channels
  const flat = r.flatMapErrCases((matcher) =>
    matcher
      .with(P.tag("NotFound"), (e) => Ok(e.id))
      .with(P.tag("Conflict"), () => Err(new Mapped())),
  );
  type _FlatT = Expect<Equal<typeof flat, Result<number | string, Mapped>>>;

  // flatMapErrCases: a defect branch contributes to neither channel
  const flatDefected = r.flatMapErrCases((matcher, defect) =>
    matcher.with(P.tag("NotFound"), (e) => Ok(e.id)).with(P.tag("Conflict"), (e) => defect(e.key)),
  );
  type _FlatDefected = Expect<Equal<typeof flatDefected, Result<number | string, never>>>;

  // recoverErrCases: recovers per tag, unioning the recovered values; E empties
  const rec = r.recoverErrCases((matcher) =>
    matcher.with(P.tag("NotFound"), (e) => e.id).with(P.tag("Conflict"), () => 0 as const),
  );
  type _Rec = Expect<Equal<typeof rec, Result<number | string | 0, never>>>;

  // recoverErrCases: a defect branch does not widen the recovered success type
  const recDefected = r.recoverErrCases((matcher, defect) =>
    matcher.with(P.tag("NotFound"), (e) => e.id).with(P.tag("Conflict"), (e) => defect(e.key)),
  );
  type _RecDefected = Expect<Equal<typeof recDefected, Result<number | string, never>>>;

  // observers are exhaustive too (use P._ for a catch-all); the error passes
  // through unchanged
  const observed = r.tapErrCases((matcher) => matcher.with(P._, (e) => void e));
  type _Observed = Expect<Equal<typeof observed, Result<number, NotFound | Conflict>>>;
  const flatObserved = r.flatTapErrCases((matcher) =>
    matcher.with(P._, () => Err("audit-failed" as const)),
  );
  type _FlatObserved = Expect<
    Equal<typeof flatObserved, Result<number, NotFound | Conflict | "audit-failed">>
  >;

  // async surface mirrors the matcher; branches may return AsyncResults
  const ar2 = r.toAsync();
  const aflat = ar2.flatMapErrCases((matcher) =>
    matcher
      .with(P.tag("NotFound"), (e) => OkAsync(e.id))
      .with(P.tag("Conflict"), () => Err(new Mapped())),
  );
  type _AFlat = Expect<Equal<typeof aflat, AsyncResult<number | string, Mapped>>>;
}

// --- error matching works on ANY discriminant, and is always exhaustive -------
// The matcher matches by structure, so a non-`_tag` union (untagged, or the
// `code`-discriminated orpc shape) is handled the same way — and the builder is
// exhaustive-by-construction (a missing case makes `.exhaustive()` uncallable).

{
  // untagged E (a bare string): match by value, P._ is the catch-all
  const untagged = Ok(1) as Result<number, string>;
  const mapped = untagged.mapErrCases((matcher) => matcher.with(P._, (e) => e.length));
  type _Mapped = Expect<Equal<ErrOf<typeof mapped>, number>>;

  // a `code`-discriminated union (the orpc shape) — no `_tag`, matched on `code`
  type CodeErr = { code: "NOT_FOUND"; x: 1 } | { code: "FORBIDDEN"; y: 2 };
  const coded = Ok(1) as Result<number, CodeErr>;
  const byCode = coded.mapErrCases((matcher) =>
    matcher
      .with({ code: "NOT_FOUND" }, () => 404 as const)
      .with({ code: "FORBIDDEN" }, () => 403 as const),
  );
  type _ByCode = Expect<Equal<ErrOf<typeof byCode>, 404 | 403>>;

  // NOT exhaustive → the builder's `.exhaustive` is a NonExhaustiveError, not a
  // function, so it fails the ExhaustiveMatch constraint at the call site
  // @ts-expect-error — FORBIDDEN is unhandled
  coded.mapErrCases((matcher) => matcher.with({ code: "NOT_FOUND" }, () => 1));

  // an empty channel (`E = never`): `match(never)` is vacuously exhaustive, so
  // even a matcher with no branches type-checks
  const empty = Ok(1) as Result<number, never>;
  const still = empty.mapErrCases((matcher) => matcher);
  type _Still = Expect<Equal<typeof still, Result<number, never>>>;

  // observers are exhaustive too, but the error passes through unchanged
  const observed = coded.tapErrCases((matcher) => matcher.with(P._, () => undefined));
  type _Observed = Expect<Equal<typeof observed, Result<number, CodeErr>>>;
}

// --- matcher: returnType<R>() declares the output, and binds every branch ----
// Pinning is what lets code that must DECLARE its output type (a signature, a
// generic helper) stop the branches from deciding it by inference.

{
  class NotFound extends TaggedError("NotFound")<{ id: string }> {}
  class Conflict extends TaggedError("Conflict")<{ key: string }> {}
  const e = new NotFound({ id: "1" }) as NotFound | Conflict;

  // pinned: the fold type is the DECLARED one, not the union of branch returns
  const pinned = match(e)
    .returnType<string>()
    .with(P.tag("NotFound"), (n) => n.id)
    .with(P.tag("Conflict"), () => "conflict")
    .exhaustive();
  type _Pinned = Expect<Equal<typeof pinned, string>>;

  // REGRESSION GUARD: unpinned, branch returns still infer exactly as before
  // (the `BranchReturn` conditional must not defer inference and collapse O2 —
  // the `fromPromise`-qualify hazard, see CLAUDE.md's internal design)
  const inferred = match(e)
    .with(P.tag("NotFound"), () => 1 as const)
    .with(P.tag("Conflict"), () => "x" as const)
    .exhaustive();
  type _Inferred = Expect<Equal<typeof inferred, 1 | "x">>;

  // narrowing is preserved under a pin
  match(e)
    .returnType<string>()
    .with(P.tag("NotFound"), (n) => {
      type _Narrowed = Expect<Equal<typeof n, NotFound>>;
      return n.id;
    })
    .with(P.tag("Conflict"), () => "c")
    .exhaustive();

  // a branch that violates the pin fails ON THE BRANCH, not downstream
  match(e)
    .returnType<string>()
    // @ts-expect-error — 42 is not assignable to the declared `string`
    .with(P.tag("NotFound"), () => 42)
    .with(P.tag("Conflict"), () => "c")
    .exhaustive();

  // `.returnType` is callable only before any arm has produced an output, and
  // only once — not tied to position (see `afterNever` below); here an arm has
  // already produced an output, so pinning after it is rejected
  match(e)
    .with(P.tag("NotFound"), () => "a")
    .with(P.tag("Conflict"), () => "c")
    // @ts-expect-error — not callable: an arm has already run
    .returnType<string>();

  // re-pinning is rejected by the same gate
  match(e)
    .returnType<string>()
    .with(P.tag("NotFound"), () => "a")
    // @ts-expect-error — not callable: the builder is already pinned
    .returnType<number>();

  // re-pinning is rejected even with no arm in between
  match(e)
    .returnType<string>()
    // @ts-expect-error — not callable: the builder is already pinned
    .returnType<number>();

  // …but the gate is `[O] extends [never]` — "no arm has produced an output" —
  // not position: an arm whose handler returns `never` (it always throws)
  // contributes nothing, so a pin after it still compiles. Sound, since a
  // `never` branch can contradict no declared type.
  const afterNever = match(e)
    .with(P.tag("NotFound"), (): never => {
      throw new Error("always throws");
    })
    .returnType<string>()
    .with(P.tag("Conflict"), () => "c")
    .exhaustive();
  type _AfterNever = Expect<Equal<typeof afterNever, string>>;

  // a missing case under a pin still makes `.exhaustive` uncallable
  const partial = match(e)
    .returnType<string>()
    .with(P.tag("NotFound"), (n) => n.id);
  // @ts-expect-error — Conflict is unhandled
  partial.exhaustive();

  // a defect branch stays legal under a pin, and the marker does not reach the
  // output type — the same subtraction the unpinned path does with Exclude
  const pinnedDefect = match(e)
    .returnType<string>()
    .with(P.tag("NotFound"), (n) => n.id)
    .with(P.tag("Conflict"), (c) => defect(c))
    .exhaustive();
  type _PinnedDefect = Expect<Equal<typeof pinnedDefect, string>>;

  // grouped patterns under a pin: the variadic form and P.union
  const grouped = match(e)
    .returnType<string>()
    .with(P.tag("NotFound"), P.tag("Conflict"), (both) => {
      type _Both = Expect<Equal<typeof both, NotFound | Conflict>>;
      return both._tag;
    })
    .exhaustive();
  type _Grouped = Expect<Equal<typeof grouped, string>>;

  const unioned = match(e)
    .returnType<string>()
    .with(P.union(P.tag("NotFound"), P.tag("Conflict")), (both) => {
      type _UnionNarrowed = Expect<Equal<typeof both, NotFound | Conflict>>;
      return both._tag;
    })
    .exhaustive();
  type _Unioned = Expect<Equal<typeof unioned, string>>;
}

// --- returnType<R>() reaches every combinator that hands out a matcher -------
// The typing needed no change: the combinators read the builder's output
// through ExhaustiveMatch/MatchOut, which picks up the pin. The one runtime
// change the pin forced is in `flatTapErrCases`, which a pin newly lets a
// `defect(…)` branch reach — see the defect-branch cases below and
// `invariants.spec.ts`.

{
  class NotFound extends TaggedError("NotFound")<{ id: string }> {}
  class DriverError extends TaggedError("DriverError")<{ cause: unknown }> {}
  class ApiError extends TaggedError("ApiError")<{ status: number }> {}
  class AuditFailed extends TaggedError("AuditFailed") {}
  const r = Ok(1) as Result<number, NotFound | DriverError>;

  // mapErrCases: the outgoing E is the DECLARED type
  const pinned = r.mapErrCases((matcher) =>
    matcher
      .returnType<ApiError>()
      .with(P.tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(P.tag("DriverError"), () => new ApiError({ status: 500 })),
  );
  type _Pinned = Expect<Equal<typeof pinned, Result<number, ApiError>>>;

  // the injected `defect` helper stays legal under a pin, and never reaches
  // the outgoing modeled channel
  const withDefect = r.mapErrCases((matcher, defect) =>
    matcher
      .returnType<ApiError>()
      .with(P.tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(P.tag("DriverError"), (d) => defect(d.cause)),
  );
  type _WithDefect = Expect<Equal<typeof withDefect, Result<number, ApiError>>>;

  // flatMapErrCases: the declared Result's channels drive both outgoing channels
  const flat = r.flatMapErrCases((matcher) =>
    matcher
      .returnType<Result<string, ApiError>>()
      .with(P.tag("NotFound"), (n) => Ok(n.id))
      .with(P.tag("DriverError"), () => Err(new ApiError({ status: 500 }))),
  );
  type _Flat = Expect<Equal<typeof flat, Result<number | string, ApiError>>>;

  // recoverErrCases: the declared type is the recovered success type
  const rec = r.recoverErrCases((matcher) => matcher.returnType<number>().with(P._, () => 0));
  type _Rec = Expect<Equal<typeof rec, Result<number, never>>>;

  // THE REPORTED CALL SITE (issue #152): a typed HTTP layer folds its error
  // channel into a route's declared response union. Each arm is checked
  // against that union — which is the whole point: a mistyped body
  // discriminant, or a status the route does not declare, must be a compile
  // error rather than a silently widened result.
  type Response =
    | { status: 404; body: { code: "NOT_FOUND" } }
    | { status: 409; body: { code: "CONFLICT" } };

  const responded = r.recoverErrCases((matcher) =>
    matcher
      .returnType<Response>()
      .with(P.tag("NotFound"), () => ({
        status: 404 as const,
        body: { code: "NOT_FOUND" as const },
      }))
      .with(P.tag("DriverError"), () => ({
        status: 409 as const,
        body: { code: "CONFLICT" as const },
      })),
  );
  type _Responded = Expect<Equal<typeof responded, Result<number | Response, never>>>;

  // the check has teeth: a discriminant the union does not declare fails
  r.recoverErrCases((matcher) =>
    matcher
      .returnType<Response>()
      // @ts-expect-error — "GONE" is not a declared body code
      .with(P.tag("NotFound"), () => ({
        status: 404 as const,
        body: { code: "GONE" as const },
      }))
      .with(P.tag("DriverError"), () => ({
        status: 409 as const,
        body: { code: "CONFLICT" as const },
      })),
  );

  // observers: the error still passes through unchanged under a pin
  const observed = r.tapErrCases((matcher) =>
    matcher.returnType<void>().with(P._, () => undefined),
  );
  type _Observed = Expect<Equal<typeof observed, Result<number, NotFound | DriverError>>>;

  // a `defect(…)` branch is legal in tapErrCases pinned OR unpinned (the marker
  // is unthenable, so it satisfies the `NotThenable` builder-output constraint)
  // and, this being an OBSERVER, changes nothing in the type. At runtime it is
  // NOT discarded like an ordinary branch value: it takes the observer route,
  // aggregating with the observed error (invariants.spec.ts).
  const observedDefect = r.tapErrCases((matcher, defect) =>
    matcher.returnType<void>().with(P._, (e) => defect(e)),
  );
  type _ObservedDefect = Expect<
    Equal<typeof observedDefect, Result<number, NotFound | DriverError>>
  >;

  const observedDefectUnpinned = r.tapErrCases((matcher, defect) =>
    matcher.with(P._, (e) => defect(e)),
  );
  type _ObservedDefectUnpinned = Expect<
    Equal<typeof observedDefectUnpinned, Result<number, NotFound | DriverError>>
  >;

  // flatTapErrCases: the observer's own failure channel is the declared type,
  // unioned with the untouched incoming E (this combinator infers a plain E2 —
  // see CLAUDE.md on why it does not derive the channel through MatchOut)
  const flatObserved = r.flatTapErrCases((matcher) =>
    matcher.returnType<Result<never, AuditFailed>>().with(P._, () => Err(new AuditFailed())),
  );
  type _FlatObserved = Expect<
    Equal<typeof flatObserved, Result<number, NotFound | DriverError | AuditFailed>>
  >;

  // a `defect(…)` branch is accepted in flatTapErrCases under a pin (unpinned
  // the marker fails the `ExhaustiveMatch<Result<…>>` constraint) and, this
  // being an OBSERVER, changes nothing in the type: the error passes through and
  // the marker reaches no channel. At runtime it takes the observer route — the
  // observed error survives, aggregated with the caller's cause (invariants.spec.ts).
  const flatObservedDefect = r.flatTapErrCases((matcher, defect) =>
    matcher.returnType<Result<never, never>>().with(P._, (e) => defect(e)),
  );
  type _FlatObservedDefect = Expect<
    Equal<typeof flatObservedDefect, Result<number, NotFound | DriverError>>
  >;

  // …and UNPINNED the marker is rejected: the builder's output must satisfy
  // `ExhaustiveMatch<Result<…>>`, which admits no `defect(…)` marker — the
  // `returnType` pin above is the only way to write a defect branch here.
  // @ts-expect-error — an unpinned flatTapErrCases branch may not return the defect(…) marker
  r.flatTapErrCases((matcher, defect) => matcher.with(P._, (e) => defect(e)));

  // the async surface mirrors it
  const apinned = r.toAsync().mapErrCases((matcher) =>
    matcher
      .returnType<ApiError>()
      .with(P.tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(P.tag("DriverError"), () => new ApiError({ status: 500 })),
  );
  type _APinned = Expect<Equal<typeof apinned, AsyncResult<number, ApiError>>>;

  // async flatMapErrCases: mirrors the sync channel derivation
  const aflat = r.toAsync().flatMapErrCases((matcher) =>
    matcher
      .returnType<Result<string, ApiError>>()
      .with(P.tag("NotFound"), (n) => Ok(n.id))
      .with(P.tag("DriverError"), () => Err(new ApiError({ status: 500 }))),
  );
  type _AFlat = Expect<Equal<typeof aflat, AsyncResult<number | string, ApiError>>>;

  // async recoverErrCases: mirrors the sync recovered-success-type derivation
  const arec = r
    .toAsync()
    .recoverErrCases((matcher) => matcher.returnType<number>().with(P._, () => 0));
  type _ARec = Expect<Equal<typeof arec, AsyncResult<number, never>>>;

  // async tapErrCases: the error still passes through unchanged under a pin
  const aobserved = r
    .toAsync()
    .tapErrCases((matcher) => matcher.returnType<void>().with(P._, () => undefined));
  type _AObserved = Expect<Equal<typeof aobserved, AsyncResult<number, NotFound | DriverError>>>;

  // async flatTapErrCases: mirrors the sync plain-E2 channel derivation
  const aflatObserved = r
    .toAsync()
    .flatTapErrCases((matcher) =>
      matcher.returnType<Result<never, AuditFailed>>().with(P._, () => Err(new AuditFailed())),
    );
  type _AFlatObserved = Expect<
    Equal<typeof aflatObserved, AsyncResult<number, NotFound | DriverError | AuditFailed>>
  >;

  // async tapErrCases: the defect branch mirrors the sync surface
  const aobservedDefect = r
    .toAsync()
    .tapErrCases((matcher, defect) => matcher.with(P._, (e) => defect(e)));
  type _AObservedDefect = Expect<
    Equal<typeof aobservedDefect, AsyncResult<number, NotFound | DriverError>>
  >;

  // async flatTapErrCases: the defect branch mirrors the sync surface
  const aflatObservedDefect = r
    .toAsync()
    .flatTapErrCases((matcher, defect) =>
      matcher.returnType<Result<never, never>>().with(P._, (e) => defect(e)),
    );
  type _AFlatObservedDefect = Expect<
    Equal<typeof aflatObservedDefect, AsyncResult<number, NotFound | DriverError>>
  >;

  // match's errCases handler: the fold type is the declared one
  const folded = r.match({
    ok: (n) => `ok:${n}`,
    errCases: (matcher) => matcher.returnType<string>().with(P._, (err) => err._tag),
    defect: () => "defect",
  });
  type _Folded = Expect<Equal<typeof folded, string>>;

  // an async branch is STILL rejected where the combinator awaits it
  r.flatMapErrCases((matcher) =>
    // @ts-expect-error — an async flatMapErrCases branch is banned, pin or no pin
    matcher.returnType<Result<number, ApiError>>().with(P._, async () => Ok(1)),
  );

  // …and in flatTapErrCases, the other awaiting matcher combinator. Under a pin
  // the mechanism differs — the branch return is checked against `Declared |
  // Defect`, so a `Promise` fails ON THE BRANCH rather than via the builder's
  // `ExhaustiveMatch<Result<…>>` constraint — but the rejection still fires.
  r.flatTapErrCases((matcher) =>
    // @ts-expect-error — an async flatTapErrCases branch is banned, pin or no pin
    matcher.returnType<Result<number, AuditFailed>>().with(P._, async () => Ok(1)),
  );
  r.toAsync().flatTapErrCases((matcher) =>
    // @ts-expect-error — …the same on the async surface, which awaits the branch
    matcher.returnType<Result<number, AuditFailed>>().with(P._, async () => Ok(1)),
  );

  // THE MOTIVATING CASE: generic in E, catch-all terminated, output DECLARED by
  // the signature rather than inferred from the branch (issue #145 territory —
  // the catch-all is a state transition, so it is provably exhaustive here)
  const lock = <T, E>(res: Result<T, E>): Result<T, ApiError> =>
    res.mapErrCases((matcher) =>
      matcher.returnType<ApiError>().with(P._, () => new ApiError({ status: 500 })),
    );
  const locked = lock(r);
  type _Locked = Expect<Equal<typeof locked, Result<number, ApiError>>>;
}

// --- fromExecutor: two type arguments, no third generic for NotThenable -----

// fromExecutor: the two-type-argument call compiles. A third generic (for a
// `R & NotThenable<R>` executor return) would make this `TS2558: Expected 3
// type arguments, but got 2` — see CLAUDE.md's runtime-not-types invariant.
const fromExecutorExplicit = fromExecutor<number, "boom">((settle) => {
  settle(Ok(1));
});
type _FromExecutorExplicit = Expect<
  Equal<typeof fromExecutorExplicit, AsyncResult<number, "boom">>
>;

// T/E flow from an annotated target, so a call site with a typed home needs no
// explicit type arguments.
type ExecutorClock = { readonly sleep: (ms: number) => AsyncResult<void, never> };
const executorClock: ExecutorClock = {
  sleep: (ms) =>
    fromExecutor((settle) => {
      void ms;
      settle(Ok());
    }),
};
void executorClock;

// settle rejects a Result outside the declared channels.
void fromExecutor<number, "boom">((settle) => {
  // @ts-expect-error - "other" is not in the error channel
  settle(Err("other"));
});
