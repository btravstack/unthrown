// Type-level tests, checked by the package's regular `tsc --noEmit` (the file
// has no runtime — nothing imports it). They guard the claims the bridge is
// built on: the error channel is EXACTLY the inferable `ORPCError` union
// (declared via `.errors` or returned as a value) with everything else
// subtracted into the defect channel, that inference survives
// `.handler(handlerResult(...))` and every `.result()` builder state, and that
// a non-`ORPCError` error channel is rejected at compile time. Assertions
// accumulate in the exported `_Assertions` tuple (so nothing is an unused
// local); `@ts-expect-error` guards the cases that must NOT compile.

import { ORPCError } from "@orpc/client";
import { oc } from "@orpc/contract";
import { implement, os, type RouterClient, type } from "@orpc/server";
import { type AsyncErrOf, type AsyncOkOf, Err, Ok } from "unthrown";

import { createResultClient, fromCall, type ResultClient } from "./client.js";
import "./extensions/result.js";
import { handlerResult } from "./server.js";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const flip: boolean;

// --- the error channel is the inferable union, deeply typed -------------------

// Declared via `.errors({...})` …
const find = os
  .input(type<{ id: number }>())
  .errors({ NOT_FOUND: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      input.id === 1 ? Ok({ name: "Mars" }) : Err(errors.NOT_FOUND()),
    ),
  );

// …and RETURNED as a value with no declaration at all (the v2 mechanism).
const returned = os.handler(
  handlerResult(() =>
    flip ? Ok(1) : Err(new ORPCError("RATE_LIMITED", { data: { retryAfter: 60 } })),
  ),
);

declare const client: RouterClient<{ find: typeof find; returned: typeof returned }>;

const found = fromCall(client.find({ id: 1 }));
type FoundOk = Expect<Equal<AsyncOkOf<typeof found>, { name: string }>>;
type FoundErrCode = Expect<Equal<AsyncErrOf<typeof found>["code"], "NOT_FOUND">>;

const rated = fromCall(client.returned());
type RatedOk = Expect<Equal<AsyncOkOf<typeof rated>, number>>;
type RatedErr = Expect<
  Equal<AsyncErrOf<typeof rated>, ORPCError<"RATE_LIMITED", { retryAfter: number }>>
>;

// The non-ORPCError arm (ThrowableError, network failures) is subtracted into
// the defect channel — never `unknown`, never `Error`, in `E`.
type NoThrowableInE = Expect<Equal<Extract<AsyncErrOf<typeof found>, { code?: never }>, never>>;

// --- createResultClient maps the whole router ----------------------------------

const rc = createResultClient(client);
const viaClient = rc.find({ id: 1 });
type ClientMirrorsFromCall = Expect<Equal<typeof viaClient, typeof found>>;
type NestedShape = Expect<Equal<ReturnType<ResultClient<typeof client>["returned"]>, typeof rated>>;

// --- .result() infers on every builder state -----------------------------------

const viaExtension = os
  .input(type<{ id: number }>())
  .errors({ NOT_FOUND: {} })
  .result(({ input, errors }) => (input.id === 1 ? Ok({ name: "Mars" }) : Err(errors.NOT_FOUND())));
declare const extClient: RouterClient<{ find: typeof viaExtension }>;
const extFound = fromCall(extClient.find({ id: 1 }));
type ExtensionMirrorsHandlerResult = Expect<Equal<typeof extFound, typeof found>>;

// With an output schema the Ok channel is constrained to the schema's input.
const shout = os.output(type<string>()).result(() => Ok("LOUD"));
declare const shoutClient: RouterClient<{ shout: typeof shout }>;
type ShoutOk = Expect<
  Equal<AsyncOkOf<ReturnType<ResultClient<typeof shoutClient>["shout"]>>, string>
>;

// Contract-first: the implementer takes the error map from the contract.
const contract = oc.input(type<{ id: number }>()).output(type<string>()).errors({ GONE: {} });
const impl = implement(contract).result(({ input, errors }) =>
  input.id === 1 ? Ok("Mars") : Err(errors.GONE()),
);
declare const implClient: RouterClient<{ impl: typeof impl }>;
const implCall = fromCall(implClient.impl({ id: 1 }));
type ImplErrCode = Expect<Equal<AsyncErrOf<typeof implCall>["code"], "GONE">>;

// --- must-NOT-compile ----------------------------------------------------------

// @ts-expect-error — the Err channel must be ORPCError; map a domain error via `mapErr` first.
handlerResult(() => Err("domain-error"));

// @ts-expect-error — same constraint on the extension path.
os.result(() => Err(new Error("nope")));

// @ts-expect-error — the Ok channel must satisfy the output schema.
os.output(type<string>()).result(() => Ok(42));

// @ts-expect-error — the implementer's Ok channel must satisfy the contract's output.
implement(contract).result(() => Ok(42));

export type _Assertions = [
  FoundOk,
  FoundErrCode,
  RatedOk,
  RatedErr,
  NoThrowableInE,
  ClientMirrorsFromCall,
  NestedShape,
  ExtensionMirrorsHandlerResult,
  ShoutOk,
  ImplErrCode,
];
