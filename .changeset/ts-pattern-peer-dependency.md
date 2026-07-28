---
"unthrown": major
---

**Core takes no `ts-pattern` dependency — neither a plain one nor a peer.** An
early v5 beta shipped it nested and exact-pinned, and that copy's declarations
did not unify with a consumer's own: feeding a `P.union(...)` built by one copy
into an unthrown matcher failed five layers deep in a conditional type. Making
it a peer settled the duplication, but at the price of an install obligation on
every consumer — and it left unthrown's central guarantee, exhaustiveness, at
the mercy of whichever version the consumer resolved.

The matcher is built into core instead, so neither problem remains: `match` /
`P` / `NonExhaustiveError` come from `"unthrown"` itself, there is only ever one
copy of the builder type, and nothing has to be installed alongside the package
(see the built-in matcher entry).

**Action required:** none on a fresh v5 install. If you added `ts-pattern` only
for unthrown's sake, drop it; keep it if your own code matches with it, and
import `P` from `"unthrown"` at unthrown call sites — the two `P`s are not
interchangeable.
