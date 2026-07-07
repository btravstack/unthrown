---
"unthrown": major
---

**Breaking:** `unwrap()` and `unwrapErr()` are now type-gated. `unwrap()` compiles
only on a `Result` / `AsyncResult` whose error channel is empty (`E = never`), and
`unwrapErr()` only when the success channel is empty (`T = never`). Calling `.unwrap()`
on a fallible `Result<T, E>` is now a **compile error** instead of a runtime
`UnwrapError` — eliminate the error channel first with `match` / `recover` / `orElse`,
or use the `unwrapOr` / `unwrapOrElse` / `getOrNull` / `getOrUndefined` family (which
recover an `Err`). `Ok(x).unwrap()` and error-free results are unaffected. The runtime
is unchanged and `UnwrapError` is retained as a defensive guard.

Also adds `toBeErrWith` to `@unthrown/vitest` for asserting a plain error value.
