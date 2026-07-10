# oRPC

[`@unthrown/orpc`](/api/orpc/) bridges [oRPC](https://orpc.dev) (v2) and
unthrown in both directions: procedure handlers that _return_ a
[`Result`](./core-concepts) on the server, and a client whose every call yields
an [`AsyncResult`](./async-results) — with oRPC's end-to-end typed errors as
the modeled error channel.

```sh
pnpm add @unthrown/orpc unthrown
```

oRPC is an unusually good fit for unthrown, because its error model already
agrees with the [thesis](./why-unthrown): an error a procedure **declares**
(`.errors({...})`) or **returns as a value** is _inferable_ — typed end-to-end,
recognisable at runtime — while everything else is collapsed to
`INTERNAL_SERVER_ERROR`. That is exactly the `Err` / [`Defect`](./the-defect-channel)
split:

| unthrown     | oRPC v2                                       |
| ------------ | --------------------------------------------- |
| `Ok(value)`  | the procedure's output                        |
| `Err(error)` | a returned `ORPCError` — inferable, typed E2E |
| `Defect`     | everything else (`INTERNAL_SERVER_ERROR`)     |

Qualification happens **once, inside the bridge**
([Boundaries](./boundaries)): the triage decision was already made when the
procedure declared (or returned) its errors, so no per-call `qualify` is asked
of you.

::: info oRPC v2
The package targets oRPC **v2** (in beta at the time of writing; peer range
`^2.0.0-beta`), whose returned-`ORPCError` inference is what the server half
builds on. Its majors track oRPC's cadence, not the unthrown family's.
:::

## Server: handlers that return a `Result`

`handlerResult` adapts a `Result`-returning handler into a plain oRPC handler —
your service layer keeps speaking `Result`, and the endpoint stops needing to
unwrap it into throws:

```ts
import { handlerResult } from "@unthrown/orpc/server";
import { os } from "@orpc/server";
import * as z from "zod";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      repo.findPlanet(input.id).mapErr(() => errors.NOT_FOUND()),
    ),
  );
```

- `Ok` becomes the procedure's output.
- `Err` is **returned as a value**; oRPC marks it inferable, so the client sees
  it fully typed. The error channel is constrained to `ORPCError` — the
  `mapErr` that turns a domain error into one (here `errors.NOT_FOUND()`, the
  constructor oRPC injects) is the explicit triage point at the transport
  boundary.
- A `Defect` rethrows its original cause, which oRPC collapses to
  `INTERNAL_SERVER_ERROR`. A bug stays a defect — it never becomes a typed
  error your client is invited to handle.

A returned `ORPCError` needs no `.errors({...})` declaration at all — v2 infers
it from the handler's type:

```ts
const limited = os.handler(
  handlerResult(({ input }) =>
    tooMany(input)
      ? Err(new ORPCError("RATE_LIMITED", { data: { retryAfter: 60 } }))
      : Ok("welcome"),
  ),
);
// the client's error channel: ORPCError<"RATE_LIMITED", { retryAfter: number }>
```

The handler may be synchronous, `async`, or return an `AsyncResult` directly —
an elimination edge is exempt from the no-thenable rule (same as `match`
handlers): a throw or rejection inside it cannot skip triage, because oRPC's
own boundary already treats it as the defect path.

### The `.result()` builder extension

If you prefer a builder method over wrapping, opt into the extension — one
side-effectful import (the packaging `@orpc/experimental-effect` uses for
`.effect()`):

```ts
import "@unthrown/orpc/extensions/result";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .result(({ input, errors }) => repo.findPlanet(input.id).mapErr(() => errors.NOT_FOUND()));
```

It is available on every builder state (`os`, after `.use`, `.input`,
`.output`, `.errors`) and on contract-first `implement(...)` implementers, and
is runtime-identical to `.handler(handlerResult(...))`. Everything else in the
package is side-effect-free; reach for `handlerResult` when patching a
third-party prototype is unwelcome.

## Client: calls that return an `AsyncResult`

`createResultClient` wraps an oRPC client so every procedure returns an
`AsyncResult` — the mirror of oRPC's own `createSafeClient`, producing
`Result`s instead of `[error, data, inferableError]` tuples:

```ts
import { createResultClient } from "@unthrown/orpc/client";

const rc = createResultClient(client);

const greeting = await rc.planet
  .find({ id })
  .map((planet) => `Hello, ${planet.name}!`)
  .match({
    ok: (msg) => msg,
    err: (e) => (e.code === "NOT_FOUND" ? "Hello, void!" : "Hello, trouble!"),
    defect: () => "Hello, bug tracker!",
  });
```

The error channel is the raw inferable `ORPCError` union, discriminated by
`code` — deliberately **not** re-wrapped into [tagged errors](./tagged-errors):
oRPC already ships a discriminated error type, and one concept should have one
name. Branch on `code` (a `switch`, [ts-pattern](./pattern-matching), or the
`.errors` data types); `matchTags` does not apply to this package.

Anything non-inferable — a network failure, an undeclared throw collapsed to
`INTERNAL_SERVER_ERROR`, a malformed response — is a `Defect`: it flows past
your error combinators and [panics at `get`](./the-defect-channel), because it
is a bug (or an outage), not an outcome your domain models.

`fromCall` is the one-shot form, and also lifts oRPC's server-side
`call(procedure, input)`:

```ts
import { fromCall } from "@unthrown/orpc/client";
import { call } from "@orpc/server";

const planet = await fromCall(client.planet.find({ id })); // a client call
const seeded = await fromCall(call(find, { id: "1" })); // a server-side call
```

Call options (`signal`, `context`, `lastEventId`) pass through untouched.

::: warning Streaming is out of scope
Event-iterator procedures don't collapse to one `Result` — modelling a stream's
per-event and terminal failures is its own design. Call those on the raw
client.
:::

## End to end

Both halves compose into one error vocabulary across layers — a
[Prisma](./prisma)-backed service chains into an oRPC handler, and the browser
consumes it, all in `Result`:

```ts
// server — the one mapErr is the whole edge: each domain error is either given
// a client-facing code or declared not the client's business (a 500).
const createUser = os
  .input(z.object({ email: z.string() }))
  .errors({ EMAIL_TAKEN: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      db.user
        .tryCreate({ data: input })
        .mapErr((e) =>
          e._tag === "UniqueConstraintViolation"
            ? errors.EMAIL_TAKEN()
            : new ORPCError("INTERNAL_SERVER_ERROR", { cause: e }),
        ),
    ),
  );

// client
const outcome = await rc.createUser({ email });
if (outcome.isErr() && outcome.error.code === "EMAIL_TAKEN") {
  form.setError("email", "already registered");
}
```
