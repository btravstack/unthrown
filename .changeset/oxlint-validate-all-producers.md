---
"@unthrown/oxlint": patch
---

`no-unhandled-result` and `no-async-result-race` now recognise the accumulating
aggregates. Both rules resolve producers by name, so a dropped
`validateAll(...)` statement went unreported and the sibling-race
`no-async-result-race` exists for was invisible on `validateAllAsync`. The four
free functions and their `Result.*` / `AsyncResult.*` facade members are now in
the producer sets.
