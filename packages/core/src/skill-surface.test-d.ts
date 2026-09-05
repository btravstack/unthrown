// A compile-check of the API surface the agent skill (`skills/unthrown/`)
// documents. The skill is markdown — nothing typechecks it — and it has already
// shipped a signature that was simply wrong (`fromSchema(schema, input)` for a
// curried API), which suggests it was written from intent rather than verified.
//
// `packages/oxlint/src/skill.test.ts` pins the oxlint rule inventory; this pins
// the core surface: every export the skill names, spelled the way the skill
// spells it. A rename, a removed export, or a signature the skill misreports
// fails `tsc` here.
//
// Checked by the package's regular `tsc --noEmit`; no runtime.

import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  type AsyncErrOf,
  type AsyncOkOf,
  AsyncResult,
  Do,
  DoAsync,
  Err,
  ErrAsync,
  type ErrMatcher,
  type ErrOf,
  type FailureView,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromSafeThrowable,
  fromThrowable,
  GetError,
  isDefect,
  isErr,
  isOk,
  isResult,
  match,
  NonExhaustiveError,
  type NotThenable,
  Ok,
  type OkOf,
  OkAsync,
  P,
  Result,
  TaggedError,
  type TaggedErrorConstructor,
  type TaggedErrorInstance,
  validateAll,
  validateAllAsync,
  validateAllFromDict,
  validateAllFromDictAsync,
} from "./index.js";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// --- SKILL.md "Construct and chain" -------------------------------------------

type AgeError = "not_a_number" | "negative";
declare const input: string;

function parseAge(text: string): Result<number, AgeError> {
  const n = Number(text);
  if (Number.isNaN(n)) return Err("not_a_number");
  if (n < 0) return Err("negative");
  return Ok(n);
}

const adult = parseAge(input)
  .map((n) => n + 1)
  .flatMap((n) => (n >= 18 ? Ok(n) : Err("underage" as const)));

// `Ok()` with no argument is a `Result<void, never>`, as the skill states.
const voidOk = Ok();

// --- SKILL.md "Boundaries" ----------------------------------------------------

class NotFoundError extends Error {}
declare function fetchUser(id: string): Promise<{ id: string }>;
declare const id: string;

const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
);

const parse = fromThrowable(
  (text: string) => JSON.parse(text) as unknown,
  (cause, defect) => (cause instanceof SyntaxError ? ("invalid_json" as const) : defect(cause)),
);

declare const schemaParse: (row: unknown) => { ok: true };
const decode = fromSafeThrowable(schemaParse);
declare function loadConfig(): Promise<{ port: number }>;
const cfg = fromSafePromise(loadConfig());

declare const map: Map<string, number>;
declare const key: string;
const absent = fromNullable(map.get(key), () => "absent" as const);

// --- SKILL.md "The error channel" --------------------------------------------

class RecordNotFound extends TaggedError("RecordNotFound")<{ id: string }> {}
class Unavailable extends TaggedError("Unavailable")<{ cause: unknown }> {}

declare const tagged: Result<number, RecordNotFound | Unavailable>;

const mapped = tagged.mapErrCases((matcher, defect) =>
  matcher
    .with(P.tag("RecordNotFound"), (e) => e.id)
    .with(P.tag("Unavailable"), (e) => defect(e.cause)),
);

// Grouped patterns share one handler, as the skill shows.
const grouped = tagged.tapErrCases((matcher) =>
  matcher.with(P.tag("RecordNotFound"), P.tag("Unavailable"), () => undefined),
);

// The other three error combinators the skill names.
const flatMapped = tagged.flatMapErrCases((matcher) =>
  matcher
    .with(P.tag("RecordNotFound"), () => Ok(0))
    .with(P.tag("Unavailable"), () => Err("x" as const)),
);
const recovered = tagged.recoverErrCases((matcher) =>
  matcher.with(P.tag("RecordNotFound"), () => 0).with(P.tag("Unavailable"), () => -1),
);
const flatTapped = tagged.flatTapErrCases((matcher) =>
  matcher.with(P.tag("RecordNotFound"), P.tag("Unavailable"), () => Ok(undefined)),
);

// `returnType<R>()` pins the output, called first.
const pinned = tagged.mapErrCases((matcher) =>
  matcher
    .returnType<string>()
    .with(P.tag("RecordNotFound"), () => "nf")
    .with(P.tag("Unavailable"), () => "down"),
);

// --- SKILL.md "Eliminate at the edge" ----------------------------------------

const folded = parseAge(input).match({
  ok: (age) => `age is ${age}`,
  errCases: (matcher) =>
    matcher.with("negative", () => "must be positive").with("not_a_number", () => "not a number"),
  defect: () => "something went wrong",
});

// The extractor family, spelled exactly as the skill lists it.
declare const total: Result<number, never>;
declare const failing: Result<number, AgeError>;
const got: number = total.get();
const gotErr: AgeError = (Err("negative" as AgeError) as Result<never, AgeError>).getErr();
const or: number = failing.getOr(0);
const orElse: number = failing.getOrElse(() => 0);
const orNull: number | null = failing.getOrNull();
const orUndef: number | undefined = failing.getOrUndefined();
const orThrow: number = failing.getOrThrow();

// --- SKILL.md "AsyncResult" ---------------------------------------------------

declare function loadOrders(uid: string): Promise<number[]>;

const lifted = parseAge(input)
  .toAsync()
  .flatMap(() => fromPromise(loadOrders(id), (c, d) => d(c)))
  .map((orders) => orders.length);

const preLifted = [OkAsync(1), ErrAsync("e" as const)] as const;

// --- SKILL.md "TaggedError" ---------------------------------------------------

class NotFound extends TaggedError("NotFound") {}
class HttpError extends TaggedError("HttpError")<{ status: number }> {
  override message = `http ${this.status}`;
}
class Namespaced extends TaggedError("pkg/NotFound", { name: "NotFound" }) {}

const empty = new NotFound(); // no-arg constructor when the payload is empty
const withPayload = new HttpError({ status: 500 });

// --- references/api.md: do-notation, aggregates, guards, facades --------------

const doChain = Do()
  .bind("a", () => Ok(1))
  .let("b", (scope) => scope.a + 1)
  .map((scope) => scope.a + scope.b);

const doAsyncChain = DoAsync().bind("a", () => OkAsync(1));
const tuple = all([Ok(1), Ok("a")] as const);
const dict = allFromDict({ a: Ok(1), b: Ok("x") });
const tupleAsync = allAsync([OkAsync(1), OkAsync("a")] as const);
const dictAsync = allFromDictAsync({ a: OkAsync(1), b: OkAsync("x") });
const validatedTuple = validateAll([Ok(1), Ok("a")] as const, () => Err("failures" as const));
const validatedDict = validateAllFromDict({ a: Ok(1), b: Ok("x") }, () => Err("failures" as const));
const asyncValidatedTuple = validateAllAsync([OkAsync(1), OkAsync("a")] as const, () =>
  Err("failures" as const),
);
const asyncValidatedDict = validateAllFromDictAsync({ a: OkAsync(1), b: OkAsync("x") }, () =>
  Err("failures" as const),
);

declare const unknownValue: unknown;
const guarded = isResult(unknownValue);
const okGuard = isOk(total);
const errGuard = isErr(failing);
const defectGuard = isDefect(failing);
const methodGuard = failing.isOk();

// The facade companions carry the same entry points.
const viaFacade = [
  Result.Ok(1),
  Result.Err("e" as const),
  Result.Do(),
  Result.fromNullable(1 as number | null, () => "absent" as const),
  Result.fromThrowable(
    () => 1,
    (c, d) => d(c),
  ),
  Result.fromSafeThrowable(() => 1),
  Result.all([Ok(1)] as const),
  Result.allFromDict({ a: Ok(1) }),
  Result.validateAll([Ok(1), Ok("a")] as const, () => Err("failures" as const)),
  Result.validateAllFromDict({ a: Ok(1), b: Ok("x") }, () => Err("failures" as const)),
] as const;
const viaAsyncFacade = [
  AsyncResult.Ok(1),
  AsyncResult.Err("e" as const),
  AsyncResult.Do(),
  AsyncResult.fromPromise(Promise.resolve(1), (c, d) => d(c)),
  AsyncResult.fromSafePromise(Promise.resolve(1)),
  AsyncResult.all([OkAsync(1)] as const),
  AsyncResult.allFromDict({ a: OkAsync(1) }),
  AsyncResult.validateAll([OkAsync(1), OkAsync("a")] as const, () => Err("failures" as const)),
  AsyncResult.validateAllFromDict({ a: OkAsync(1), b: OkAsync("x") }, () =>
    Err("failures" as const),
  ),
] as const;

// --- references/api.md: the P namespace ---------------------------------------

const patterns = [
  P._,
  P.tag("RecordNotFound"),
  P.instanceOf(NotFoundError),
  P.when((x: unknown): x is string => typeof x === "string"),
] as const;

// `match` over a whole Result, since Result is a discriminated union.
const overResult = match(total)
  .with({ tag: "Ok" }, (r) => r.value)
  .with({ tag: "Err" }, () => 0)
  .with({ tag: "Defect" }, () => -1)
  .exhaustive();

// --- references/api.md: the exported utility types -----------------------------

declare function producer(): Result<number, AgeError>;
declare function asyncProducer(): AsyncResult<number, AgeError>;
declare const failureView: FailureView<AgeError>;
declare const errMatcher: ErrMatcher<AgeError>;
declare const notThenable: NotThenable<number>;
declare const taggedCtor: TaggedErrorConstructor<"X">;
declare const taggedInst: TaggedErrorInstance<"X", { a: number }>;
declare const getError: GetError<AgeError>;
declare const nonExhaustive: NonExhaustiveError;

export type _SkillSurface = [
  // the shapes the skill states in prose
  Expect<Equal<typeof voidOk, Result<void, never>>>,
  Expect<Equal<OkOf<ReturnType<typeof producer>>, number>>,
  Expect<Equal<ErrOf<ReturnType<typeof producer>>, AgeError>>,
  Expect<Equal<AsyncOkOf<ReturnType<typeof asyncProducer>>, number>>,
  Expect<Equal<AsyncErrOf<ReturnType<typeof asyncProducer>>, AgeError>>,
  // `flatMap` unions the error channels — SKILL.md says so explicitly
  Expect<Equal<ErrOf<typeof adult>, AgeError | "underage">>,
  // a defect branch is subtracted from the outgoing E
  Expect<Equal<ErrOf<typeof mapped>, string>>,
  // recoverErrCases empties the error channel
  Expect<Equal<ErrOf<typeof recovered>, never>>,
  // fromNullable strips null/undefined from the success type
  Expect<Equal<OkOf<typeof absent>, number>>,
  // a defect-only qualify yields E = never
  Expect<Equal<AsyncErrOf<typeof cfg>, never>>,
  Expect<Equal<ErrOf<ReturnType<typeof decode>>, never>>,
  // the do-chain accumulates a readonly object scope
  Expect<Equal<OkOf<typeof doChain>, number>>,
  // `all` keeps positional types for a fixed tuple; `allFromDict` keys them
  // (a readonly tuple in, a mutable positional tuple out — the `AllOk` mapping)
  Expect<Equal<OkOf<typeof tuple>, [number, string]>>,
  Expect<Equal<OkOf<typeof dict>, { a: number; b: string }>>,
  Expect<Equal<OkOf<typeof validatedTuple>, [number, string]>>,
  Expect<Equal<OkOf<typeof validatedDict>, { a: number; b: string }>>,
  // FailureView's second parameter defaults, so `FailureView<E>` is spellable
  Expect<Equal<typeof failureView, FailureView<AgeError, never>>>,
];

// Everything above must be *used* so `noUnusedLocals` stays satisfied.
export const _skillSurfaceValues = [
  user,
  parse,
  grouped,
  flatMapped,
  flatTapped,
  pinned,
  folded,
  got,
  gotErr,
  or,
  orElse,
  orNull,
  orUndef,
  orThrow,
  lifted,
  preLifted,
  empty,
  withPayload,
  Namespaced,
  doAsyncChain,
  tupleAsync,
  dictAsync,
  asyncValidatedTuple,
  asyncValidatedDict,
  guarded,
  okGuard,
  errGuard,
  defectGuard,
  methodGuard,
  viaFacade,
  viaAsyncFacade,
  patterns,
  overResult,
  errMatcher,
  notThenable,
  taggedCtor,
  taggedInst,
  getError,
  nonExhaustive,
] as const;
