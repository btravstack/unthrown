// Result constructors and the standalone guards. The guards narrow a `Result`
// to the relevant view, exposing the `value`/`error`/`cause` field that the
// `Result` type otherwise hides.

import { Res } from "./core.js";
import type { DefectView, ErrView, OkView, Result } from "./types.js";

export function ok<T>(value: T): Result<T, never> {
  return new Res<T, never>({ tag: "ok", value });
}

export function err<E>(error: E): Result<never, E> {
  return new Res<never, E>({ tag: "err", error });
}

export function isOk<T, E>(r: Result<T, E>): r is OkView<T> {
  return r.isOk();
}
export function isErr<T, E>(r: Result<T, E>): r is ErrView<E> {
  return r.isErr();
}
export function isDefect<T, E>(r: Result<T, E>): r is DefectView {
  return r.isDefect();
}
