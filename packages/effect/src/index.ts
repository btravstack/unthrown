// @unthrown/effect — interop between unthrown's `Result`/`AsyncResult` and
// Effect's `Exit`, `Either`, and `Effect`.
//
// Effect is the one neighbour that shares unthrown's three-channel shape: an
// `Exit<A, E>` is `Success` | `Failure(Cause)`, and a `Cause` distinguishes a
// modeled failure (`Cause.fail`, ↔ `Err`) from an unexpected one (`Cause.die`,
// ↔ `Defect`). So `Result ↔ Exit` is a genuine bijection — the showcase here.
//
//   import { ok } from "unthrown";
//   import { toExit, fromEffect } from "@unthrown/effect";
//
//   toExit(ok(1));                 // Exit.succeed(1)
//   await fromEffect(Effect.succeed(1)).match({ ok, err, defect });
//
// `Either` has only two channels, so converting a `Result` *into* an `Either`
// forces you to triage the defect with `onDefect` (Thesis #3): there is no
// silent path that drops it.

import { Cause, Effect, Either, Exit, Option } from "effect";
import { defect, err, fromSafePromise, fromThrowable, ok } from "unthrown";
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
 * import { ok } from "unthrown";
 * import { toExit } from "@unthrown/effect";
 * toExit(ok(1)); // Exit.succeed(1)
 * ```
 */
export function toExit<T, E>(result: Result<T, E>): Exit.Exit<T, E> {
  return result.match<Exit.Exit<T, E>>({
    ok: (value) => Exit.succeed(value),
    err: (error) => Exit.fail(error),
    defect: (cause) => Exit.die(cause),
  });
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
 */
export function fromExit<T, E>(exit: Exit.Exit<T, E>): Result<T, E> {
  return Exit.match(exit, {
    onSuccess: (value) => ok(value),
    onFailure: (cause) => {
      const die = Cause.dieOption(cause);
      if (Option.isSome(die)) return dieToResult<T, E>(die.value);
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) return err(failure.value);
      // No modeled failure and no die: a pure interruption (or empty cause).
      return dieToResult<T, E>(Cause.squash(cause));
    },
  });
}

/**
 * Convert a `Result` into an Effect `Either`, triaging any defect.
 *
 * @remarks
 * `Either` has no defect channel, so a `Defect` cannot pass through silently —
 * `onDefect` **must** fold its cause into a modeled error `E` (a `Left`). This
 * is the boundary-qualification rule (Thesis #3) applied on the way out:
 * `Ok → Right`, `Err → Left`, `Defect → Left(onDefect(cause))`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param result - the result to convert.
 * @param onDefect - folds a defect's unknown cause into a modeled `E`.
 */
export function toEither<T, E>(
  result: Result<T, E>,
  onDefect: (cause: unknown) => E,
): Either.Either<T, E> {
  return result.match<Either.Either<T, E>>({
    ok: (value) => Either.right(value),
    err: (error) => Either.left(error),
    defect: (cause) => Either.left(onDefect(cause)),
  });
}

/**
 * Convert an Effect `Either` into a `Result`.
 *
 * @remarks
 * `Right → Ok`, `Left → Err`. An `Either` carries no defect, so the result is
 * never a `Defect`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @param either - the either to convert.
 */
export function fromEither<T, E>(either: Either.Either<T, E>): Result<T, E> {
  return Either.match(either, {
    onLeft: (error) => err(error),
    onRight: (value) => ok(value),
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
 */
export function toEffect<T, E>(source: Result<T, E>): Effect.Effect<T, E>;
export function toEffect<T, E>(source: AsyncResult<T, E>): Effect.Effect<T, E>;
export function toEffect<T, E>(source: Result<T, E> | AsyncResult<T, E>): Effect.Effect<T, E> {
  if (isAsyncResult(source)) {
    return Effect.flatMap(
      Effect.promise(() => settle(source)),
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
 */
export function fromEffect<T, E>(effect: Effect.Effect<T, E>): AsyncResult<T, E> {
  return fromSafePromise(Effect.runPromiseExit(effect)).flatMap((exit) => fromExit(exit));
}

function resultToEffect<T, E>(result: Result<T, E>): Effect.Effect<T, E> {
  return result.match<Effect.Effect<T, E>>({
    ok: (value) => Effect.succeed(value),
    err: (error) => Effect.fail(error),
    defect: (cause) => Effect.die(cause),
  });
}

// Effect's `die`/interruption channel is an un-triaged failure crossing into
// unthrown; replaying it through the throwable boundary lands it in the `Defect`
// state — the sanctioned (boundary-only) way to mint a defect `Result`.
function dieToResult<T, E>(cause: unknown): Result<T, E> {
  // The thunk always throws, so its `T` return is honest; `qualify` is `defect`,
  // so the modeled error is `never` — widened to `E` here (there is no `Err`).
  return fromThrowable((): T => {
    throw cause;
  }, defect)() as Result<T, E>;
}

function settle<T, E>(asyncResult: AsyncResult<T, E>): Promise<Result<T, E>> {
  return (async () => await asyncResult)();
}

function isAsyncResult<T, E>(
  source: Result<T, E> | AsyncResult<T, E>,
): source is AsyncResult<T, E> {
  return typeof (source as { then?: unknown }).then === "function";
}
