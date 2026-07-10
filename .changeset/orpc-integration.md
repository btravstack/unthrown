---
"@unthrown/orpc": minor
---

Initial release of **@unthrown/orpc** — a two-way bridge between oRPC v2 and
unthrown, built on v2's returned-`ORPCError` end-to-end inference.

**Server** (`@unthrown/orpc/server`): `handlerResult(fn)` adapts a
`Result`-returning procedure handler — `Ok` becomes the output; `Err`
(constrained to `ORPCError`) is returned as a value, which oRPC marks
_inferable_ so the client sees it fully typed; a `Defect` rethrows its cause
and collapses to `INTERNAL_SERVER_ERROR`. The opt-in
`@unthrown/orpc/extensions/result` subpath patches a `.result()` method onto
every builder state and contract-first implementers (the package's one
side-effectful entry point).

**Client** (`@unthrown/orpc/client`): `createResultClient(client)` wraps a
whole router so every call returns `AsyncResult<Output, InferableErrors>`;
`fromCall(promise)` is the one-shot form (also lifts the server-side
`call(...)`). The error channel is the raw inferable `ORPCError` union,
discriminated by `code`; everything non-inferable is a `Defect`.

Peer deps `@orpc/client` / `@orpc/server` at `^2.0.0-beta`; versioned outside
the unthrown fixed group — majors track oRPC's cadence. Event-iterator
(streaming) procedures are out of scope.
