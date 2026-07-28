// The built-in matcher powers the error-matching combinators
// (`mapErrCases`/`flatMapErrCases`/…): `match` starts a match (over an error or
// any discriminated value, a `Result` included), `P` carries the pattern
// helpers (`P.tag`, `P.instanceOf`, `P.when`, `P.union`, `P.string`,
// `P.number`, plus the wildcard escape hatch `P._` — name your cases instead
// wherever `E` is concrete), and `NonExhaustiveError` is what a rogue unmatched
// value throws at the `match` edge.
export { match, NonExhaustiveError, P } from "./matcher.js";
export type { Matcher, PatternMatcher, UniversalPattern } from "./matcher.js";

export { Err, ErrAsync, isDefect, isErr, isOk, Ok, OkAsync } from "./constructors.js";
export { isResult, GetError } from "./core.js";
export { Do, DoAsync } from "./do.js";
export { AsyncResult, Result } from "./facade.js";
export {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromSafeThrowable,
  fromThrowable,
} from "./interop.js";
export { TaggedError } from "./tagged.js";

export type { TaggedErrorConstructor, TaggedErrorInstance } from "./tagged.js";
export type {
  AsyncErrOf,
  AsyncOkOf,
  AsyncResultMethods,
  Awaitable,
  DefectView,
  ErrMatcher,
  ErrOf,
  ErrView,
  FailureView,
  NotThenable,
  OkOf,
  OkView,
  ResultMethods,
} from "./types.js";
