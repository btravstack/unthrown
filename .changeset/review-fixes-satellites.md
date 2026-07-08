---
"@unthrown/vitest": minor
"@unthrown/oxlint": minor
"@unthrown/boxed": patch
"@unthrown/neverthrow": patch
"@unthrown/effect": patch
"@unthrown/pattern": patch
"@unthrown/standard-schema": patch
---

- **@unthrown/vitest**: `unthrown` is now a **peerDependency** (the matchers'
  `isResult` is an `instanceof` check — the previous exact-version dependency
  could install a second copy of core and silently reject every genuine
  `Result`). `toBeErrTagged(tag, undefined)` now asserts the payload equals
  `undefined` instead of degrading to a tag-only match.
- **@unthrown/oxlint**: `prefer-async-result` no longer offers an autofix on an
  `async` function's return annotation (the rewrite could not compile); the
  `oxlint` peer range is now `^1.69.0` (JS plugins require it).
- **All packages**: core is depended on via `workspace:^` (caret) instead of an
  exact pin, `LICENSE` ships in every tarball, the legacy `types` fallback
  points at the CJS declarations, and `engines.node` relaxes to `>=20`.
