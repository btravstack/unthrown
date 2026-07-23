---
"unthrown": minor
---

Add `discard()` to `Result` and `AsyncResult` — drops the `Ok` value and
collapses the success type to `void`. The named form of `map(() => undefined)`:
unlike `as(undefined)`, which produces `Result<undefined, E>`, `discard()`
produces `Result<void, E>`. `Err` and `Defect` pass through untouched.
