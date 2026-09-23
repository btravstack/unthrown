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
an error whose code a procedure **declares** (`.errors({...})`) is _defined_ —
typed end-to-end — while everything else is not: an opaque thrown `Error`
collapses to `INTERNAL_SERVER_ERROR`, and an undeclared `ORPCError` keeps its
`code` and `data` on the wire but arrives undefined. That is exactly the `Err` /
[`Defect`](../explanation/the-defect-channel) split:

| unthrown     | oRPC v2                                          |
| ------------ | ------------------------------------------------ |
| `Ok(value)`  | the procedure's output                           |
| `Err(error)` | a thrown, declared `ORPCError` — typed E2E       |
| `Defect`     | everything else, undeclared `ORPCError` included |

Qualification happens **once, inside the bridge**: the triage decision was already
made when the procedure declared its errors, so no per-call
`qualify` is asked of you.

::: info oRPC v2
The package targets oRPC **v2** (peer range `^2.0.0-beta.34`), whose defined
`ORPCError` — a thrown error whose code `.errors({...})` declares — is what both
halves build on. Its majors track oRPC's cadence, not the unthrown family's.
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

// repo.findPlanet: (id: string) => AsyncResult<Planet, NotFound | Conflict | Unavailable>

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {}, CONFLICT: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      repo.findPlanet(input.id).mapErrCases(
        (matcher, defect) =>
          matcher
            .with(P.tag("NotFound"), () => errors.NOT_FOUND()) // modeled → typed for the client
            .with(P.tag("Conflict"), () => errors.CONFLICT())
            .with(P.tag("Unavailable"), (e) => defect(e.cause)), // infrastructure → defect
      ),
    ),
  );
```

Naming every case is the point: the matcher makes the transport boundary state,
per case, which failures the client is invited to handle and which are bugs. Add
a case to the repository and this endpoint stops compiling until it decides.

- `Ok` becomes the procedure's output.
- `Err` is **thrown**; oRPC marks a declared code defined, so the client sees it
  fully typed. The error channel is constrained to `ORPCError` — the `mapErrCases` that
  turns a domain error into one (here `errors.NOT_FOUND()`) is the explicit triage
  point at the transport boundary.
- A `Defect` rethrows its original cause, which oRPC collapses to
  `INTERNAL_SERVER_ERROR`. A bug stays a defect — it never becomes a typed error
  your client is invited to handle. An `ORPCError` cause (a downstream call you
  qualified as a defect) is wrapped first: raw, oRPC would match its code against
  this procedure's `.errors({...})` and serve it defined.

An `ORPCError` whose code the procedure does **not** declare is never defined: its
`code` and `data` survive on the wire, but the client files it as a `Defect`.
Declare every code a client should handle:

```ts
const limited = os
  .errors({ RATE_LIMITED: { data: z.object({ retryAfter: z.number() }) } })
  .handler(
    handlerResult(({ input, errors }) =>
      tooMany(input)
        ? Err(errors.RATE_LIMITED({ data: { retryAfter: 60 } }))
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
  .errors({ NOT_FOUND: {}, CONFLICT: {} })
  .result(({ input, errors }) =>
    repo.findPlanet(input.id).mapErrCases((matcher, defect) =>
      matcher
        .with(P.tag("NotFound"), () => errors.NOT_FOUND())
        .with(P.tag("Conflict"), () => errors.CONFLICT())
        .with(P.tag("Unavailable"), (e) => defect(e.cause)),
    ),
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
import { createResultClient } from "@unthrown/orpc/client";

const rc = createResultClient(client, { contract });

const greeting = await rc.planet
  .find({ id })
  .map((planet) => `Hello, ${planet.name}!`)
  .match({
    ok: (msg) => msg,
    // the matcher branches on the ORPCError `code`, not a `_tag`
    errCases: (matcher) =>
      matcher
        .with({ code: "NOT_FOUND" }, () => "Hello, void!")
        .with({ code: "CONFLICT" }, () => "Hello, again!"),
    defect: () => "Hello, bug tracker!",
  });
```

`E` is exactly the set of codes the procedure declares — so listing
them is finite and mechanical, and adding a code server-side lights up every
client call site.

The error channel is the raw defined `ORPCError` union, discriminated by `code`
— deliberately **not** re-wrapped into [tagged errors](./model-errors): oRPC
already ships a discriminated error type, and one concept should have one name.
Branch on `code` — in `match`'s `errCases` matcher (as above), a `switch`, or a
standalone `match`. Because these are plain `ORPCError`s rather than
`TaggedError`s, `P.tag(...)` doesn't apply — match on the `code` field instead.

Anything else — a network failure, an opaque throw collapsed to
`INTERNAL_SERVER_ERROR`, an undeclared `ORPCError` (its `code` and `data` intact),
a malformed response — is a `Defect`: it flows past your
error combinators and [panics at `get`](../explanation/the-defect-channel), because
it is a bug (or an outage), not an outcome your domain models.

### Passing the contract

An oRPC server reconciles each thrown `ORPCError` against _its_ contract before
answering, so without more the client trusts the server's version of
`.errors({...})`. During a rolling deploy that version can be newer: a code the
client never declared arrives `defined` and lands in an `E` with no arm for it.
Pass the `contract` the client was built from and every rejection is reconciled
against the client's own declaration instead (oRPC's `reconcileORPCError`: the
code must be declared **and** its `data` must pass the declared schema) — what
the client did not compile against is a `Defect`.

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
import { P } from "unthrown";

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
            .with(P.tag("UniqueConstraintViolation"), () =>
              errors.EMAIL_TAKEN(),
            )
            .with(
              P.tag("ForeignKeyViolation"),
              P.tag("Unavailable"),
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
