---
"unthrown": minor
---

Sharpen three corners of the core surface:

- **Narrowing guard methods.** `.isOk()` / `.isErr()` / `.isDefect()` are now
  `this is …` type predicates, so `if (r.isErr()) r.error` compiles — the
  methods narrow exactly like the standalone `isOk` / `isErr` / `isDefect`
  guards. No more boolean-only footgun for code coming from neverthrow.
- **`allAsync` + tuple-or-array `all`.** New `allAsync` combines `AsyncResult`s
  (resolved concurrently, order preserved; first `Err` wins, any `Defect`
  dominates; never rejects). Both `all` and `allAsync` now accept a **dynamic
  array** — `Result<T, E>[]` / `AsyncResult<T, E>[]` collapses to
  `Result<T[], E>` / `AsyncResult<T[], E>` with no cast — while a fixed tuple
  still keeps its positional types. Adds the `AsyncOkOf` / `AsyncErrOf` type
  helpers.
- **Decoupled `TaggedError` name.** `TaggedError(tag, { name })` sets
  `Error.name` independently of the `_tag` discriminant, so a tag can be
  namespaced for collision-safety (`"@my-lib/RetryableError"`) without that
  prefix leaking into stack traces. Defaults to `tag`, so existing calls are
  unchanged.
