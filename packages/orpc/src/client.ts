// @unthrown/orpc/client — the client half of the oRPC bridge.
//
// oRPC v2 splits failures exactly the way unthrown does: an error a procedure
// declares (`.errors({...})`) or returns as a value is *inferable* — typed
// end-to-end and recognisable at runtime via `isInferableError` — while
// everything else is collapsed to `INTERNAL_SERVER_ERROR`. The bridge maps
// that split onto the `Result` variants: inferable → `Err`, anything else →
// `Defect`. Qualification happens once, in here (Thesis #3): the triage
// decision was already made when the procedure declared (or returned) its
// errors, so no per-call `qualify` is asked of the caller.
//
// The error channel stays the raw `ORPCError` union, discriminated by `code` —
// no re-wrapping into a second error concept.

import {
  type AnyNestedClient,
  type AnyORPCError,
  type Client,
  type ClientRest,
  isInferableError,
  type PromiseWithError,
  type ThrowableError,
} from "@orpc/client";
import { type AsyncResult, fromPromise } from "unthrown";

/**
 * Lift a single oRPC call into an `AsyncResult`.
 *
 * @remarks
 * The error channel is the call's *inferable* errors — the `ORPCError`s the
 * procedure declares via `.errors({...})` or returns as values, extracted as
 * `Extract<TError, AnyORPCError>` and discriminated by `code`. Any other
 * rejection (network failure, an undeclared throw collapsed to
 * `INTERNAL_SERVER_ERROR`, a malformed response) is a `Defect`: unmodeled,
 * flowing past the error combinators, panicking at `get`.
 *
 * Accepts the promise of a client procedure call or of oRPC's server-side
 * `call(procedure, input)` — anything typed `PromiseWithError`.
 *
 * @typeParam TOutput - the procedure's output type.
 * @typeParam TError - the call's error union; only its `ORPCError` arm is
 * modeled, the rest is subtracted into the defect channel.
 * @param promise - the in-flight call to lift.
 *
 * @category Client
 *
 * @example
 * ```ts
 * import { fromCall } from "@unthrown/orpc/client";
 *
 * const planet = await fromCall(client.planet.find({ id }));
 * // planet: Result<Planet, ORPCError<"NOT_FOUND", undefined>>
 * if (planet.isErr()) planet.error.code; // "NOT_FOUND"
 * ```
 */
export function fromCall<TOutput, TError = ThrowableError>(
  promise: PromiseWithError<TOutput, TError>,
): AsyncResult<TOutput, Extract<TError, AnyORPCError>> {
  return fromPromise(promise, (cause, defect) => {
    // `isInferableError` narrows against the call's declared error union; the
    // cast re-attaches that union to the untyped rejection cause.
    const candidate = cause as TError;
    return isInferableError(candidate) ? candidate : defect(cause);
  });
}

/**
 * The type of a {@link createResultClient} client: every procedure of `T`
 * returns an `AsyncResult` instead of a throwing promise.
 *
 * @category Client
 */
export type ResultClient<T extends AnyNestedClient> =
  T extends Client<infer UContext, infer UInput, infer UOutput, infer UError>
    ? (...rest: ClientRest<UContext, UInput>) => AsyncResult<UOutput, Extract<UError, AnyORPCError>>
    : { [K in keyof T]: T[K] extends AnyNestedClient ? ResultClient<T[K]> : never };

/**
 * Wrap an oRPC client so every procedure call returns an
 * `AsyncResult` — {@link fromCall} applied to the whole router.
 *
 * @remarks
 * The mirror of oRPC's own `createSafeClient`, producing `AsyncResult`s
 * instead of `SafeResult` tuples: inferable errors land in the error channel
 * (the raw `ORPCError` union, discriminated by `code`), everything else is a
 * `Defect`. Call options (`signal`, `context`, `lastEventId`) pass through
 * untouched.
 *
 * Event-iterator (streaming) procedures are out of scope: a stream does not
 * collapse to one `Result`. Keep calling those on the raw client.
 *
 * @param client - the oRPC client (or any nested router segment) to wrap.
 *
 * @category Client
 *
 * @example
 * ```ts
 * import { createResultClient } from "@unthrown/orpc/client";
 *
 * const rc = createResultClient(client);
 *
 * const greeting = await rc.planet
 *   .find({ id })
 *   .map((planet) => `Hello, ${planet.name}!`)
 *   .match({
 *     ok: (msg) => msg,
 *     err: (e) => (e.code === "NOT_FOUND" ? "Hello, void!" : "Hello, trouble!"),
 *     defect: () => "Hello, bug tracker!",
 *   });
 * ```
 */
export function createResultClient<T extends AnyNestedClient>(client: T): ResultClient<T> {
  const target = (...args: unknown[]) => {
    const procedure = client as (...rest: unknown[]) => PromiseWithError<unknown, unknown>;
    return fromCall(procedure(...args));
  };
  const proxy = new Proxy(target, {
    get(_, prop) {
      const value = (client as Record<PropertyKey, unknown>)[prop];
      // A nested router segment (object) or procedure (function) is wrapped
      // recursively; anything else (a symbol-keyed well-known, an own field
      // of a callable client) passes through untouched.
      if ((typeof value !== "object" || value === null) && typeof value !== "function") {
        return value;
      }
      return createResultClient(value as AnyNestedClient);
    },
  });
  return proxy as ResultClient<T>;
}
