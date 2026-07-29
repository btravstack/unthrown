# @unthrown/prisma

## 0.1.1

### Patch Changes

- 3b06099: Adopt @btravstack/tsconfig@0.2.0 (verbatimModuleSyntax), @btravstack/oxlint@0.2.1 (consistent-type-imports), and @btravstack/lefthook.
- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- 92c848b: Update stale v4 `match({ ok, err, defect })` doc examples to the v5
  `{ ok, errCases, defect }` shape (including `fromSchemaAsync`'s `@example`,
  which renders into the API reference).
- 27f12a2: `$tryTransaction` no longer downgrades an out-of-contract callback return to a
  modeled `Err(DriverError)`: a callback that resolves to a non-`Result` (untyped
  or cast callers) now rolls back and surfaces as a `Defect` with a `TypeError`
  cause — the same policy as a throwing callback. A bug stays a defect.
- 4096713: Remove the local `tools/tsconfig` / `tools/typedoc` packages and consume the published `@btravstack/tsconfig` / `@btravstack/typedoc` config directly (every package now extends `@btravstack/*` and takes it from the catalog).
- Updated dependencies [3b06099]
- Updated dependencies [a899858]
- Updated dependencies [92c848b]
- Updated dependencies [2297633]
- Updated dependencies [284b7be]
- Updated dependencies [f027af4]
- Updated dependencies [a52eabe]
- Updated dependencies [5364caa]
- Updated dependencies [e5e5a14]
- Updated dependencies [e43d44e]
- Updated dependencies [4096713]
- Updated dependencies [fe3840a]
- Updated dependencies [2297633]
- Updated dependencies [2297633]
- Updated dependencies [e5e5a14]
- Updated dependencies [5364caa]
- Updated dependencies [a1f68d5]
  - unthrown@5.0.0

## 0.1.1-beta.2

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- 92c848b: Update stale v4 `match({ ok, err, defect })` doc examples to the v5
  `{ ok, errCases, defect }` shape (including `fromSchemaAsync`'s `@example`,
  which renders into the API reference).
- Updated dependencies [92c848b]
  - unthrown@5.0.0-beta.10

## 0.1.1-beta.1

### Patch Changes

- 27f12a2: `$tryTransaction` no longer downgrades an out-of-contract callback return to a
  modeled `Err(DriverError)`: a callback that resolves to a non-`Result` (untyped
  or cast callers) now rolls back and surfaces as a `Defect` with a `TypeError`
  cause — the same policy as a throwing callback. A bug stays a defect.
- Updated dependencies [2297633]
- Updated dependencies [2297633]
- Updated dependencies [2297633]
  - unthrown@5.0.0-beta.1

## 0.1.1-beta.0

### Patch Changes

- 3b06099: Adopt @btravstack/tsconfig@0.2.0 (verbatimModuleSyntax), @btravstack/oxlint@0.2.1 (consistent-type-imports), and @btravstack/lefthook.
- 4096713: Remove the local `tools/tsconfig` / `tools/typedoc` packages and consume the published `@btravstack/tsconfig` / `@btravstack/typedoc` config directly (every package now extends `@btravstack/*` and takes it from the catalog).
- Updated dependencies [3b06099]
- Updated dependencies [284b7be]
- Updated dependencies [4096713]
- Updated dependencies [a1f68d5]
  - unthrown@5.0.0-beta.0

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
