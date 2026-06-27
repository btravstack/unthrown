---
"unthrown": minor
---

Add `allFromDict` and `allFromDictAsync` — record-shaped aggregators that collect
a `{ a: Result<A, E>, b: Result<B, E> }` into a `Result<{ a: A; b: B }, E>` (and
the `AsyncResult` counterpart), for named parallel work without tupling. Kept as
**separate functions** from the tuple/array-shaped `all` / `allAsync` (positional
vs named is a distinct concept), which are unchanged. The folding rules are the
same — first `Err` short-circuits, any `Defect` dominates; this is not error
accumulation. The record fold writes keys via `Object.defineProperty`, so a
caller-supplied `"__proto__"` key can't pollute the prototype.
