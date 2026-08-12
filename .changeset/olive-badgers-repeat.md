---
"@unthrown/prisma": patch
---

Document the modeled P-code set as a **boundary**, not a menu (#226). `P2002`,
`P2003`, `P2018` and `P2025` are the whole of it — every other code (`P2007`,
`P2023`, `P2000`, `P2011`, `P2015`, …) is a `Defect`, including ones that read
like domain outcomes.

The README and the Prisma guide now state that next to the per-operation table,
with the consequence spelled out: where a defect is _retried_ rather than
surfaced — a Temporal activity rethrows it, so it is retried, while an `Err`
converted to a non-retryable failure fails fast — a code like `P2007` from a
malformed id retries forever on input that can never succeed.

The guide also gains a **"Migrating a hand-rolled qualifier"** recipe: diff your
old `try`/`catch` qualifier against those four codes, and re-qualify anything
else with `recoverDefect` (rethrowing the causes you did not name, so they stay
defects). The migration is otherwise silent — the type check passes, since the
`Err` channel legitimately shrank, and a repository unit test on the `Ok` path
passes too.

Documentation only; no runtime or type change.
