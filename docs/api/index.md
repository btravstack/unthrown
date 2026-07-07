# API Reference

This reference is generated from the source with
[TypeDoc](https://typedoc.org/) at build time.

## Packages

- [**unthrown**](./core/) — the core `Result` / `AsyncResult` types,
  constructors (`Ok`, `Err` — a `Defect` has no constructor; it arises only at
  boundaries), guards, boundary interop
  (`fromNullable`, `fromThrowable`, `fromPromise`, `fromSafePromise`),
  aggregation (`all`), and the tagged-error utilities (`TaggedError`,
  `matchTags`).
- [**@unthrown/vitest**](./vitest/) — custom Vitest matchers (`toBeOk`,
  `toBeOkWith`, `toBeErr`, `toBeErrTagged`, `toBeDefect`).
- [**@unthrown/pattern**](./pattern/) — thin `ts-pattern` sugar for the
  natively-matchable `Result` (`P.Ok`/`P.Err`/`P.Defect`, `tag`).
