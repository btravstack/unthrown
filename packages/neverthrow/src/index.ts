// @unthrown/neverthrow — interop between unthrown's `Result`/`AsyncResult` and
// neverthrow's `Result`/`ResultAsync`.
//
// neverthrow has two channels (`Ok`/`Err`), so it cannot represent unthrown's
// third one. Coming *in*, every neverthrow result is an `Ok` or `Err` — never a
// `Defect`. Going *out*, a `Defect` has nowhere to live, so `toNeverthrow`
// forces you to triage it with `onDefect` (Thesis #3): no Defect is ever
// silently folded into your domain error type.
//
//   import { Ok } from "unthrown";
//   import { toNeverthrow, fromNeverthrow } from "@unthrown/neverthrow";
//
//   toNeverthrow(Ok(1), (cause) => ({ _tag: "Bug", cause }));
//   fromNeverthrow(neverthrowOk(1)); // Result<number, never>

import {
  err as neverthrowErr,
  ok as neverthrowOk,
  ResultAsync as NeverthrowResultAsync,
} from "neverthrow";
import type { Result as NeverthrowResult } from "neverthrow";
import { Err, fromSafePromise, Ok } from "unthrown";
import type { AsyncResult, Result } from "unthrown";

/**
 * Convert a `Result` into a neverthrow `Result`, triaging any Defect.
 *
 * @remarks
 * neverthrow has no Defect channel, so `onDefect` **must** fold a `Defect`'s
 * cause into a modeled error `E` (an `Err`). `Ok → Ok`, `Err → Err`,
 * `Defect → Err(onDefect(cause))`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param result - the result to convert.
 * @param onDefect - folds a Defect's unknown cause into a modeled `E`.
 *
 * @example
 * ```ts
 * import { fromThrowable } from "unthrown";
 * import { toNeverthrow } from "@unthrown/neverthrow";
 *
 * // Mint a Defect, then convert: it has no home in neverthrow, so onDefect folds it into E.
 * const defective = fromThrowable((): number => {
 *   throw new Error("boom");
 * }, (cause, defect) => defect(cause))();
 * const nt = toNeverthrow(defective, (cause) => `bug: ${String(cause)}`);
 * nt.isErr(); // => true — the Err carries "bug: Error: boom"
 * ```
 */
export function toNeverthrow<T, E>(
  result: Result<T, E>,
  onDefect: (cause: unknown) => E,
): NeverthrowResult<T, E> {
  return result.match<NeverthrowResult<T, E>>({
    ok: (value) => neverthrowOk(value),
    err: (error) => neverthrowErr(error),
    defect: (cause) => neverthrowErr(onDefect(cause)),
  });
}

/**
 * Convert a neverthrow `Result` into a `Result`.
 *
 * @remarks
 * `Ok → Ok`, `Err → Err`. neverthrow carries no Defect, so the result is never a
 * `Defect`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param result - the neverthrow result to convert.
 *
 * @example
 * ```ts
 * import { ok } from "neverthrow";
 * import { fromNeverthrow } from "@unthrown/neverthrow";
 *
 * const result = fromNeverthrow(ok(1));
 * result.isOk(); // => true
 * ```
 */
export function fromNeverthrow<T, E>(result: NeverthrowResult<T, E>): Result<T, E> {
  return result.isOk() ? Ok(result.value) : Err(result.error);
}

/**
 * Convert an `AsyncResult` into a neverthrow `ResultAsync`, triaging any
 * Defect.
 *
 * @remarks
 * The async counterpart of {@link toNeverthrow}: `onDefect` is required for the
 * same reason. The `AsyncResult` is awaited (it never rejects) and each settled
 * `Result` is converted.
 *
 * A throwing `onDefect` surfaces as a rejection of the returned
 * `ResultAsync`'s inner promise — neverthrow's own failure mode; do not throw
 * from triage.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param asyncResult - the async result to convert.
 * @param onDefect - folds a Defect's unknown cause into a modeled `E`.
 *
 * @example
 * ```ts
 * import { fromSafePromise } from "unthrown";
 * import { toNeverthrowAsync } from "@unthrown/neverthrow";
 *
 * // A rejection inside fromSafePromise is a Defect; onDefect folds it into E on the way out.
 * const defective = fromSafePromise(Promise.reject(new Error("boom")));
 * const result = await toNeverthrowAsync(defective, (cause) => `bug: ${String(cause)}`);
 * result.isErr(); // => true — the Err carries "bug: Error: boom"
 * ```
 */
export function toNeverthrowAsync<T, E>(
  asyncResult: AsyncResult<T, E>,
  onDefect: (cause: unknown) => E,
): NeverthrowResultAsync<T, E> {
  return NeverthrowResultAsync.fromSafePromise(settle(asyncResult)).andThen((result) =>
    toNeverthrow(result, onDefect),
  );
}

/**
 * Convert a neverthrow `ResultAsync` into an `AsyncResult`.
 *
 * @remarks
 * The async counterpart of {@link fromNeverthrow}. A modeled `Err` stays an
 * `Err`; an *unexpected* rejection inside the neverthrow chain becomes a
 * `Defect`. The returned `AsyncResult` never throws when awaited.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param resultAsync - the neverthrow async result to convert.
 *
 * @example
 * ```ts
 * import { okAsync } from "neverthrow";
 * import { fromNeverthrowAsync } from "@unthrown/neverthrow";
 *
 * const result = await fromNeverthrowAsync(okAsync(1));
 * result.isOk(); // => true
 * ```
 */
export function fromNeverthrowAsync<T, E>(
  resultAsync: NeverthrowResultAsync<T, E>,
): AsyncResult<T, E> {
  return fromSafePromise(Promise.resolve(resultAsync)).flatMap((result) => fromNeverthrow(result));
}

function settle<T, E>(asyncResult: AsyncResult<T, E>): Promise<Result<T, E>> {
  return (async () => await asyncResult)();
}
