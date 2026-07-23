---
"unthrown": minor
---

Add `tapFailure` — the one cross-channel observer: it runs a side effect on either failure (`Err` **or** `Defect`) and passes the `Result` through unchanged, for the shared "it went KO" concern (logging, metrics, rollback) that would otherwise be duplicated across `tapErr` + `tapDefect`. The callback receives the new exported `FailureView<E, T>` type (`ErrView | DefectView` — the discriminated variant, so `E` stays typed and the callback narrows on `tag`). Available on both `Result` and `AsyncResult`; a throwing observer preserves the original failure in an `AggregateError` defect, like the other failure observers.
