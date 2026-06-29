// Type-level test suite. These assertions have no runtime; they are checked by
// `tsc` (the `typecheck` script runs this file through `tsconfig.test-d.json`,
// which relaxes the unused-locals rules so throwaway assertion bindings are
// allowed). A failing assertion is a compile error.
//
// `Expect<Equal<A, B>>` is a hard error when `A` and `B` differ; `@ts-expect-error`
// guards the cases that must NOT compile.

import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  type AsyncErrOf,
  type AsyncOkOf,
  type AsyncResult,
  Defect,
  Do,
  type ErrOf,
  Err,
  fromPromise,
  fromThrowable,
  isDefect,
  isErr,
  isOk,
  isResult,
  matchTags,
  Ok,
  type OkOf,
  type Result,
  TaggedError,
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
const defectOnly = fromPromise(Promise.resolve(1), (c) => Defect(c));
type _defectOnly = Expect<Equal<typeof defectOnly, AsyncResult<number, never>>>;

// a mixed qualify keeps only the modeled arm
const mixedQualify = fromPromise(Promise.resolve(1), (c) =>
  c === 1 ? ("nf" as const) : Defect(c),
);
type _mixedQualify = Expect<Equal<typeof mixedQualify, AsyncResult<number, "nf">>>;

// the same subtraction on `fromThrowable`
const throwable = fromThrowable(
  (s: string) => s.length,
  (c) => Defect(c),
);
type _throwable = Expect<Equal<ReturnType<typeof throwable>, Result<number, never>>>;

// qualify is mandatory — there is no one-arg boundary
// @ts-expect-error - the qualify argument is required
fromPromise(Promise.resolve(1));

// --- combinators -------------------------------------------------------------

// flatMap widens the error channel
const flatMapped = r1.flatMap(() => Err<"e2">("e2"));
type _flatMapped = Expect<Equal<typeof flatMapped, Result<never, "e1" | "e2">>>;

// flatTap KEEPS the value type and widens the error channel
const flatTapped = r1.flatTap(() => Err<"e2">("e2"));
type _flatTapped = Expect<Equal<typeof flatTapped, Result<number, "e1" | "e2">>>;

// flatTapErr KEEPS the value type and widens the error channel (error-side mirror)
const flatTapErred = r1.flatTapErr(() => Err<"e2">("e2"));
type _flatTapErred = Expect<Equal<typeof flatTapErred, Result<number, "e1" | "e2">>>;

// recover empties the error channel (to `never`)
const recovered = r1.recover(() => 0);
type _recovered = Expect<Equal<typeof recovered, Result<number, never>>>;

// map changes the value type; mapErr changes the error type
const mapped = r1.map((n) => `${n}`);
type _mapped = Expect<Equal<typeof mapped, Result<string, "e1">>>;
const errMapped = r1.mapErr(() => 0 as const);
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

// --- extractor types ---------------------------------------------------------

type _okOf = Expect<Equal<OkOf<Result<number, "e">>, number>>;
type _errOf = Expect<Equal<ErrOf<Result<number, "e">>, "e">>;
type _asyncOkOf = Expect<Equal<AsyncOkOf<AsyncResult<number, "e">>, number>>;
type _asyncErrOf = Expect<Equal<AsyncErrOf<AsyncResult<number, "e">>, "e">>;

// --- tagged errors: matchTags is exhaustive ----------------------------------

class TagA extends TaggedError("TagA") {}
class TagB extends TaggedError("TagB") {}
declare const tagged: Result<number, TagA | TagB>;

matchTags(tagged, { Ok: () => 1, Defect: () => 2, TagA: () => 3, TagB: () => 4 });

// @ts-expect-error - the TagB handler is missing
matchTags(tagged, { Ok: () => 1, Defect: () => 2, TagA: () => 3 });

// `_tag` is the literal; `options.name` is independent (still a literal `_tag`)
class Named extends TaggedError("@scope/Named", { name: "Named" }) {}
type _namedTag = Expect<Equal<(typeof Named)["prototype"]["_tag"], "@scope/Named">>;
