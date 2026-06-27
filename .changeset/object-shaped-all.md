---
"unthrown": minor
---

`all` and `allAsync` now accept a **record** in addition to a tuple/array. The
output mirrors the input shape, so `all({ id: ok(1), name: ok("ada") })` is
`Result<{ id: number; name: string }, never>` — named parallel work without
tupling. The folding rules are unchanged (first `Err` short-circuits, any
`Defect` dominates); this is not error accumulation.
