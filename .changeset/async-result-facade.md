---
"unthrown": major
---

**BREAKING:** add an `AsyncResult` companion object and split the static entry
points across the two facades **by what they return**, so each static lives in
exactly one namespace.

- New `AsyncResult.*` companion (value + type sharing one name, like `Result`):
  `AsyncResult.fromPromise`, `AsyncResult.fromSafePromise`, `AsyncResult.all`,
  `AsyncResult.allFromDict`. The aggregates **drop the `Async` suffix** the free
  functions carry — the namespace already says async (`AsyncResult.all` _is_ the
  free function `allAsync`).
- The async entry points are **removed from the `Result` facade**:
  `Result.fromPromise`, `Result.fromSafePromise`, `Result.allAsync`, and
  `Result.allFromDictAsync` are gone — use `AsyncResult.fromPromise` etc. (They
  returned an `AsyncResult`, not a `Result`, so they were misplaced.)

Unaffected: the **free functions** (`fromPromise`, `allAsync`, …) are unchanged
and remain the primary, tree-shakeable API; the companions are opt-in sugar. The
`Result` facade keeps every `Result`-producing static
(`Ok`/`Err`/`Defect`/`Do`/`fromNullable`/`fromThrowable`/`all`/`allFromDict`/`is*`).
