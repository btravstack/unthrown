# @unthrown/orpc

Package-specific spec for `packages/orpc`. The cross-cutting rules — the five
theses, the load-bearing runtime invariants, the public surface and the
internal design — live in the root [`CLAUDE.md`](../../CLAUDE.md) and apply
here too.

PeerDeps `@orpc/client` + `@orpc/contract` + `@orpc/server`
at `^2.0.0-beta.34` — **peers, not deps**: `isDefinedError` is an
`instanceof ORPCError` check, the same dual-copy hazard as `isResult`;
`@orpc/contract` supplies `reconcileORPCError` and the path lookup;
`@orpc/server` is an **optional** peer so a browser-only consumer skips it.
beta.34 removed oRPC's returned-error channel and the `inferable` flag
outright (middleapi/orpc#1987) — a returned value, `ORPCError` included, is
now always the success payload — so the floor is pinned there; earlier betas
are unsupported. A two-way bridge built on oRPC v2's defined-`ORPCError`
mechanism (an error whose `code` a procedure declares via `.errors({...})`
is _defined_ — typed end-to-end when THROWN; `defined` alone decides the
channel, orthogonal to payload scrubbing — oRPC only scrubs an opaque thrown
`Error` to `INTERNAL_SERVER_ERROR`, an undeclared `ORPCError` keeps its real
`code`/`data` and is still a Defect), which maps onto the variants exactly:
`Ok` ↔ output, `Err` ↔ a thrown, defined `ORPCError`, `Defect` ↔ the rest —
including an `ORPCError` thrown with no matching `.errors()` entry, which is
statically invisible (`never` in `E`) and always a runtime Defect. Three
entry points, **no root export**: `./server` — `handlerResult(fn)` adapts a
`Result`-returning handler (`Err` is constrained to `ORPCError`, so the
`mapErrCases` into `errors.CODE(...)` at the endpoint is the Thesis-#3 triage
point; `Err` is always THROWN, never returned — returning would serve it as
a successful output or fail output validation into a 500; a `Defect`
rethrows its cause — an `ORPCError` cause wrapped in a plain `Error` first,
because oRPC reconciles every thrown `ORPCError` against the procedure's
`.errors()` and a declared code would otherwise reach the client defined;
the callback may be async — an elimination edge, exempt like `match`). `./extensions/result` — the opt-in `.result()` builder
method via `declare module "@orpc/server"` augmentation + two prototype
patches (`Builder`, `ProcedureImplementer` — every builder state shares the
`Builder` class at runtime); the package's ONE side-effectful entry, listed
in a `sideEffects` array (the `@orpc/experimental-effect` packaging).
`DecoratedProcedure` (beta.34+) dropped its declared-error-union type
argument, so the builder's `.result()` overloads no longer merge an
`Extract<TOutput, AnyORPCError>` arm into it either — output is plain
`Schema<TOutput>`. `./client` — `fromCall(promise)` lifts a single call
(client call or server-side `call(...)`), `createResultClient(client, { contract? })`
recursively wraps a router (the `createSafeClient` mirror; each nested
segment wrapped once and cached, oRPC's `RECURSIVE_CLIENT_UNWRAP_KEYS`
answered by the target, never wrapped). With `contract`, every rejected
`ORPCError` is re-reconciled against the client's own procedure entry
(`reconcileORPCError`: declared code AND `data` passing its schema) before
triage, so the channel follows the contract the caller compiled against, not
the server's `defined` flag — the rolling-deploy case, where a newer server
declares a code the client's `E` has no arm for. If the reconciliation itself
throws (a contract that lacks the called path), the Defect's cause is an
`AggregateError([thatFailure, originalRejection])` — the core's
observer-aggregation shape — so the lookup's `TypeError` never replaces the
rejection. WITHOUT a contract (and always for `fromCall`, which takes none),
the server's `defined` flag decides and `error.data` is **unvalidated** —
there is no schema to check it against, so this is documented (README, guide,
TSDoc) rather than fixed: passing `contract` is the validation. Either way: `E` is the raw
defined `ORPCError` union discriminated by `code` — deliberately NOT
re-wrapped into `TaggedError` (match it on `code`, e.g.
`.mapErrCases((matcher) => matcher.with({ code: "NOT_FOUND" }, …))`); the
`qualify` in `fromPromise` must never widen past `isDefinedError` to a bare
`cause instanceof ORPCError` check — an undeclared 500 and a
`MALFORMED_ORPC_RESPONSE` are both `ORPCError`s with `defined: false`, and
belong in the defect channel, not the error channel; non-defined →
`Defect`. Event-iterator (streaming) procedures are deliberately out of
scope — the raw client is the escape hatch. Tested end-to-end against real
oRPC machinery: `createRouterClient` in-process plus an
`RPCHandler`/`RPCLink` loop through a custom `fetch` (real JSON
serialization, where an opaque thrown `Error` actually collapses to
`INTERNAL_SERVER_ERROR`, while an undeclared `ORPCError`'s code/data survive
on the wire intact — its `defined` flag just never flips true).
**Deliberately outside
the fixed version group** — its majors track oRPC's cadence, not the
family's. Documented in the oRPC guide page.
