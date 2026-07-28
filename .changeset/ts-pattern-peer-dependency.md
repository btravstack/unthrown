---
"unthrown": major
---

**`ts-pattern` is now a `peerDependency` (`^5`), not a plain dependency.** Core
re-exports `match` / `P` and its error matchers speak ts-pattern's builder type.
When ts-pattern was a nested, exact-pinned dependency, a consumer
who already used ts-pattern at another version ended up with two copies whose
declarations don't unify — feeding a `P.union(...)` built by one copy into an
unthrown matcher failed five layers deep in a conditional type.

Declaring it as a peer guarantees a single copy the consumer owns, so
`import { P } from "ts-pattern"` composes with unthrown's matchers as expected.

**Action required:** add `ts-pattern` (`^5`) to your own dependencies if you
don't already depend on it. Most package managers surface this as a missing-peer
warning on install.
