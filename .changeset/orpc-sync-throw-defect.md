---
"@unthrown/orpc": patch
---

`createResultClient`: a procedure (or custom link) that throws synchronously
now lands in the `Defect` channel instead of escaping as a raw throw — the
wrapped call runs inside the `fromPromise` boundary via its thunk form.
