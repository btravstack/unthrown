---
"unthrown": minor
---

`mapErr` can now escalate a modeled error to the defect channel. Its callback
takes the injected `defect` marker as a second argument (like `fromPromise` /
`fromThrowable`'s `qualify`): return `defect(cause)` to move that error to the
defect channel, or a new error to keep it modeled. The error type is inferred as
`Exclude<R, Defect>`, so `(e, defect) => defect(e)` empties the error channel to
`never`. Backward-compatible — existing `mapErr((e) => e2)` calls are unchanged.
