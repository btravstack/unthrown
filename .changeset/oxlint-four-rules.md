---
"@unthrown/oxlint": minor
---

**Two new rules, and sharper resolution in the two carried over from 4.x.**

- New `no-unhandled-result` (in the recommended preset): flags a bare
  statement dropping a `Result` — a call to an unthrown-imported producer, a
  facade-companion member (`Result.Ok(…)`, `AsyncResult.fromPromise(…)`), or a
  locally-declared function whose return annotation is unthrown's
  `Result`/`AsyncResult` — awaited or not. Deliberately syntactic; a dropped
  method chain (`r.map(f);`) is out of scope.
- New `no-throw` (opt-in, not in the preset): reports every `throw` statement,
  pointing at `Err(...)`, `getOrThrow()`, and `fromSafeThrowable` — the rule
  the `getOrThrow` design has always referenced.
- Both 4.x rules now resolve bindings by the **imported** name:
  `import { Result as R }` is caught, `import { Ok as Result }` no longer
  false-positives, and namespace-qualified `U.Result<…>` is flagged.
- `no-ambiguous-error-type` also flags `void` in `E`, and a false negative
  under the real CLI is fixed: built-in globals (`Error`, `Promise`) resolve
  to a defs-less variable there, which silently disabled the bare-`Error`
  check.
- `prefer-async-result` now withholds its autofix in function-**type** return
  positions too (the implementer may be an `async` function, where the rewrite
  cannot compile); it still reports.
