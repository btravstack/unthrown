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
- [**@unthrown/effect**](./effect/) — bijective `Result ↔ Exit` bridges
  (Effect has a genuine defect channel, `Cause.die`), plus `toEither` with a
  mandatory `onDefect`.
- [**@unthrown/neverthrow**](./neverthrow/) — `to*`/`from*` bridges to
  neverthrow's `Result`/`ResultAsync`; every `to*` takes a mandatory `onDefect`
  (neverthrow has no defect channel).
- [**@unthrown/boxed**](./boxed/) — `to*`/`from*` bridges to Boxed's
  `Result`/`Future`; every `to*` takes a mandatory `onDefect`.
- [**@unthrown/standard-schema**](./standard-schema/) — `fromSchema` /
  `fromSchemaAsync`: run any Standard Schema validator (Zod, Valibot, ArkType)
  into a `Result` with the validation issues as the modeled error.
- [**@unthrown/orpc**](./orpc/) — the oRPC (v2) bridge: `handlerResult` /
  `.result()` for `Result`-returning procedure handlers, `createResultClient` /
  `fromCall` for an `AsyncResult` client, with the inferable `ORPCError` union
  as the modeled error.

`@unthrown/oxlint` (the lint rules `no-ambiguous-error-type` and
`prefer-async-result`) has no generated API page — it is documented in the
[Linting guide](../guide/linting).
