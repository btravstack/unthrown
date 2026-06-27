# @unthrown/oxlint

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
