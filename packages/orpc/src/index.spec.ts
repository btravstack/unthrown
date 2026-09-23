// End-to-end tests against REAL oRPC machinery, no HTTP server: procedures run
// through `createRouterClient` (the in-process client, sharing the exact
// `createProcedureClient` pipeline the transports use), and one block loops a
// `RPCLink` client back into a `RPCHandler` via a custom `fetch` — proving the
// three-way mapping survives genuine JSON serialization, where a defect is
// collapsed to `INTERNAL_SERVER_ERROR` instead of surfacing raw.
//
// The load-bearing mappings, each provoked for real:
//   Ok        → the procedure's output              → `Ok` on the client
//   Err       → a THROWN, DECLARED ORPCError        → typed `Err` on the client
//   Defect    → a rethrown cause, or an undeclared
//               ORPCError thrown with no matching
//               `.errors({...})` entry              → `Defect` on the client

import { createORPCClient, isDefinedError, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { oc, type RouterContractClient, type Schema } from "@orpc/contract";
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
import { type AsyncResult, Err, fromPromise, fromSafePromise, Ok, type Result } from "unthrown";
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

// An ORPCError thrown with no matching `.errors({...})` entry — post
// beta.34, oRPC has no returned-error channel and no way to infer an
// undeclared code as defined, so this always lands as a Defect.
const undeclared = os
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

const router = { planet: { find }, undeclared, buggy, throwing, asyncOk, liftedOk };
const client = createRouterClient(router);
const rc = createResultClient(client);

describe("handlerResult over the in-process client", () => {
  test("Ok becomes the procedure output", async () => {
    await expect(rc.planet.find({ id: 1 })).toBeOkWith({ name: "Mars" });
  });

  test("Err(errors.X()) surfaces as a typed, defined Err", async () => {
    const result = await rc.planet.find({ id: 999 });
    expect(result).toBeErr();
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ORPCError);
      expect(result.error.code).toBe("NOT_FOUND");
      expect(isDefinedError(result.error)).toBe(true);
    }
  });

  test("an undeclared ORPCError (no `.errors()` entry) is a Defect, cause preserved", async () => {
    const result = await rc.undeclared({ limit: 0 });
    expect(result).toBeDefect();
    if (result.isDefect()) {
      expect(result.cause).toBeInstanceOf(ORPCError);
      const cause = result.cause as ORPCError<"RATE_LIMITED", { retryAfter: number }>;
      expect(cause.code).toBe("RATE_LIMITED");
      expect(cause.data).toEqual({ retryAfter: 60 });
      expect(isDefinedError(cause)).toBe(false);
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

  test("a Defect whose cause is a declared ORPCError never reaches the client as an Err", async () => {
    // A downstream oRPC call qualified as a defect: raw, the cause would be
    // reconciled against THIS procedure's `.errors({...})` and its declared
    // code would flip to defined.
    const leaky = os
      .errors({ NOT_FOUND: {} })
      .handler(
        handlerResult(() =>
          fromPromise(Promise.reject(new ORPCError("NOT_FOUND")), (cause, defect) => defect(cause)),
        ),
      );
    const result = await fromCall(call(leaky, undefined));
    expect(result).toBeDefect();
    if (result.isDefect()) {
      expect(isDefinedError(result.cause)).toBe(false);
      expect((result.cause as Error).cause).toBeInstanceOf(ORPCError);
    }
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

  test("never exposes a callable `then` — the wrapped client is not thenable", async () => {
    // The `get` trap wraps every object/function property, so on a client whose
    // own proxy answers ANY key with a nested procedure, `rc.then` would be
    // callable and `await rc` would invoke it. oRPC guards `then` today, but
    // that is its invariant to change, not ours to lean on.
    const asRecord = rc as unknown as Record<string, unknown>;
    expect(asRecord["then"]).toBeUndefined();
    expect((rc.planet as unknown as Record<string, unknown>)["then"]).toBeUndefined();
    // …so awaiting it resolves to the client itself rather than hanging.
    await expect(Promise.resolve(rc as unknown as Promise<unknown>)).resolves.toBe(rc);
  });

  test("a nested segment is wrapped once and reused", () => {
    expect(rc.planet).toBe(rc.planet);
    expect(rc.planet.find).toBe(rc.planet.find);
  });

  test("oRPC's reserved keys are answered by the target, never wrapped as procedures", () => {
    expect(typeof rc.planet.toString()).toBe("string");
    expect((rc.planet as unknown as Record<string, unknown>)["bind"]).toBe(Function.prototype.bind);
  });

  test("results chain with combinators", async () => {
    const greeting = await rc.planet
      .find({ id: 1 })
      .map((planet) => `Hello, ${planet.name}!`)
      .match({
        ok: (msg) => msg,
        // `find` declares exactly one error, so the case is nameable — the
        // client's `E` is discriminated by `code`, not by `_tag`.
        errCases: (matcher) => matcher.with({ code: "NOT_FOUND" }, () => "not found"),
        defect: () => "bug",
      });
    expect(greeting).toBe("Hello, Mars!");
  });

  test("non-wrappable property values pass through the proxy untouched", () => {
    const weird = Object.assign(() => Promise.resolve(1), { version: 3 });
    const wrapped = createResultClient(weird as never) as unknown as { version: number };
    expect(wrapped.version).toBe(3);
  });

  test("a synchronously-throwing callable yields a Defect, not a raw throw", async () => {
    // Out of contract for a real oRPC client (a procedure call returns a
    // promise), but reachable through the untyped proxy: the call runs inside
    // the fromPromise thunk boundary, so the throw must land in the Defect
    // channel instead of escaping the AsyncResult raw.
    const boom = new Error("sync boom");
    const throwing = createResultClient((() => {
      throw boom;
    }) as never) as unknown as () => AsyncResult<unknown, never>;
    const result = await throwing();
    expect(result).toBeDefect();
    if (result.isDefect()) expect(result.cause).toBe(boom);
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
  // `defined` flag on the wire — without opening a socket.
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

  test("an undeclared thrown error survives serialization but stays a Defect", async () => {
    const result = await wire.undeclared({ limit: 0 });
    expect(result).toBeDefect();
    if (result.isDefect()) {
      // The wire preserves the real code and data — oRPC does not scrub an
      // ORPCError's payload the way it does an opaque thrown `Error` — but
      // with no matching `.errors({...})` entry it is never `defined`, so
      // this bridge routes it to the defect channel regardless.
      expect(result.cause).toBeInstanceOf(ORPCError);
      const cause = result.cause as ORPCError<"RATE_LIMITED", { retryAfter: number }>;
      expect(cause.code).toBe("RATE_LIMITED");
      expect(cause.data).toEqual({ retryAfter: 60 });
      expect(isDefinedError(cause)).toBe(false);
    }
  });

  test("a defect is collapsed to INTERNAL_SERVER_ERROR and stays a Defect", async () => {
    const result = await wire.buggy();
    expect(result).toBeDefect();
    if (result.isDefect()) {
      // Over the wire the raw cause must NOT leak; oRPC collapses it.
      expect(result.cause).toBeInstanceOf(ORPCError);
      expect((result.cause as ORPCError<string, unknown>).code).toBe("INTERNAL_SERVER_ERROR");
      expect(isDefinedError(result.cause)).toBe(false);
    }
  });
});

describe("createResultClient with the client's own contract", () => {
  // A rolling deploy: the client compiled against `before`, the server already
  // serves `after`, which declares a new code and loosens NOT_FOUND's data.
  const idSchema: Schema<{ id: number }, { id: number }> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) =>
        typeof (value as { id?: unknown } | undefined)?.id === "number"
          ? { value: value as { id: number } }
          : { issues: [{ message: "id must be a number" }] },
    },
  };
  const lookupInput = type<{ answer: "missing" | "gone" | "bad-data" }>();
  const before = { lookup: oc.input(lookupInput).errors({ NOT_FOUND: { data: idSchema } }) };
  const after = {
    lookup: oc.input(lookupInput).errors({ NOT_FOUND: { data: type<unknown>() }, GONE: {} }),
  };

  const server = implement(after);
  const handler = new RPCHandler(
    server.router({
      lookup: server.lookup.result(({ input, errors }) =>
        Err(
          input.answer === "gone"
            ? errors.GONE()
            : errors.NOT_FOUND({ data: input.answer === "missing" ? { id: 1 } : { id: "1" } }),
        ),
      ),
    }),
  );
  const client = createORPCClient<RouterContractClient<typeof before>>(
    new RPCLink({
      url: "/rpc",
      fetch: async (url, init) => {
        const request = new Request(new URL(url, "http://in-memory.test"), init);
        const { response } = await handler.handle(request, { prefix: "/rpc" });
        return response ?? new Response("no procedure matched", { status: 404 });
      },
    }),
  );

  test("a code the client declares, with valid data, is an Err", async () => {
    const result = await createResultClient(client, { contract: before }).lookup({
      answer: "missing",
    });
    expect(result).toBeErr();
    if (result.isErr()) expect(result.error.data).toEqual({ id: 1 });
  });

  test("a code only the server declares is a Defect", async () => {
    const result = await createResultClient(client, { contract: before }).lookup({
      answer: "gone",
    });
    expect(result).toBeDefect();
    if (result.isDefect()) {
      expect((result.cause as ORPCError<string, unknown>).code).toBe("GONE");
    }
  });

  test("declared-code data failing the client's schema is a Defect", async () => {
    const result = await createResultClient(client, { contract: before }).lookup({
      answer: "bad-data",
    });
    expect(result).toBeDefect();
  });

  test("without the contract, the server's `defined` flag decides", async () => {
    // The unguarded default: `GONE` lands in an `E` typed as NOT_FOUND only.
    const result = await createResultClient(client).lookup({ answer: "gone" });
    expect(result).toBeErr();
  });
});
