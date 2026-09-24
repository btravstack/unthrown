# API Reference

This reference is generated from the source with
[TypeDoc](https://typedoc.org/) at build time.

## Packages

- [**unthrown**](./core/) — the core `Result` / `AsyncResult` types,
  constructors (`Ok`, `Err` and the pre-lifted `OkAsync` / `ErrAsync` — a
  `Defect` has no constructor; it arises only at boundaries), do-notation
  (`Do` / `DoAsync`), guards, boundary interop (`fromNullable`,
  `fromThrowable`, `fromSafeThrowable`, `fromPromise`, `fromSafePromise`,
  `fromExecutor`), aggregation (fail-fast `all` / `allFromDict` and the
  accumulating `validateAll` / `validateAllFromDict`, each with an `…Async`
  twin), the tagged-error factory (`TaggedError`), and the built-in `match` /
  `P` (`P.tag` included) that drive the exhaustive error matcher.
- [**@unthrown/vitest**](./vitest/) — custom Vitest matchers (`toBeOk`,
  `toBeOkWith`, `toBeErr`, `toBeErrWith`, `toBeErrTagged`, `toBeDefect`,
  `toBeDefectWith`).
- [**@unthrown/saga**](./saga/) — `SagaAsync()`: a sequence of steps carrying
  compensating undos, unwound LIFO the moment one fails, with the failure
  returned unchanged.
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
- [**@unthrown/prisma**](./prisma/) — a Prisma Client extension
  (`$extends(unthrownPrisma)`) adding `try*` variants of every model operation
  (each an `AsyncResult` whose error channel is exactly the P-codes it can
  raise), plus `$tryTransaction` and `tryPaginate(...).withCursor(...)`.
- [**@unthrown/drizzle**](./drizzle/) — a Drizzle ORM Postgres database that
  _replaces_ the stock one: every query resolves to an `AsyncResult`, with the
  five integrity-constraint SQLSTATEs as tagged errors, reads declaring
  `E = never`, and `Result`-driven transactions.

`@unthrown/oxlint` has no generated API page — it is documented in the
[Linting guide](../how-to/lint-your-codebase). Its `recommended` preset enables
`no-ambiguous-error-type`, `no-async-result-race`, `no-catch-all-pattern`,
`no-unhandled-result`, `no-unused-matcher` and `prefer-async-result`; the
opt-in rules are `no-get-or-throw`, `no-throw` and `prefer-pre-lifted`.
