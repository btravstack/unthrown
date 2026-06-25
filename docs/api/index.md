# API Reference

This reference is generated from the source with
[TypeDoc](https://typedoc.org/) at build time.

## Packages

- [**unthrown**](./core/) — the core `Result` / `AsyncResult` types,
  constructors (`ok`, `err`, `defect`), guards, boundary interop
  (`fromNullable`, `fromThrowable`, `fromPromise`, `fromSafePromise`),
  aggregation (`all`), and the tagged-error utilities (`TaggedError`,
  `matchTags`).
- [**@unthrown/vitest**](./vitest/) — custom Vitest matchers (`toBeOk`,
  `toBeOkWith`, `toBeErr`, `toBeErrTagged`, `toBeDefect`).
- [**@unthrown/pattern**](./pattern/) — the thin `ts-pattern` integration
  (`toMatchable`, `tag`).
