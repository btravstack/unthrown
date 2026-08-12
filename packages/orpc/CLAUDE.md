# @unthrown/orpc

Package-specific spec for `packages/orpc`. The cross-cutting rules — the five
theses, the load-bearing runtime invariants, the public surface and the
internal design — live in the root [`CLAUDE.md`](../../CLAUDE.md) and apply
here too.

PeerDeps `@orpc/client` + `@orpc/server`
at `^2.0.0-beta` — **peers, not deps**: `isInferableError` is an
`instanceof ORPCError` check, the same dual-copy hazard as `isResult`;
`@orpc/server` is an **optional** peer so a browser-only consumer skips it.
A two-way bridge built on oRPC v2's returned-`ORPCError` inference (an error
a procedure declares via `.errors({...})` or returns as a value is
_inferable_ — typed end-to-end; everything else collapses to
`INTERNAL_SERVER_ERROR`), which maps onto the variants exactly: `Ok` ↔
output, `Err` ↔ returned inferable `ORPCError`, `Defect` ↔ the rest. Three
entry points, **no root export**: `./server` — `handlerResult(fn)` adapts a
`Result`-returning handler (`Err` is constrained to `ORPCError`, so the
`mapErrCases` into `errors.CODE(...)` at the endpoint is the Thesis-#3 triage
point; a `Defect` rethrows its cause; a non-`ORPCError` `Err` smuggled past
the types routes to the defect path — it must never be served as a
successful output; the callback may be async — an elimination edge, exempt
like `match`). `./extensions/result` — the opt-in `.result()` builder
method via `declare module "@orpc/server"` augmentation + two prototype
patches (`Builder`, `ProcedureImplementer` — every builder state shares the
`Builder` class at runtime); the package's ONE side-effectful entry, listed
in a `sideEffects` array (the `@orpc/experimental-effect` packaging).
`./client` — `fromCall(promise)` lifts a single call (client call or
server-side `call(...)`), `createResultClient(client)` recursively wraps a
router (the `createSafeClient` mirror): `E` is the raw inferable `ORPCError`
union discriminated by `code` — deliberately NOT re-wrapped into
`TaggedError` (match it on `code`, e.g. `.mapErrCases((matcher) => matcher.with({
code: "NOT_FOUND" }, …))`); non-inferable →
`Defect`. Event-iterator (streaming) procedures are deliberately out of
scope — the raw client is the escape hatch. Tested end-to-end against real
oRPC machinery: `createRouterClient` in-process plus an
`RPCHandler`/`RPCLink` loop through a custom `fetch` (real JSON
serialization, where the defect-collapse to `INTERNAL_SERVER_ERROR`
actually happens). **Deliberately outside the fixed version group** — its
majors track oRPC's cadence, not the family's. Documented in the oRPC guide
page.
