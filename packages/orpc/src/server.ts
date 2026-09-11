// @unthrown/orpc/server — the server half of the oRPC bridge.
//
// oRPC v2 (beta.34+) has no returned-error channel: a value returned from a
// handler is always the success payload, even an `ORPCError`. The only way to
// surface a typed, defined error is to THROW an `ORPCError` whose `code` is
// declared in the procedure's `.errors({...})` map — oRPC reconciles a
// matching code's `defined` flag to `true` on the wire. That makes
// eliminating a `Result` at the procedure boundary a straight three-way
// mapping:
//
//   Ok(value)  → return value         (the procedure's output)
//   Err(error) → throw the ORPCError  (a declared code lands defined — typed E2E)
//   Defect     → rethrow the cause    (oRPC collapses an opaque cause to INTERNAL_SERVER_ERROR)
//
// The handler's `Err` channel is constrained to `ORPCError`: mapping a domain
// error into one — `mapErrCases((m) => m.with(P.tag("NotFound"), () => errors.NOT_FOUND({...})))`,
// one arm per case of `E` — is the explicit triage point at the transport
// boundary (Thesis #3).

import type {
  AnyORPCError,
  Context,
  ErrorMap,
  ORPCErrorConstructorMap,
  ProcedureHandler,
  ProcedureHandlerOptions,
} from "@orpc/server";
import type { AsyncResult, Result } from "unthrown";

/**
 * A procedure handler that speaks `Result`: same options as a plain oRPC
 * handler (`input`, `context`, `errors`, …), returning a
 * `Result<TOutput, TError>` — synchronous, promised, or as an
 * `AsyncResult`.
 *
 * @category Server
 */
export type ResultHandler<
  TCurrentContext extends Context,
  TInput,
  TOutput,
  TError extends AnyORPCError,
  TErrorMap extends ErrorMap,
> = (
  opts: ProcedureHandlerOptions<TCurrentContext, TInput, ORPCErrorConstructorMap<TErrorMap>>,
  input: TInput,
) => // oxlint-disable-next-line unthrown/prefer-async-result -- an `async` handler is deliberately admitted here: this is an elimination edge, exempt from the no-thenable rule like `match`
  Result<TOutput, TError> | Promise<Result<TOutput, TError>> | AsyncResult<TOutput, TError>;

/**
 * Adapt a `Result`-returning handler into a plain oRPC procedure handler.
 *
 * @remarks
 * The elimination boundary of the server half: `Ok` becomes the procedure's
 * output; `Err` (constrained to `ORPCError` — build one with the injected
 * `errors.CODE(...)` constructors, or map a domain error via `mapErrCases` first)
 * is thrown, so a declared code reaches the client as a defined, typed error;
 * a `Defect` rethrows its original cause — oRPC collapses an opaque cause to
 * `INTERNAL_SERVER_ERROR`, but a bug stays a defect either way, never a
 * typed error.
 *
 * Like `match` handlers, the callback may be `async` (an edge elimination is
 * exempt from the no-thenable rule): a rejection or throw inside it cannot
 * skip triage, because oRPC's own boundary already treats it as the defect
 * path.
 *
 * @param handler - the `Result`-speaking handler to adapt.
 *
 * @category Server
 *
 * @example
 * ```ts
 * import { P } from "unthrown";
 * import { handlerResult } from "@unthrown/orpc/server";
 *
 * const find = os
 *   .input(z.object({ id: z.string() }))
 *   .errors({ NOT_FOUND: {} })
 *   .handler(
 *     handlerResult(({ input, errors }) =>
 *       repo
 *         .findPlanet(input.id)
 *         .mapErrCases((matcher) =>
 *           matcher.with(P.tag("NotFound"), () => errors.NOT_FOUND()),
 *         ),
 *     ),
 *   );
 * ```
 */
export function handlerResult<
  TCurrentContext extends Context,
  TInput,
  TOutput,
  TError extends AnyORPCError,
  TErrorMap extends ErrorMap,
>(
  handler: ResultHandler<TCurrentContext, TInput, TOutput, TError, TErrorMap>,
): ProcedureHandler<TCurrentContext, TInput, TOutput, ORPCErrorConstructorMap<TErrorMap>> {
  return async (opts, input) => {
    const result = await handler(opts, input);
    // Branch via the guards rather than `match`: this library code is generic in
    // the error type `TError`, and `match`'s exhaustive `errCases` matcher cannot be
    // proven exhaustive by tag arms over an unresolved type parameter. The
    // concrete triage (`.mapErrCases((matcher) => …)`) still happens at the endpoint.
    if (result.isOk()) return result.value;
    if (result.isErr()) {
      // Always THROW, never return: oRPC (beta.34+) treats any returned value —
      // an `ORPCError` included — as the success payload, so returning it here
      // would serve the error as a 200 (or fail output validation into a 500).
      // Throwing a declared code is what earns it `defined: true` on the wire.
      throw result.error;
    }
    throw result.cause; // Defect — rethrow the cause onto oRPC's defect path.
  };
}
