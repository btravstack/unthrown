// @unthrown/orpc/server — the server half of the oRPC bridge.
//
// oRPC v2 handlers can RETURN an `ORPCError` as a value and have it inferred
// end-to-end (typed on the client, recognisable via `isInferableError`). That
// makes eliminating a `Result` at the procedure boundary a straight
// three-way mapping:
//
//   Ok(value)  → return value          (the procedure's output)
//   Err(error) → return the ORPCError  (oRPC marks it inferable — typed E2E)
//   Defect     → rethrow the cause     (oRPC collapses it to INTERNAL_SERVER_ERROR)
//
// The handler's `Err` channel is constrained to `ORPCError`: mapping a domain
// error into one (`mapErr((e) => errors.NOT_FOUND({...}))`) is the explicit
// triage point at the transport boundary (Thesis #3).

import {
  type AnyORPCError,
  type Context,
  type ErrorMap,
  ORPCError,
  type ORPCErrorConstructorMap,
  type ProcedureHandler,
  type ProcedureHandlerOptions,
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
) => Result<TOutput, TError> | Promise<Result<TOutput, TError>> | AsyncResult<TOutput, TError>;

/**
 * Adapt a `Result`-returning handler into a plain oRPC procedure handler.
 *
 * @remarks
 * The elimination boundary of the server half: `Ok` becomes the procedure's
 * output; `Err` (constrained to `ORPCError` — build one with the injected
 * `errors.CODE(...)` constructors, or map a domain error via `mapErr` first)
 * is returned as a value, which oRPC marks *inferable* so the client sees it
 * fully typed; a `Defect` rethrows its original cause, which oRPC collapses
 * to `INTERNAL_SERVER_ERROR` — a bug stays a defect, never a typed error.
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
 * import { handlerResult } from "@unthrown/orpc/server";
 *
 * const find = os
 *   .input(z.object({ id: z.string() }))
 *   .errors({ NOT_FOUND: {} })
 *   .handler(
 *     handlerResult(({ input, errors }) =>
 *       repo.findPlanet(input.id).mapErr(() => errors.NOT_FOUND()),
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
): ProcedureHandler<TCurrentContext, TInput, TOutput | TError, ORPCErrorConstructorMap<TErrorMap>> {
  return async (opts, input) => {
    const result = await handler(opts, input);
    return result.match<TOutput | TError>({
      ok: (value) => value,
      err: (error) => {
        // Unreachable through well-typed code (`TError extends AnyORPCError`);
        // a widened or raw-JS caller's non-ORPCError `Err` must not be
        // returned, or oRPC would serve it as a SUCCESSFUL output. Route it
        // to the defect path instead (same defensive rule as `matchTags`).
        if (error instanceof ORPCError) return error;
        throw error;
      },
      defect: (cause) => {
        throw cause;
      },
    });
  };
}
