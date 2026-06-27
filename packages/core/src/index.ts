export { err, isDefect, isErr, isOk, ok } from "./constructors.js";
export { UnwrapError } from "./core.js";
export { defect } from "./defect.js";
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

export type { Defect } from "./defect.js";
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
