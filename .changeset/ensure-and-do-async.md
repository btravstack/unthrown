---
"unthrown": minor
---

**New: `ensure` and `DoAsync` / `AsyncResult.Do`.**

- `ensure(predicate, onFail)` — validate a success or fail it into the modeled
  channel: `Ok` + passing predicate flows through unchanged; a failing one
  becomes `Err(onFail(value))` (`E` widens to `E | E2`). A type-guard predicate
  narrows the success type (`Result<U, E | E2>`). `Err` / `Defect` pass
  through untouched; a throw in either callback becomes a `Defect` as usual.
  Available on both `Result` and `AsyncResult`.
- `DoAsync()` — the pre-lifted async do-notation entry (`Do().toAsync()`
  without the boilerplate), aliased as `AsyncResult.Do` (suffix dropped in the
  namespace, like `AsyncResult.Ok`).
