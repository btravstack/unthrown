// @unthrown/orpc/client — the client half of the oRPC bridge.
//
// oRPC v2 splits failures exactly the way unthrown does: an error whose code
// is declared in the procedure's `.errors({...})` map is *defined* — typed
// end-to-end and recognisable at runtime via `isDefinedError` (`error
// instanceof ORPCError && error.defined`) — while everything else is a
// `Defect`, whether or not oRPC scrubbed its payload (an opaque thrown
// `Error` collapses to `INTERNAL_SERVER_ERROR`; an undeclared `ORPCError`
// keeps its real `code`/`data` but is still never `defined`). The bridge
// maps that split onto the `Result` variants: defined → `Err`, anything
// else → `Defect`. Qualification
// happens once, in here (Thesis #3): the triage decision was already made
// when the procedure declared its errors, so no per-call `qualify` is asked
// of the caller.
//
// Do NOT widen the predicate to `cause instanceof ORPCError`: an undeclared
// 500 and a malformed-response error are both `ORPCError`s with
// `defined: false`, and widening would put those unmodeled failures in the
// error channel instead of the defect channel.
//
// The error channel stays the raw `ORPCError` union, discriminated by `code` —
// no re-wrapping into a second error concept.
//
// Whose `defined` decides? By default the wire's: an oRPC server reconciles a
// thrown `ORPCError` against ITS contract before sending it. Across a rolling
// deploy that contract can be newer than the client's, so a code the client
// never declared would arrive `defined` and land in an `E` that has no arm for
// it. Handing `createResultClient` the client's own contract re-reconciles
// every rejection against it (`reconcileORPCError`: declared code AND `data`
// passing its schema), so the channel follows the types the caller compiled
// against, whatever server answered.

import {
  type AnyNestedClient,
  type AnyORPCError,
  type Client,
  type ClientRest,
  isDefinedError,
  ORPCError,
  type PromiseWithError,
  RECURSIVE_CLIENT_UNWRAP_KEYS,
  type ThrowableError,
} from "@orpc/client";
import {
  getProcedureContractOrThrow,
  reconcileORPCError,
  type RouterContract,
} from "@orpc/contract";
import { type AsyncResult, fromPromise } from "unthrown";

/**
 * Lift a single oRPC call into an `AsyncResult`.
 *
 * @remarks
 * The error channel is the call's *defined* errors — the `ORPCError`s whose
 * `code` the procedure declares via `.errors({...})`, extracted as
 * `Extract<TError, AnyORPCError>` and discriminated by `code`. Any other
 * rejection (network failure, an undeclared `ORPCError`, an opaque throw
 * collapsed to `INTERNAL_SERVER_ERROR`, a malformed response) is a `Defect`:
 * unmodeled, flowing past the error combinators, panicking at `get`.
 *
 * Accepts the promise of a client procedure call or of oRPC's server-side
 * `call(procedure, input)` — anything typed `PromiseWithError`.
 *
 * `fromCall` has no contract to check against: the `defined` flag the server
 * sent decides the channel, and `error.data` is trusted, **not validated**.
 * Against a server you do not fully trust, prefer
 * {@link createResultClient} with its `contract` option.
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
  return liftCall(promise);
}

// The shared boundary behind `fromCall` and the proxy client: `fromPromise`
// with the defined-error triage. The thunk form matters for the proxy — the
// wrapped callable runs INSIDE the boundary, so even a synchronous throw lands
// in the Defect channel instead of escaping raw.
function liftCall<TOutput, TError>(
  promise: PromiseWithError<TOutput, TError> | (() => PromiseWithError<TOutput, TError>),
): AsyncResult<TOutput, Extract<TError, AnyORPCError>> {
  // `qualify` must return the error value itself or `defect(cause)` — never a
  // `Result` — so `isDefinedError` alone decides the channel. `isDefinedError`
  // is `error instanceof ORPCError && error.defined`: do NOT widen this to
  // `cause instanceof ORPCError`, or an undeclared 500 and a
  // `MALFORMED_ORPC_RESPONSE` (both `ORPCError`s with `defined: false`) would
  // land in the error channel instead of the defect channel.
  const lifted: AsyncResult<TOutput, AnyORPCError> = fromPromise(promise, (cause, defect) =>
    isDefinedError(cause) ? cause : defect(cause),
  );
  // Re-attach the call's declared error union to the untyped rejection cause —
  // the same trust the pre-lift `cause as TError` cast expressed, applied once
  // at the boundary.
  return lifted as AsyncResult<TOutput, Extract<TError, AnyORPCError>>;
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
 * Options of {@link createResultClient}.
 *
 * @category Client
 */
export type CreateResultClientOptions = {
  /**
   * The contract the client was built from. When given, every rejected call
   * is reconciled against the procedure's own `.errors({...})` entry before
   * triage: an `Err` is then a code the client declares, with `data` that
   * passed its schema, whatever `defined` flag the server sent.
   *
   * Recommended whenever the server is not fully trusted: without it, the
   * server's `defined` flag decides and `error.data` reaches `E` **unvalidated**
   * — typed as the declared schema's output, but never checked against it.
   */
  contract?: RouterContract;
};

/**
 * Wrap an oRPC client so every procedure call returns an
 * `AsyncResult` — {@link fromCall} applied to the whole router.
 *
 * @remarks
 * The mirror of oRPC's own `createSafeClient`, producing `AsyncResult`s
 * instead of `SafeResult` tuples: defined errors land in the error channel
 * (the raw `ORPCError` union, discriminated by `code`), everything else is a
 * `Defect`. Call options (`signal`, `context`, `lastEventId`) pass through
 * untouched.
 *
 * Pass the client's `contract` whenever the server is not fully trusted or
 * deploys independently: the error channel is then decided by the contract
 * the caller compiled against, not by the server's, and `error.data` is
 * validated against its schema (see {@link CreateResultClientOptions.contract}).
 * Without it, `data` is trusted as sent.
 *
 * Event-iterator (streaming) procedures are out of scope: a stream does not
 * collapse to one `Result`. Keep calling those on the raw client.
 *
 * @param client - the oRPC client (or any nested router segment) to wrap.
 * @param options - see {@link CreateResultClientOptions}.
 *
 * @category Client
 *
 * @example
 * ```ts
 * import { createResultClient } from "@unthrown/orpc/client";
 *
 * const rc = createResultClient(client, { contract });
 *
 * const greeting = await rc.planet
 *   .find({ id })
 *   .map((planet) => `Hello, ${planet.name}!`)
 *   .match({
 *     ok: (msg) => msg,
 *     // the `errCases` handler matches the error exhaustively: one arm per
 *     // `code` the procedure declares — no catch-all to absorb a new one
 *     errCases: (matcher) =>
 *       matcher
 *         .with({ code: "NOT_FOUND" }, () => "Hello, void!")
 *         .with({ code: "CONFLICT" }, () => "Hello, again!"),
 *     defect: () => "Hello, bug tracker!",
 *   });
 * ```
 */
export function createResultClient<T extends AnyNestedClient>(
  client: T,
  options: CreateResultClientOptions = {},
): ResultClient<T> {
  return wrapClient(client, options.contract, []) as ResultClient<T>;
}

function wrapClient(
  client: AnyNestedClient,
  contract: RouterContract | undefined,
  path: readonly string[],
): unknown {
  const procedure = client as (...rest: unknown[]) => PromiseWithError<unknown, unknown>;
  const reconcile = async (cause: unknown): Promise<never> => {
    if (contract === undefined || !(cause instanceof ORPCError)) throw cause;
    // The contract lookup runs only on a rejection, inside the boundary: a
    // path the contract does not know surfaces as a Defect, never a throw —
    // and the Defect keeps the rejection being reconciled, aggregated after
    // the lookup's own failure (unthrown's observer-throw convention), rather
    // than letting the lookup's TypeError replace it.
    let reconciled: unknown;
    try {
      reconciled = await reconcileORPCError(
        getProcedureContractOrThrow(contract, [...path])["~orpc"].errorMap,
        cause,
      );
    } catch (failure) {
      throw new AggregateError(
        [failure, cause],
        "@unthrown/orpc: reconciling a rejection against the client contract failed; errors[0] is that failure, errors[1] the original rejection",
      );
    }
    throw reconciled;
  };
  // The call is passed as a THUNK: a callable that throws synchronously (out
  // of contract for a real oRPC client, but reachable through the untyped
  // proxy) becomes a Defect instead of escaping as a raw throw.
  const target = (...args: unknown[]) =>
    liftCall(() => procedure(...args).catch(reconcile) as PromiseWithError<unknown, unknown>);
  const cache = new Map<string, unknown>();
  return new Proxy(target, {
    get(_, prop) {
      // oRPC's own reserved keys (`then`, `bind`, `call`, `apply`, `toString`,
      // `valueOf`, `toJSON`) are answered by the function target, never
      // wrapped: a wrapped `then` would make `await rc` invoke a procedure,
      // and a wrapped `toString` would return an `AsyncResult`.
      if (typeof prop !== "string" || RECURSIVE_CLIENT_UNWRAP_KEYS.has(prop)) {
        return Reflect.get(target, prop);
      }
      if (cache.has(prop)) return cache.get(prop);
      const value = (client as Record<string, unknown>)[prop];
      // A nested router segment (object) or procedure (function) is wrapped
      // recursively; anything else (an own field of a callable client) passes
      // through untouched.
      if ((typeof value !== "object" || value === null) && typeof value !== "function") {
        return value;
      }
      const wrapped = wrapClient(value as AnyNestedClient, contract, [...path, prop]);
      cache.set(prop, wrapped);
      return wrapped;
    },
  });
}
