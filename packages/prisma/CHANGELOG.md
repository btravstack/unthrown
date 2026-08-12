# @unthrown/prisma

## 0.3.1

### Patch Changes

- d892c07: Internal cleanup, no behaviour or API change.

  `@unthrown/prisma`: the shared `query` helper is now generic in the channels it
  returns, so each of the seventeen `try*` delegates is a one-line call whose own
  declared signature supplies the payload and error types. The assertion those
  seventeen `as AsyncResult<…>` casts performed now lives in one place, the way
  core keeps its single `passThrough` cast. The declared signatures — and so the
  per-operation error channels — are unchanged.

  `@unthrown/drizzle`: `resultThen` adopts the builder's `AsyncResult` with
  `Promise.resolve` rather than a local `settle` helper wrapping it in an async
  IIFE. Same adoption, same two-handler `then` for an awaiting caller.

- Updated dependencies [d892c07]
- Updated dependencies [d892c07]
- Updated dependencies [d892c07]
  - unthrown@5.4.0

## 0.3.0

### Minor Changes

- 988803e: Cover Prisma's batch `$transaction([...])` form in `$tryTransaction`.

  `$tryTransaction` is now overloaded exactly as Prisma's own `$transaction` is —
  one method, two forms — so the `try*` prefix keeps mapping one-to-one onto a
  Prisma method. The batch form is the natural fit for "insert N rows atomically"
  and is cheaper than the interactive one: a single round trip, with no open
  transaction held across application code.

  ```ts
  const rows = db.$tryTransaction(
    inputs.map((data) => db.user.create({ data })),
  );
  //    ^? AsyncResult<User[], PrismaQueryError>
  ```

  Previously this meant dropping to the raw client, and a `fromSafePromise` fallback
  sent **every** failure to the defect channel — a `UniqueConstraintViolation` that
  `tryCreate` would have modeled arrived untyped, and the call site could not fold
  it into a domain error.

  A fixed tuple keeps positional types
  (`[db.user.create(…), db.user.count()]` → `AsyncResult<[User, number], …>`); a
  dynamic array collapses to a list. Two consequences of Prisma's batch form needing
  **unexecuted** `PrismaPromise`s, both deliberate: the array holds the **raw**
  delegate methods (passing a `try*` result is a compile error — it has already
  run), and `E` is the whole `PrismaQueryError` union rather than the per-operation
  narrowing, since a raw `PrismaPromise` carries no error-type information.
  `isolationLevel` is accepted; `maxWait` and `timeout` are not, as they govern an
  interactive transaction's open window.

- 988803e: Export the `TransactionClient<C>` type helper.

  Naming the `tx` parameter of a helper factored out of a `$tryTransaction`
  callback had no type to reach for: the deny list is internal, and deriving it
  from the method does not work — `Parameters<Parameters<C["$tryTransaction"]>[0]>[0]`
  degrades to `Omit<unknown, …>`, because `C` is unresolved at that position. So
  adopting services hand-copied the list, which then drifts silently: `Omit` of a
  key that does not exist is not an error, so the copy keeps compiling after the
  library's own list changes.

  ```ts
  import type { TransactionClient } from "@unthrown/prisma";

  type Tx = TransactionClient<typeof db>;

  const chargeFees = (tx: Tx, id: number) =>
    tx.invoice.tryUpdate({ where: { id }, data: { charged: true } });
  ```

  The deny list stays internal — `$tryTransaction`'s own signature uses this very
  alias, so the two cannot drift.

### Patch Changes

- Updated dependencies [de9486c]
  - unthrown@5.3.0

## 0.2.0

### Minor Changes

- ab7194f: Make `E` domain outcomes only: infrastructure failures become defects, and fix
  an unsound error channel on `tryCreate` / `tryUpsert`.

  **`E` now carries only what you would actually branch on.** Three P-codes
  describe a domain outcome and stay modeled — `UniqueConstraintViolation` (P2002,
  409), `ForeignKeyViolation` (P2003, 400), `RecordNotFound` (P2025/P2018, 404).
  **Everything infrastructural is now a defect**: a dropped connection, a pool
  timeout, a deadlock, an unmapped P-code, a malformed query, a client that could
  not start, an engine panic.

  Nobody writes domain logic for a severed TCP connection — you log it and return a
  500, which is exactly what `match`'s `defect` arm already does. Modelling those
  failures only forced every call site to carry an arm that duplicated its own
  `defect` arm:

  ```ts
  // before — the same handling, written twice, at every call site:
  errCases: (matcher) => matcher
    .with(P.tag("UniqueConstraintViolation"), (e) => resp.conflict(e.fields))
    .with(P.tag("DriverError"), (e) => resp.serverError(e)),
  defect: (cause) => resp.serverError(cause),
  ```

  A defect is not a crash: it flows through the pipeline untouched and is folded at
  the edge like any other unmodeled failure.

  Consequences:

  - **The `DriverError` class is removed.** Nothing routes to it any more; the
    original Prisma error reaches your `defect` arm unwrapped, with its `code`,
    `meta` and stack intact.
  - **A read has no modeled failure**: `tryFindMany` is
    `AsyncResult<User[], never>`. Absence is still `null`.
  - **Pagination gains `InvalidCursor`**, the one carve-out. A cursor is an opaque
    string from a client, so a `parseCursor` that rejects it — or a query Prisma
    refuses to validate — is anticipated input you answer with a 400. A throw out
    of `getCursor`, which reads rows you just fetched, is a bug and stays a defect.
  - **Retrying a deadlock (P2034) or pool timeout (P2024)** now goes through
    `recoverDefect` rather than a tag match — one place in a codebase, versus an
    arm at every call site.

  **`tryCreate` and `tryUpsert` now carry `RecordNotFound`.** A nested `connect`
  pointing at a record that does not exist raises P2025, even though neither
  operation has a row of its own to miss:

  ```ts
  db.post.tryCreate({ data: { title, author: { connect: { id: 999 } } } });
  // Err(RecordNotFound) — P2025
  ```

  Their unions previously excluded it, so the runtime produced an error the type
  said was impossible. An exhaustive `mapErrCases` over the declared union then had
  no arm for the value that arrived, the matcher threw `NonExhaustiveError`, and
  the throw-to-defect net turned a modeled database failure into a `Defect`. P2018
  — the same failure from the to-many side of a nested write — now maps to
  `RecordNotFound` too. The batch mutations (`tryCreateMany` / `tryUpdateMany` and
  their `*AndReturn` twins) accept no nested writes, so they remain free of it.

  **`withCursor`'s `after` and `before` are now mutually exclusive.** Passing both
  type-checked and silently ignored `after`.

  Breaking, shipped as a minor: `qualifyPrismaError` takes the injected `defect`
  helper as a second argument (it is a `qualify`, so passing it to a boundary is
  unchanged — only direct invocation needs updating), the `DriverError` class is
  gone, and every error union changed. Each of those is a compile error at the call
  site rather than a silent behaviour change — which is the point.

### Patch Changes

- Updated dependencies [625f985]
- Updated dependencies [1af785f]
- Updated dependencies [5ead919]
  - unthrown@5.1.0

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
