export { Err, isDefect, isErr, isOk, Ok } from "./constructors.js";
export { isResult, UnwrapError } from "./core.js";
export { Defect } from "./defect.js";
export { Do } from "./do.js";
export { Result } from "./facade.js";
export {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
} from "./interop.js";
export { matchTags, TaggedError } from "./tagged.js";

export type { TaggedErrorConstructor, TaggedErrorInstance, TagHandlers } from "./tagged.js";
export type {
  AsyncErrOf,
  AsyncOkOf,
  AsyncResult,
  Awaitable,
  DefectView,
  ErrOf,
  ErrView,
  OkOf,
  OkView,
} from "./types.js";
