---
"@unthrown/prisma": patch
"@unthrown/drizzle": patch
---

Internal cleanup, no behaviour or API change.

`@unthrown/prisma`: the shared `query` helper is now generic in the channels it
returns, so each of the seventeen `try*` delegates is a one-line call whose own
declared signature supplies the payload and error types. The assertion those
seventeen `as AsyncResult<…>` casts performed now lives in one place, the way
core keeps its single `passThrough` cast. The declared signatures — and so the
per-operation error channels — are unchanged.

`@unthrown/drizzle`: `resultThen` adopts the builder's `AsyncResult` with
`Promise.resolve` rather than a local `settle` helper wrapping it in an async
IIFE. Same adoption, same two-handler `then` for an awaiting caller.
