export { err, isDefect, isErr, isOk, ok } from "./constructors.js";
export { UnwrapError } from "./core.js";
export { defect } from "./defect.js";
export { Result } from "./facade.js";
export { all, fromNullable, fromPromise, fromSafePromise, fromThrowable } from "./interop.js";

export type { Defect } from "./defect.js";
export type { AsyncResult, Awaitable, DefectView, ErrOf, ErrView, OkOf, OkView } from "./types.js";
