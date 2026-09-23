# @unthrown/orpc

> An [oRPC](https://orpc.dev) (v2) integration for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`:
> `Result`-returning procedure handlers on the server, an `AsyncResult` client
> on the caller side — with oRPC's end-to-end typed errors as the error channel.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/use-with-orpc)** ·
[API Reference](https://btravstack.github.io/unthrown/api/orpc/)

```sh
pnpm add @unthrown/orpc unthrown
```

oRPC v2 splits failures the way unthrown does: an error a procedure **declares**
via `.errors({...})` is _defined_ — typed end-to-end — while everything else is
a `Defect`. `defined` alone decides the channel; it is not about payload
scrubbing — an undeclared `ORPCError`'s `code`/`data` still reach the client
intact, just as a Defect. oRPC only scrubs an opaque thrown `Error` down to
`INTERNAL_SERVER_ERROR`. The bridge maps that split onto the `Result`
variants, in both directions:

| unthrown     | oRPC v2                                           |
| ------------ | ------------------------------------------------- |
| `Ok(value)`  | the procedure's output                            |
| `Err(error)` | a thrown, declared `ORPCError` — typed E2E        |
| `Defect`     | everything else (undeclared `ORPCError` included) |

The error channel stays the raw `ORPCError` union, discriminated by `code` — no
second error concept in between.

## Server — `handlerResult` / `.result()`

```ts
import { P } from "unthrown";
import { handlerResult } from "@unthrown/orpc/server";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      repo
        .findPlanet(input.id)
        .mapErrCases((matcher) =>
          matcher.with(P.tag("NotFound"), () => errors.NOT_FOUND()),
        ),
    ),
  );
```

`Ok` becomes the output; `Err` (constrained to `ORPCError` — the `mapErrCases` at the
endpoint is the explicit triage point) is thrown, so a code declared in
`.errors({...})` reaches the client defined and typed; a `Defect` rethrows its
cause and stays a defect — an `ORPCError` cause is wrapped first, so a
downstream error qualified as a defect answers `INTERNAL_SERVER_ERROR`, never
its own declared code. A handler may also be written as `.result(...)`
directly, by opting into the builder extension:

```ts
import { P } from "unthrown";
import "@unthrown/orpc/extensions/result";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .result(({ input, errors }) =>
    repo
      .findPlanet(input.id)
      .mapErrCases((matcher) =>
        matcher.with(P.tag("NotFound"), () => errors.NOT_FOUND()),
      ),
  );
```

(The import patches oRPC's builders — a deliberate import-time side effect, and
the only entry point of this package that has one. Works on every builder state
and on contract-first `implement(...)` implementers.)

## Client — `createResultClient` / `fromCall`

```ts
import { createResultClient } from "@unthrown/orpc/client";

const rc = createResultClient(client, { contract });

const greeting = await rc.planet
  .find({ id })
  .map((planet) => `Hello, ${planet.name}!`)
  .match({
    ok: (msg) => msg,
    // `errCases` takes the exhaustive matcher — one arm per `code` the
    // procedure declares (here `.errors({ NOT_FOUND: {}, CONFLICT: {} })`):
    errCases: (matcher) =>
      matcher
        .with({ code: "NOT_FOUND" }, () => "Hello, void!")
        .with({ code: "CONFLICT" }, () => "Hello, again!"),
    defect: () => "Hello, bug tracker!",
  });
```

Every procedure returns `AsyncResult<Output, DefinedErrors>`: the defined
`ORPCError`s land in the error channel, anything else (network failure, an
undeclared throw, a malformed response) is a `Defect`. `fromCall(promise)` is
the one-shot form — it also lifts oRPC's server-side `call(procedure, input)`.

Pass the `contract` the client was built from whenever client and server deploy
independently. Every rejection is then reconciled against the client's own
`.errors({...})` (oRPC's `reconcileORPCError`: a declared code, with `data`
passing its schema), so a code only a newer server declares is a `Defect`
instead of an `Err` your `errCases` has no arm for. Without it, the `defined`
flag the server sent decides.

Event-iterator (streaming) procedures are out of scope: a stream does not
collapse to one `Result`. Keep calling those on the raw client.

## Versioning

`@unthrown/orpc` targets **oRPC v2** (peers `@orpc/client` and `@orpc/contract`,
optional `@orpc/server`, range `^2.0.0-beta.34` — beta.34
removed the returned-error/inferable-flag mechanism this bridge previously
relied on, so earlier betas are unsupported) and its majors track oRPC's
cadence, not the unthrown family's.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
