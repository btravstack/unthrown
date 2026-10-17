// @unthrown/effect — interop between unthrown's `Result`/`AsyncResult` and
// Effect's `Exit`, `Result`, and `Effect`.
//
// Effect is the one neighbour that shares unthrown's three-channel shape: an
// `Exit<A, E>` is `Success` | `Failure(Cause)`, and a `Cause` distinguishes a
// modeled failure (`Cause.fail`, ↔ `Err`) from an unexpected one (`Cause.die`,
// ↔ `Defect`). So `Result ↔ Exit` is a genuine bijection — the showcase here.
//
//   import { Ok } from "unthrown";
//   import { toExit, fromEffect } from "@unthrown/effect";
//
//   toExit(Ok(1));                 // Exit.succeed(1)
//   await fromEffect(Effect.succeed(1)).match({ ok, errCases, defect });
//
// Effect's `Result` has only two channels, so converting into it
// forces you to triage the Defect with `onDefect` (Thesis #3): there is no
// silent path that drops it.

import { Cause, Effect, Exit, Result as EffectResult } from "effect";
import { Err, fromSafePromise, fromThrowable, Ok } from "unthrown";
import type { AsyncResult, Result } from "unthrown";

/**
 * Convert a `Result` into an Effect `Exit` — a **bijection**, since both
 * carry three channels.
 *
 * @remarks
 * `Ok → Exit.succeed`, `Err → Exit.fail` (a modeled `Cause.fail`), and
 * `Defect → Exit.die` (an unexpected `Cause.die`). Round-trips with
 * {@link fromExit}.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param result - the result to convert.
 *
 * @example
 * ```ts
 * import { Ok } from "unthrown";
 * import { toExit } from "@unthrown/effect";
 * toExit(Ok(1)); // Exit.succeed(1)
 * ```
 */
export function toExit<T, E>(result: Result<T, E>): Exit.Exit<T, E> {
  // Guard-based (not `match`): this bridge is generic in `E`, and `match`'s
  // exhaustive `errCases` matcher cannot be proven exhaustive over an unresolved
  // type parameter.
  if (result.isOk()) return Exit.succeed(result.value);
  if (result.isErr()) return Exit.fail(result.error);
  return Exit.die(result.cause);
}

/**
 * Convert an Effect `Exit` into a `Result` — the inverse of
 * {@link toExit}.
 *
 * @remarks
 * `Exit.Success → Ok`. For a failure, the enclosing `Cause` is reduced:
 *
 * - a `Cause.die` becomes a `Defect`,
 * - otherwise a `Cause.fail` becomes the modeled `Err`,
 * - a pure interruption (or empty cause) becomes a `Defect`.
 *
 * A `Defect` **dominates** a modeled failure in a composite cause — the same
 * rule unthrown's `all` uses, on the principle that an unexpected failure is the
 * more severe signal.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param exit - the exit to convert.
 *
 * @example
 * ```ts
 * import { Exit } from "effect";
 * import { fromExit } from "@unthrown/effect";
 *
 * const result = fromExit(Exit.succeed(1));
 * result.isOk(); // => true
 * ```
 */
export function fromExit<T, E>(exit: Exit.Exit<T, E>): Result<T, E> {
  return Exit.match(exit, {
    onSuccess: (value) => Ok(value),
    onFailure: (cause) => {
      const die = Cause.findDefect(cause);
      if (EffectResult.isSuccess(die)) return dieToResult<T, E>(die.success);
      const failure = Cause.findError(cause);
      if (EffectResult.isSuccess(failure)) return Err(failure.success);
      // No modeled failure and no die: a pure interruption (or empty cause).
      return dieToResult<T, E>(Cause.squash(cause));
    },
  });
}

/**
 * Convert an unthrown `Result` into an Effect `Result`, triaging any Defect.
 *
 * @remarks
 * Effect's `Result` has no Defect channel, so a `Defect` cannot pass through silently —
 * `onDefect` **must** fold its cause into a modeled error `E` (a `Failure`). This
 * is the boundary-qualification rule (Thesis #3) applied on the way out:
 * `Ok → Success`, `Err → Failure`, `Defect → Failure(onDefect(cause))`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param result - the result to convert.
 * @param onDefect - folds a Defect's unknown cause into a modeled `E`.
 *
 * @example
 * ```ts
 * import { fromThrowable } from "unthrown";
 * import { toResult } from "@unthrown/effect";
 *
 * // Mint a Defect, then convert: it has no home in Effect's Result, so onDefect folds it into E.
 * const defective = fromThrowable((): number => {
 *   throw new Error("boom");
 * }, (cause, defect) => defect(cause))();
 * const result = toResult(defective, (cause) => `bug: ${String(cause)}`);
 * result._tag; // => "Failure" — carrying "bug: Error: boom"
 * ```
 */
export function toResult<T, E>(
  result: Result<T, E>,
  onDefect: (cause: unknown) => E,
): EffectResult.Result<T, E> {
  if (result.isOk()) return EffectResult.succeed(result.value);
  if (result.isErr()) return EffectResult.fail(result.error);
  return EffectResult.fail(onDefect(result.cause));
}

/**
 * Convert an Effect `Result` into an unthrown `Result`.
 *
 * @remarks
 * `Success → Ok`, `Failure → Err`. Effect's `Result` carries no Defect, so the
 * result is never a `Defect`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param result - the Effect Result to convert.
 *
 * @example
 * ```ts
 * import { Result as EffectResult } from "effect";
 * import { fromResult } from "@unthrown/effect";
 *
 * const result = fromResult(EffectResult.succeed(1));
 * result.isOk(); // => true
 * ```
 */
export function fromResult<T, E>(result: EffectResult.Result<T, E>): Result<T, E> {
  return EffectResult.match(result, {
    onFailure: (error) => Err(error),
    onSuccess: (value) => Ok(value),
  });
}

/**
 * Lift a `Result` or `AsyncResult` into an `Effect`.
 *
 * @remarks
 * `Ok → Effect.succeed`, `Err → Effect.fail`, `Defect → Effect.die`. The
 * resulting `Effect` needs no environment (`R = never`). An `AsyncResult` is
 * awaited inside the effect (it never rejects), so this is the `AsyncResult →
 * Effect` direction too.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param source - the result, or async result, to lift.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Ok } from "unthrown";
 * import { toEffect } from "@unthrown/effect";
 *
 * const effect = toEffect(Ok(1));
 * await Effect.runPromise(effect); // => 1
 * ```
 */
export function toEffect<T, E>(source: Result<T, E>): Effect.Effect<T, E>;
export function toEffect<T, E>(source: AsyncResult<T, E>): Effect.Effect<T, E>;
export function toEffect<T, E>(source: Result<T, E> | AsyncResult<T, E>): Effect.Effect<T, E> {
  if (isAsyncResult(source)) {
    return Effect.flatMap(
      Effect.promise(() => Promise.resolve(source)),
      (result) => resultToEffect(result),
    );
  }
  return resultToEffect(source);
}

/**
 * Run an `Effect` and collect its outcome as an `AsyncResult`.
 *
 * @remarks
 * The effect must need no environment (`R = never`). It is run to an `Exit`
 * (which never rejects), then folded with {@link fromExit}: success → `Ok`, a
 * modeled failure → `Err`, a die/interruption → `Defect`. The returned
 * `AsyncResult` never throws when awaited.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param effect - the effect to run.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { fromEffect } from "@unthrown/effect";
 *
 * const result = await fromEffect(Effect.succeed(1));
 * result.isOk(); // => true
 * ```
 */
export function fromEffect<T, E>(effect: Effect.Effect<T, E>): AsyncResult<T, E> {
  return fromSafePromise(Effect.runPromiseExit(effect)).flatMap((exit) => fromExit(exit));
}

function resultToEffect<T, E>(result: Result<T, E>): Effect.Effect<T, E> {
  if (result.isOk()) return Effect.succeed(result.value);
  if (result.isErr()) return Effect.fail(result.error);
  return Effect.die(result.cause);
}

// Effect's `die`/interruption channel is an un-triaged failure crossing into
// unthrown; replaying it through the throwable boundary lands it in the `Defect`
// state — the sanctioned (boundary-only) way to mint a Defect `Result`.
function dieToResult<T, E>(cause: unknown): Result<T, E> {
  // The thunk always throws, so its `T` return is honest; `qualify` marks every
  // cause a Defect, so the modeled error is `never` — widened to `E` here (there
  // is no `Err`).
  return fromThrowable(
    (): T => {
      throw cause;
    },
    (c, defect) => defect(c),
  )() as Result<T, E>;
}

function isAsyncResult<T, E>(
  source: Result<T, E> | AsyncResult<T, E>,
): source is AsyncResult<T, E> {
  return typeof (source as { then?: unknown }).then === "function";
}
