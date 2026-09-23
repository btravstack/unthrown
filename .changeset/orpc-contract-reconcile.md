---
"@unthrown/orpc": minor
---

`createResultClient(client, { contract })` classifies rejections against the
client's own contract. oRPC's server reconciles a thrown `ORPCError` against
_its_ contract, so the `defined` flag on the wire reflects the server's
version of `.errors({...})`. During a rolling deploy a newer server could send
a code the client never declared, and it landed in an `E` with no arm for it.
With `contract`, every rejection is re-reconciled with `reconcileORPCError`
(the code must be declared and its `data` must pass the declared schema);
anything else is a `Defect`. Without `contract`, behaviour is unchanged.

`handlerResult` no longer lets a defect answer a declared code. A `Defect`
whose cause is an `ORPCError` (a downstream call qualified as a defect) was
rethrown raw, and oRPC reconciled it against the procedure's `.errors({...})`:
a declared code reached the client as a typed `Err`. The cause is now wrapped
in a plain `Error`, so it answers `INTERNAL_SERVER_ERROR` like any defect.
**Behaviour change**: such a defect used to keep its own code and status
(e.g. a downstream `401`); it now answers `500`.

`createResultClient` wraps each nested segment once and reuses it, and leaves
oRPC's reserved keys (`then`, `bind`, `call`, `apply`, `toString`, `valueOf`,
`toJSON`) to the target instead of wrapping them as procedures.

`@orpc/contract` is now a peer dependency.
