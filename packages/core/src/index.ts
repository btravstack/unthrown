export {
  all,
  defect,
  err,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
  isDefect,
  isErr,
  isOk,
  ok,
  Result,
  UnwrapError,
} from "./result.js";

export type {
  AsyncResult,
  Awaitable,
  Defect,
  DefectView,
  ErrOf,
  ErrView,
  OkOf,
  OkView,
} from "./result.js";
