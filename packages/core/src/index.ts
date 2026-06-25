export {
  all,
  defect,
  err,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
  isErr,
  isOk,
  isPanic,
  ok,
  panic,
  UnwrapError,
} from "./result.js";

export type {
  AsyncResult,
  Defect,
  ErrOf,
  ErrView,
  OkOf,
  OkView,
  PanicView,
  Result,
} from "./result.js";
