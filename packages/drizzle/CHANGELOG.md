# @unthrown/drizzle

## 0.2.0

### Minor Changes

- d6cadc5: `unthrown` is a peerDependency now, not a dependency. As a dependency the
  package manager was free to give each companion its own copy whenever the
  app's copy did not satisfy the subtree — and two copies diverge in both type
  (structurally incompatible `Result`/`AsyncResult` across versions) and
  runtime identity (`isResult` compares across copies). As a peer an
  application installs exactly one `unthrown`, and an unmet range fails loudly
  at install instead of silently forking the tree. npm ≥7 and pnpm
  auto-install peers, so most installs are unchanged; add `unthrown` to your
  dependencies explicitly if your setup does not.

## 0.1.1

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

## 0.1.0

### Minor Changes

- 5c1b926: Add `@unthrown/drizzle`, a Drizzle ORM Postgres integration that **replaces** the
  stock `drizzle-orm/node-postgres` database rather than wrapping one: every method
  already speaks `AsyncResult`, so there is no `try*` prefix to learn and migrating
  a call site is an import change. Writes (`insert`, `update`, `delete`, raw
  `db.execute`, `transaction`) carry the five integrity-constraint
  SQLSTATEs as tagged errors — `UniqueConstraintViolation` (23505),
  `ForeignKeyViolation` (23503), `NotNullViolation` (23502, carrying `column`),
  `CheckViolation` (23514), `ExclusionViolation` (23P01) — while every
  infrastructure failure (deadlock, serialization failure, statement timeout,
  connection loss, a syntax error) is a `Defect`, so a retry lives in one
  `recoverDefect` wrapper instead of an arm at every call site. Reads (`select`,
  `$count`, `db.query.*`, `refreshMaterializedView`, and their prepared forms)
  infer `E = never`, enforced at runtime through `fromSafePromise` so the type
  cannot drift from what the runtime produces. Transactions follow the variants
  directly: `Ok` commits, `Err` and `Defect` both roll back, an `Err` re-surfaces
  typed, and there is deliberately no `tx.rollback()` — nesting is a savepoint.
  Also exports `qualifyPgError` for boundaries of your own, and keeps `db.$client`
  as the escape hatch to a stock drizzle database over the same pool.

  Every driver rejection is wrapped in drizzle's own `DrizzleQueryError` before
  triage, exactly as stock drizzle does, so a defect names the failing statement
  and its params — node-postgres' `DatabaseError` carries `code`/`constraint`/
  `table`/`column`/`detail` but not the SQL. The driver error stays one `cause`
  level down, which is where `qualifyPgError` already reads the SQLSTATE from.

  The exported pg-core classes are spelled uniformly `PgUnthrown*`
  (`PgUnthrownSelectBase`, `PgUnthrownInsertBase`, …, plus `PgUnthrownDatabase`,
  `PgUnthrownSession`, `PgUnthrownPreparedQuery` and
  `PgUnthrownSafePreparedQuery`), mirroring drizzle's own uniform `PgAsync*`
  tree; the node-postgres ones keep drizzle's `NodePg…` shape as
  `NodePgUnthrown*`. One concept, one name — settled before the first publish,
  since it is public API.

  `drizzle-orm` and `pg` are peer dependencies (`^1.0.0-rc` and `^8.16.0`); the
  internals — which subclass drizzle's `pg-core` builder tree — were verified
  against `drizzle-orm@1.0.0-rc.4`.
