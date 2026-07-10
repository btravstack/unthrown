---
"unthrown": minor
---

Add pre-lifted async constructors `OkAsync` / `ErrAsync` (and the companion
aliases `AsyncResult.Ok` / `AsyncResult.Err`) for building an `AsyncResult`
directly from a value — sparing the repeated `Ok(value).toAsync()` /
`Err(error).toAsync()` on the synchronous branch of an `AsyncResult`-returning
function. They carry the `Async` suffix the other async free functions use
(`allAsync`), which the companion drops (`AsyncResult.Ok`). Closes #75.
