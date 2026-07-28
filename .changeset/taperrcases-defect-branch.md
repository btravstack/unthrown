---
"unthrown": minor
---

**`tapErrCases` no longer silently drops a `defect(…)` branch.** A
`defect(cause)` return from a `tapErrCases` branch always compiled, but the
value was discarded (`tapErrCases` observes, it does not transform) — so the
pipeline carried on with the original `Err` as if nothing had happened, while
a `throw` in the very same branch already produced a `Defect`.

`tapErrCases` now takes the throw route too: a `defect(…)` branch produces a
`Defect` whose cause is an `AggregateError` of `[the branch's cause, the
observed error]`, matching `throw`'s behaviour in the same position and the
load-bearing "a failure-observer throw preserves the original failure"
invariant. Ordinary branch return values are still discarded — the `defect`
marker never was one.

If you had a `defect(…)` branch in `tapErrCases` and were relying on it
being silently dropped, your pipeline now surfaces a `Defect` there instead —
replace the branch with a `throw` (same new behaviour, more direct) or with
whatever handling you actually want. Across all five `*ErrCases`
combinators, `defect(…)` is now uniformly the expression-position form of a
`throw`.
