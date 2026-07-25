// ts-pattern powers the error-matching combinators (`mapErr`/`flatMapErr`/…),
// and is re-exported so `P` (wildcards, `P.union`, guards) and `match` (for
// eliminating a `Result` directly) are available from one import.
export { match, P } from "ts-pattern";

export { Err, ErrAsync, isDefect, isErr, isOk, Ok, OkAsync } from "./constructors.js";
export { isResult, UnwrapError } from "./core.js";
export { Do } from "./do.js";
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
export { tag, TaggedError } from "./tagged.js";

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
