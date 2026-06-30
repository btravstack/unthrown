# @unthrown/oxlint

## 3.0.0

## 2.0.0

## 1.1.0

## 1.0.0

### Major Changes

- Aligned to the shared `1.0.0` version line: `@unthrown/oxlint` is now part of
  the fixed version group, so it releases in lockstep with `unthrown` and the
  other `@unthrown/*` packages. No functional changes — this is the package's
  first published version (the earlier `0.2.x` entries were never released to
  npm).

## 0.2.0

### Minor Changes

- 9bb4551: New oxlint plugin enforcing unthrown's conventions at lint time. Two rules:
  `no-ambiguous-error-type` (the `E` in `Result<T, E>` / `AsyncResult<T, E>` must
  be a concrete domain error — no `unknown`/`any`/`Error`/`{}`/primitives;
  Thesis #1) and `prefer-async-result` (prefer `AsyncResult<T, E>` over
  `Promise<Result<T, E>>`, autofixable). Both resolve the import source via scope
  analysis, so they only fire on unthrown's own types. Ships a `recommended`
  preset. Built on oxlint's JS-plugin API (`@oxlint/plugins`); `oxlint` is a peer
  dependency.
