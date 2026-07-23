---
"unthrown": minor
---

Add no-arg overloads `Ok()` and `OkAsync()` — construct a `void` success
(`Result<void, never>` / `AsyncResult<void, never>`) without writing
`Ok(undefined)`, and with the success channel typed `void`, not `undefined`.
The 1-arg forms are unchanged. The companions pick the overload up unchanged
(`Result.Ok()` / `AsyncResult.Ok()`).
