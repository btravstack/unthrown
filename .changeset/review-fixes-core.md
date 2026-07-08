---
"unthrown": minor
---

Soundness and hardening fixes from a full review:

- **Async combinator callbacks are now a compile error** (`NotThenable`): an
  `async` callback passed to `map`/`tap`/`tapErr`/`tapDefect`/`mapErr`/
  `recover`/`let` no longer type-checks. Such code was already broken at
  runtime — its rejection escaped the pipeline as an unhandled rejection
  instead of a `Defect`. Lift async work with `fromPromise` + `flatMap`.
  (`match` handlers may still be async.)
- **A throw inside `tapErr`/`tapDefect`/`flatTapErr` no longer destroys the
  failure being observed**: the resulting `Defect`'s cause is now an
  `AggregateError([thrown, original])`.
- **`matchTags`** routes an unhandled `_tag` (possible only outside the typed
  contract) to the `Defect` handler instead of crashing, and rejects the
  reserved tags `"Ok"`/`"Defect"` at compile time.
- **`unwrapOr` widens**: `unwrapOr<U>(fallback: U): T | U`, so
  `r.unwrapOr(null)` now type-checks.
- `fromPromise`/`fromSafePromise` absorb a non-thenable input instead of
  throwing synchronously; `bind`/`let` reject an array scope as misuse
  (Defect) instead of silently index-spreading it; `Result` instances are
  frozen so a variant cannot be forged by mutation.
