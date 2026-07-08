---
"unthrown": minor
---

`mapErr` can now escalate a modeled error to the defect channel. Its callback
takes the injected `defect` marker as a second argument (like `fromPromise` /
`fromThrowable`'s `qualify`): return `defect(cause)` to move that error to the
defect channel, or a new error to keep it modeled. The error type is inferred as
`Exclude<R, Defect>`, so `(e, defect) => defect(e)` empties the error channel to
`never`. **Behavioral caveat for point-free callers:** the callback is now invoked with
two arguments, so an existing arity-≥2 function passed point-free changes
behavior — e.g. `mapErr(JSON.stringify)` now receives the `defect` marker as
JSON's _replacer_ and produces a `Defect` instead of `Err("…")`. Single-
parameter callbacks (`mapErr((e) => …)`) are unchanged. If you pass functions
point-free, wrap them: `mapErr((e) => JSON.stringify(e))`. Consider whether
this warrants a major release for your consumers before merging.
