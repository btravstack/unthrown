---
"unthrown": patch
---

Fixes from a whole-repo review:

- **`unthrown`** — `TaggedError` now reserves `name`: a payload field named `name`
  can no longer shadow the display label (it was silently clobbered at runtime
  while the instance type still promised it). `name` is excluded from the payload
  type, consistent with how `_tag` is authoritative.
- **`@unthrown/vitest`** — the matchers now reject a foreign `Result`-like object
  (e.g. a neverthrow/Boxed result) via core's canonical `isResult` instead of a
  loose `isOk`-duck-type, so such a value fails clearly as "not an unthrown
  Result" rather than being mistaken for an `Err`.
- **`@unthrown/oxlint`** — `no-ambiguous-error-type` resolves a bare `Error`
  through scope analysis, so a locally-declared `type Error` or a generic
  `<Error>` parameter is no longer a false positive.
- **`@unthrown/standard-schema`** — async-schema detection uses a structural
  thenable check instead of `instanceof Promise`, so a promise from another realm
  (vm/worker) is correctly caught instead of silently producing `Ok(undefined)`.
