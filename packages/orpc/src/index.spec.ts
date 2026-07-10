// End-to-end tests against REAL oRPC machinery, no HTTP server: procedures run
// through `createRouterClient` (the in-process client, sharing the exact
// `createProcedureClient` pipeline the transports use), and one block loops a
// `RPCLink` client back into a `RPCHandler` via a custom `fetch` — proving the
// three-way mapping survives genuine JSON serialization, where a defect is
// collapsed to `INTERNAL_SERVER_ERROR` instead of surfacing raw.
//
// The load-bearing mappings, each provoked for real:
//   Ok        → the procedure's output           → `Ok` on the client
//   Err       → a RETURNED ORPCError (inferable) → typed `Err` on the client
//   Defect    → a rethrown cause                 → `Defect` on the client

import { createORPCClient, isInferableError, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { oc } from "@orpc/contract";
import {
  type AnyORPCError,
  call,
  createRouterClient,
  implement,
  os,
  type RouterClient,
  type,
} from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import "@unthrown/vitest";
import { Err, fromSafePromise, Ok, type Result } from "unthrown";
import { describe, expect, test } from "vitest";

import { createResultClient, fromCall } from "./client.js";
import "./extensions/result.js";
import { handlerResult } from "./server.js";

// --- fixture router, one procedure per mapping under test ---------------------

const find = os
  .input(type<{ id: number }>())
  .errors({ NOT_FOUND: { message: "no such planet" } })
  .handler(
    handlerResult(({ input, errors }) =>
      input.id === 1 ? Ok({ name: "Mars" }) : Err(errors.NOT_FOUND()),
    ),
  );

// An error RETURNED as a value without any `.errors({...})` declaration — the
// v2 path this whole design leans on.
const returned = os
  .input(type<{ limit: number }>())
  .handler(
    handlerResult(({ input }) =>
      input.limit > 0
        ? Ok(input.limit)
        : Err(new ORPCError("RATE_LIMITED", { data: { retryAfter: 60 } })),
    ),
  );

// A defect minted INSIDE a pipeline (a throwing combinator callback)…
const buggy = os.handler(
  handlerResult(() =>
    Ok(1).map(() => {
      throw new Error("combinator boom");
    }),
  ),
);

// …and a handler that itself throws before producing a Result.
const throwing = os.handler(
  handlerResult((): Result<number, never> => {
    throw new Error("handler boom");
  }),
);

const asyncOk = os.handler(handlerResult(async () => Ok("async")));
const liftedOk = os.handler(handlerResult(() => fromSafePromise(Promise.resolve(42))));

const router = { planet: { find }, returned, buggy, throwing, asyncOk, liftedOk };
const client = createRouterClient(router);
const rc = createResultClient(client);

describe("handlerResult over the in-process client", () => {
  test("Ok becomes the procedure output", async () => {
    await expect(rc.planet.find({ id: 1 })).toBeOkWith({ name: "Mars" });
  });

  test("Err(errors.X()) surfaces as a typed, inferable Err", async () => {
    const result = await rc.planet.find({ id: 999 });
    expect(result).toBeErr();
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ORPCError);
      expect(result.error.code).toBe("NOT_FOUND");
      expect(isInferableError(result.error)).toBe(true);
    }
  });

  test("a returned, undeclared ORPCError is inferable too — data preserved", async () => {
    const result = await rc.returned({ limit: 0 });
    expect(result).toBeErr();
    if (result.isErr()) {
      expect(result.error.code).toBe("RATE_LIMITED");
      expect(result.error.data).toEqual({ retryAfter: 60 });
    }
  });

  test("a defect minted in a combinator stays a Defect, cause preserved", async () => {
    const result = await rc.buggy();
    expect(result).toBeDefect();
    if (result.isDefect()) {
      expect(result.cause).toBeInstanceOf(Error);
      expect((result.cause as Error).message).toBe("combinator boom");
    }
  });

  test("a throwing handler callback stays a defect", async () => {
    const result = await rc.throwing();
    expect(result).toBeDefect();
    if (result.isDefect()) expect((result.cause as Error).message).toBe("handler boom");
  });

  test("the handler may be async (edge elimination) or return an AsyncResult", async () => {
    await expect(rc.asyncOk()).toBeOkWith("async");
    await expect(rc.liftedOk()).toBeOkWith(42);
  });

  test("a non-ORPCError Err smuggled past the types routes to the defect path", async () => {
    // Through well-typed code this is unreachable (`TError extends
    // AnyORPCError`); a widened caller must not have its error served as a
    // SUCCESSFUL output, so it panics instead.
    const smuggler = os.handler(handlerResult(() => Err("nope" as unknown as AnyORPCError)));
    const result = await fromCall(call(smuggler, undefined));
    expect(result).toBeDefect();
    if (result.isDefect()) expect(result.cause).toBe("nope");
  });
});

describe("the .result() builder extension", () => {
  test("plain builder (no schema)", async () => {
    const hello = os.result(() => Ok("hello"));
    await expect(fromCall(call(hello, undefined))).toBeOkWith("hello");
  });

  test("with middlewares (context flows through)", async () => {
    const mw = os.$context<{ user: string }>().middleware(({ context, next }) => {
      return next({ context: { role: context.user === "ada" ? "admin" : "guest" } });
    });
    const who = os
      .$context<{ user: string }>()
      .use(mw)
      .result(({ context }) => Ok(`${context.user}:${context.role}`));
    await expect(fromCall(call(who, undefined, { context: { user: "ada" } }))).toBeOkWith(
      "ada:admin",
    );
  });

  test("with input schema", async () => {
    const double = os.input(type<{ n: number }>()).result(({ input }) => Ok(input.n * 2));
    await expect(fromCall(call(double, { n: 21 }))).toBeOkWith(42);
  });

  test("with output schema (and with both)", async () => {
    const shout = os.output(type<string>()).result(() => Ok("LOUD"));
    await expect(fromCall(call(shout, undefined))).toBeOkWith("LOUD");

    const echo = os
      .input(type<{ msg: string }>())
      .output(type<string>())
      .result(({ input }) => Ok(input.msg));
    await expect(fromCall(call(echo, { msg: "hi" }))).toBeOkWith("hi");
  });

  test("errors + Err on the extension path", async () => {
    const gated = os
      .errors({ FORBIDDEN: {} })
      .input(type<{ key: string }>())
      .result(({ input, errors }) => (input.key === "sesame" ? Ok("in") : Err(errors.FORBIDDEN())));
    await expect(fromCall(call(gated, { key: "sesame" }))).toBeOkWith("in");

    const denied = await fromCall(call(gated, { key: "wrong" }));
    expect(denied).toBeErr();
    if (denied.isErr()) expect(denied.error.code).toBe("FORBIDDEN");
  });

  test("contract-first implementer", async () => {
    const contract = oc
      .input(type<{ id: number }>())
      .output(type<string>())
      .errors({ NOT_FOUND: {} });
    const impl = implement(contract).result(({ input, errors }) =>
      input.id === 1 ? Ok("Mars") : Err(errors.NOT_FOUND()),
    );
    await expect(fromCall(call(impl, { id: 1 }))).toBeOkWith("Mars");

    const missing = await fromCall(call(impl, { id: 2 }));
    expect(missing).toBeErr();
    if (missing.isErr()) expect(missing.error.code).toBe("NOT_FOUND");
  });
});

describe("createResultClient", () => {
  test("wraps nested router segments recursively", async () => {
    const nested = createResultClient(client.planet);
    await expect(nested.find({ id: 1 })).toBeOkWith({ name: "Mars" });
  });

  test("results chain with combinators", async () => {
    const greeting = await rc.planet
      .find({ id: 1 })
      .map((planet) => `Hello, ${planet.name}!`)
      .match({
        ok: (msg) => msg,
        err: () => "not found",
        defect: () => "bug",
      });
    expect(greeting).toBe("Hello, Mars!");
  });

  test("non-wrappable property values pass through the proxy untouched", () => {
    const weird = Object.assign(() => Promise.resolve(1), { version: 3 });
    const wrapped = createResultClient(weird as never) as unknown as { version: number };
    expect(wrapped.version).toBe(3);
  });

  test("call options thread through to the handler (signal observed)", async () => {
    const probe = os.result(({ signal }) => Ok(signal?.aborted ?? false));
    const probeClient = createResultClient(createRouterClient({ probe }));
    const controller = new AbortController();
    controller.abort();
    await expect(probeClient.probe(undefined, { signal: controller.signal })).toBeOkWith(true);
    await expect(probeClient.probe(undefined)).toBeOkWith(false);
  });
});

describe("through a real serialization round-trip (RPCHandler ↔ RPCLink)", () => {
  // The link's `fetch` loops straight back into the handler: a genuine
  // request/response cycle — JSON serialization, error collapsing, the
  // `inferable` flag on the wire — without opening a socket.
  const handler = new RPCHandler(router);
  const link = new RPCLink({
    url: "/rpc",
    fetch: async (url, init) => {
      const request = new Request(new URL(url, "http://in-memory.test"), init);
      const { response } = await handler.handle(request, { prefix: "/rpc" });
      return response ?? new Response("no procedure matched", { status: 404 });
    },
  });
  const wire = createResultClient(createORPCClient<RouterClient<typeof router>>(link));

  test("Ok round-trips", async () => {
    await expect(wire.planet.find({ id: 1 })).toBeOkWith({ name: "Mars" });
  });

  test("a declared Err survives serialization as a typed Err", async () => {
    const result = await wire.planet.find({ id: 999 });
    expect(result).toBeErr();
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ORPCError);
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("no such planet");
    }
  });

  test("a returned, undeclared Err survives serialization — data intact", async () => {
    const result = await wire.returned({ limit: 0 });
    expect(result).toBeErr();
    if (result.isErr()) expect(result.error.data).toEqual({ retryAfter: 60 });
  });

  test("a defect is collapsed to INTERNAL_SERVER_ERROR and stays a Defect", async () => {
    const result = await wire.buggy();
    expect(result).toBeDefect();
    if (result.isDefect()) {
      // Over the wire the raw cause must NOT leak; oRPC collapses it.
      expect(result.cause).toBeInstanceOf(ORPCError);
      expect((result.cause as ORPCError<string, unknown>).code).toBe("INTERNAL_SERVER_ERROR");
      expect(isInferableError(result.cause)).toBe(false);
    }
  });
});
