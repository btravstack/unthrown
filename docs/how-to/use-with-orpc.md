# Use with oRPC

> **How-to.** [`@unthrown/orpc`](/api/orpc/) bridges [oRPC](https://orpc.dev)
> (v2) and unthrown in both directions: server handlers that _return_ a `Result`,
> and a client whose every call yields an
> [`AsyncResult`](../explanation/async-model) — with oRPC's end-to-end typed
> errors as the modeled error channel.

```sh
pnpm add @unthrown/orpc unthrown
```

oRPC's error model already agrees with the [thesis](../explanation/why-unthrown):
an error a procedure **declares** (`.errors({...})`) or **returns as a value** is
_inferable_ — typed end-to-end — while everything else collapses to
`INTERNAL_SERVER_ERROR`. That is exactly the `Err` /
[`Defect`](../explanation/the-defect-channel) split:

| unthrown     | oRPC v2                                       |
| ------------ | --------------------------------------------- |
| `Ok(value)`  | the procedure's output                        |
| `Err(error)` | a returned `ORPCError` — inferable, typed E2E |
| `Defect`     | everything else (`INTERNAL_SERVER_ERROR`)     |

Qualification happens **once, inside the bridge**: the triage decision was already
made when the procedure declared (or returned) its errors, so no per-call
`qualify` is asked of you.

::: info oRPC v2
The package targets oRPC **v2** (peer range `^2.0.0-beta`), whose
returned-`ORPCError` inference is what the server half builds on. Its majors track
oRPC's cadence, not the unthrown family's.
:::

## Server: handlers that return a `Result`

`handlerResult` adapts a `Result`-returning handler into a plain oRPC handler —
your service layer keeps speaking `Result`, and the endpoint stops needing to
unwrap it into throws:

```ts
import { P } from "unthrown";
import { handlerResult } from "@unthrown/orpc/server";
import { os } from "@orpc/server";
import * as z from "zod";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      repo
        .findPlanet(input.id)
        .mapErrCases((matcher) => matcher.with(P._, () => errors.NOT_FOUND())),
    ),
  );
```

- `Ok` becomes the procedure's output.
- `Err` is **returned as a value**; oRPC marks it inferable, so the client sees it
  fully typed. The error channel is constrained to `ORPCError` — the `mapErrCases` that
  turns a domain error into one (here `errors.NOT_FOUND()`) is the explicit triage
  point at the transport boundary.
- A `Defect` rethrows its original cause, which oRPC collapses to
  `INTERNAL_SERVER_ERROR`. A bug stays a defect — it never becomes a typed error
  your client is invited to handle.

A returned `ORPCError` needs no `.errors({...})` declaration — v2 infers it from
the handler's type:

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

The handler may be synchronous, `async`, or return an `AsyncResult` directly — an
elimination edge is exempt from the no-thenable rule (same as `match` handlers).

### The `.result()` builder extension

If you prefer a builder method over wrapping, opt into the extension — one
side-effectful import:

```ts
import { P } from "unthrown";
import "@unthrown/orpc/extensions/result";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .result(({ input, errors }) =>
    repo.findPlanet(input.id).mapErrCases((matcher) => matcher.with(P._, () => errors.NOT_FOUND())),
  );
```

It is available on every builder state and on contract-first `implement(...)`
implementers, and is runtime-identical to `.handler(handlerResult(...))`.
Everything else in the package is side-effect-free; reach for `handlerResult` when
patching a third-party prototype is unwelcome.

## Client: calls that return an `AsyncResult`

`createResultClient` wraps an oRPC client so every procedure returns an
`AsyncResult` — the mirror of oRPC's own `createSafeClient`:

```ts
import { P } from "unthrown";
import { createResultClient } from "@unthrown/orpc/client";

const rc = createResultClient(client);

const greeting = await rc.planet
  .find({ id })
  .map((planet) => `Hello, ${planet.name}!`)
  .match({
    ok: (msg) => msg,
    // the matcher branches on the ORPCError `code`, not a `_tag`
    errCases: (matcher) =>
      matcher.with({ code: "NOT_FOUND" }, () => "Hello, void!").with(P._, () => "Hello, trouble!"),
    defect: () => "Hello, bug tracker!",
  });
```

The error channel is the raw inferable `ORPCError` union, discriminated by `code`
— deliberately **not** re-wrapped into [tagged errors](./model-errors): oRPC
already ships a discriminated error type, and one concept should have one name.
Branch on `code` — in `match`'s `errCases` matcher (as above), a `switch`, or a
standalone `match`. Because these are plain `ORPCError`s rather than
`TaggedError`s, `tag(...)` doesn't apply — match on the `code` field instead.

Anything non-inferable — a network failure, an undeclared throw collapsed to
`INTERNAL_SERVER_ERROR`, a malformed response — is a `Defect`: it flows past your
error combinators and [panics at `get`](../explanation/the-defect-channel), because
it is a bug (or an outage), not an outcome your domain models.

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
per-event and terminal failures is its own design. Call those on the raw client.
:::

## End to end

Both halves compose into one error vocabulary across layers — a
[Prisma](./use-with-prisma)-backed service chains into an oRPC handler, and the
browser consumes it, all in `Result`:

```ts
import { tag } from "unthrown";

// server — the one mapErrCases is the whole edge, and it is exhaustive: a new P-code
// in the union becomes a compile error here, never a silent 500.
const createUser = os
  .input(z.object({ email: z.string() }))
  .errors({ EMAIL_TAKEN: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      db.user
        .tryCreate({ data: input })
        .mapErrCases((matcher) =>
          matcher
            .with(tag("UniqueConstraintViolation"), () => errors.EMAIL_TAKEN())
            .with(
              tag("ForeignKeyViolation"),
              tag("DriverError"),
              (e) => new ORPCError("INTERNAL_SERVER_ERROR", { cause: e }),
            ),
        ),
    ),
  );

// client
const outcome = await rc.createUser({ email });
if (outcome.isErr() && outcome.error.code === "EMAIL_TAKEN") {
  form.setError("email", "already registered");
}
```

## Where to go next

- The service layer behind it: [Use with Prisma](./use-with-prisma).
- The `Err`/`Defect` split it maps onto: [The Defect Channel](../explanation/the-defect-channel).
