---
"unthrown": minor
---

Add `flatTap` — a **failable** `tap` on the success channel, for both `Result`
and `AsyncResult`. It runs a `Result`-returning effect on the `Ok` value,
discards the effect's success value (the original flows through), threads the
effect's error (`Result<T, E | E2>`), and — like every combinator — turns a
throw into a `Defect`. It is to `tap` what `flatMap` is to `map`: use it for a
validation or write whose outcome matters but whose value you don't need.
