---
"unthrown": minor
---

Add `fromSafeThrowable` — the synchronous counterpart to `fromSafePromise`:
wrap a throwing function asserted not to fail in any modeled way, so every
throw becomes a `Defect` and the error channel is `never`, with no `qualify`
callback. The explicit, named form of the
`fromThrowable(fn, (cause, defect) => defect(cause))` boilerplate. Also
exposed as `Result.fromSafeThrowable` on the companion object.
