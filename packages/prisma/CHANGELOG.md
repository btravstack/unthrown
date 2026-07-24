# @unthrown/prisma

## 0.1.1

### Patch Changes

- 3b06099: Adopt @btravstack/tsconfig@0.2.0 (verbatimModuleSyntax), @btravstack/oxlint@0.2.1 (consistent-type-imports), and @btravstack/lefthook.
- 4096713: Remove the local `tools/tsconfig` / `tools/typedoc` packages and consume the published `@btravstack/tsconfig` / `@btravstack/typedoc` config directly (every package now extends `@btravstack/*` and takes it from the catalog).
- Updated dependencies [3b06099]
- Updated dependencies [4096713]
  - unthrown@4.3.1

## 0.1.0

### Minor Changes

- f13d984: Initial release of **@unthrown/prisma** — a Prisma Client extension that bridges
  Prisma queries into unthrown's `AsyncResult`. `$extends(unthrownPrisma)` adds
  `try`-prefixed variants of **all seventeen** model delegate operations
  (`tryFindMany`, `tryFindUnique`, `tryFindUniqueOrThrow`, `tryFindFirst`,
  `tryFindFirstOrThrow`, `tryCount`, `tryAggregate`, `tryGroupBy`, `tryCreate`,
  `tryCreateMany`, `tryCreateManyAndReturn`, `tryUpsert`, `tryUpdate`,
  `tryUpdateMany`, `tryUpdateManyAndReturn`, `tryDelete`, `tryDeleteMany`)
  alongside the raw promise ones: each returns an `AsyncResult` whose
  error channel is exactly the set of P-codes that operation can produce, mapped to
  tagged errors (`UniqueConstraintViolation` / `ForeignKeyViolation` /
  `RecordNotFound` / `DriverError`) — with `select` / `include` payload inference
  preserved. `$tryTransaction` runs an interactive transaction whose callback
  speaks `AsyncResult`: an `Err` triggers a rollback and comes out as the same
  typed `Err`; a defect also rolls back and stays a defect (a callback that throws
  outright included — a bug is never downgraded to a modeled `DriverError`).

  `tryPaginate(query).withCursor({ limit, after, before, getCursor, parseCursor })`
  provides cursor pagination in the style of `prisma-extension-pagination` (same
  option names, same `[results, meta]` shape), with one fix folded in: a cursor
  pointing at a record that no longer matches the query filter does not skip the
  first element of the page.

### Patch Changes

- Updated dependencies [09806e1]
- Updated dependencies [596a62d]
- Updated dependencies [63e9b88]
- Updated dependencies [d13ad64]
  - unthrown@4.1.0
