# @unthrown/orpc

> An [oRPC](https://orpc.dev) (v2) integration for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`:
> `Result`-returning procedure handlers on the server, an `AsyncResult` client
> on the caller side — with oRPC's end-to-end typed errors as the error channel.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/orpc)** ·
[API Reference](https://btravstack.github.io/unthrown/api/orpc/)

```sh
pnpm add @unthrown/orpc unthrown
```

oRPC v2 splits failures the way unthrown does: an error a procedure **declares**
(`.errors({...})`) or **returns as a value** is _inferable_ — typed end-to-end —
while everything else collapses to `INTERNAL_SERVER_ERROR`. The bridge maps that
split onto the `Result` variants, in both directions:

| unthrown     | oRPC v2                                       |
| ------------ | --------------------------------------------- |
| `Ok(value)`  | the procedure's output                        |
| `Err(error)` | a returned `ORPCError` — inferable, typed E2E |
| `Defect`     | everything else (`INTERNAL_SERVER_ERROR`)     |

The error channel stays the raw `ORPCError` union, discriminated by `code` — no
second error concept in between.

## Server — `handlerResult` / `.result()`

```ts
import { handlerResult } from "@unthrown/orpc/server";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      repo.findPlanet(input.id).mapErr(() => errors.NOT_FOUND()),
    ),
  );
```

`Ok` becomes the output; `Err` (constrained to `ORPCError` — the `mapErr` at the
endpoint is the explicit triage point) is returned as a value and oRPC marks it
inferable; a `Defect` rethrows its cause and stays a defect. A handler may also
be written as `.result(...)` directly, by opting into the builder extension:

```ts
import "@unthrown/orpc/extensions/result";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .result(({ input, errors }) => repo.findPlanet(input.id).mapErr(() => errors.NOT_FOUND()));
```

(The import patches oRPC's builders — a deliberate import-time side effect, and
the only entry point of this package that has one. Works on every builder state
and on contract-first `implement(...)` implementers.)

## Client — `createResultClient` / `fromCall`

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

Every procedure returns `AsyncResult<Output, InferableErrors>`: the inferable
`ORPCError`s land in the error channel, anything else (network failure, an
undeclared throw, a malformed response) is a `Defect`. `fromCall(promise)` is
the one-shot form — it also lifts oRPC's server-side `call(procedure, input)`.

Event-iterator (streaming) procedures are out of scope: a stream does not
collapse to one `Result`. Keep calling those on the raw client.

## Versioning

`@unthrown/orpc` targets **oRPC v2** (peer range `^2.0.0-beta` while v2 is in
beta) and its majors track oRPC's cadence, not the unthrown family's.

## License

[MIT](./LICENSE)
