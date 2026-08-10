// `createCaller` wires the router behind a REAL oRPC request/response cycle —
// an `RPCHandler` looped straight back into an `RPCLink` via a custom `fetch`,
// exactly the pattern `packages/orpc/src/index.spec.ts`'s
// "through a real serialization round-trip" block drives. That is deliberate,
// not incidental: oRPC only collapses an arbitrary thrown cause into a typed
// `INTERNAL_SERVER_ERROR` `ORPCError` when a call crosses this transport
// boundary. `createRouterClient`'s in-process shortcut (used inside
// `@unthrown/orpc`'s own suite for the `Ok`/`Err` mappings) skips that
// wrapping and rethrows the raw cause instead — which would leave a payment
// provider's exception looking like an uncaught `Error` to a caller instead of
// a `code`-bearing `ORPCError`. Routing every call through the same
// serialization boundary a real HTTP deployment uses is what makes the
// "outage collapses to INTERNAL_SERVER_ERROR, never an unhandled rejection"
// guarantee genuine here rather than an artifact of skipping the wire.

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { CheckoutDeps } from "@unthrown/example-checkout-domain";

import { createRouter } from "./router.js";

export { createRouter } from "./router.js";

/**
 * Build a caller for the router, in-memory: a real `RPCHandler` looped back
 * into an `RPCLink` client with no socket opened. A modelled failure arrives
 * as a rejected promise carrying the declared `ORPCError` (read `.code`); an
 * unmodelled one (a thrown exception anywhere in the pipeline) still arrives
 * as a rejection — never an unhandled rejection — but collapsed to a generic
 * `INTERNAL_SERVER_ERROR`, its original cause deliberately not leaked over
 * the wire.
 */
export const createCaller = (deps: CheckoutDeps) => {
  const router = createRouter(deps);
  const handler = new RPCHandler(router);
  const link = new RPCLink({
    url: "/rpc",
    fetch: async (url, init) => {
      const request = new Request(new URL(url, "http://in-memory.test"), init);
      const { response } = await handler.handle(request, { prefix: "/rpc" });
      return response ?? new Response("no procedure matched", { status: 404 });
    },
  });
  return createORPCClient<RouterClient<typeof router>>(link);
};
