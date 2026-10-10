---
"@unthrown/pothos": minor
---

Add `@unthrown/pothos`, a Pothos plugin: `resultField` and `resultConnection` (`@unthrown/pothos/relay`) resolve a field from a `Result`, answering each failure as the GraphQL error its case maps to in a `refusals` record that is exhaustive at compile time — returned as a member of `@pothos/plugin-errors`' result union, without a throw. `outcomeOf` answers a DataLoader key the same way, a defect as an `Error` instead of a rejected batch.
