# @unthrown/drizzle

Package-specific spec for `packages/drizzle`. The cross-cutting rules — the five
theses, the load-bearing runtime invariants, the public surface and the
internal design — live in the root [`CLAUDE.md`](../../CLAUDE.md) and apply
here too.

PeerDeps `drizzle-orm` `^1.0.0-rc`
and `pg` `^8.16.0` — a **range, not a pin**: the range names the published
contract a consumer must satisfy, and the internals were verified against
`1.0.0-rc.4`, which the changeset records. Slaving the peer to an exact rc
would force a lockstep release on every upstream rc for a change that touched
nothing. **Deliberately outside the fixed version group** — its majors track
drizzle's cadence, not the family's. This package **replaces** the stock
`drizzle-orm/node-postgres` database rather than wrapping one: every method
already speaks `AsyncResult`, so there is no `try*` prefix (the Prisma
extension's shape does not carry over — an extension is additive, a database
is not), and migrating a call site is an import change. The factory takes
**only drizzle's own call forms** — `drizzle(connectionString)`,
`drizzle(connectionString, config)`, `drizzle({ client })`,
`drizzle({ connection })` — with deliberately **no positional-client form**,
since a second spelling of `{ client: pool }` would mean a call site no longer
ports back by changing the import.
**Five** SQLSTATEs are modeled, and they are the integrity-constraint codes
only: `UniqueConstraintViolation` 23505 (409), `ForeignKeyViolation` 23503
(400), `NotNullViolation` 23502 (400 — carries **`column`**, not
`constraint`: 23502 names the offending column and has no constraint name of
its own), `CheckViolation` 23514, `ExclusionViolation` 23P01. Everything else
is a **`Defect`**: deadlock (40P01), serialization failure (40001), statement
timeout (57014), too-many-connections (53300), syntax errors, connection
loss, a non-Postgres cause. Same rule as `@unthrown/prisma` — "would you
branch on it?" — and the same payoff: a retry wrapper for 40001/40P01 is one
`recoverDefect` inspecting the cause, not an arm at every write call site.
**Reads infer `E = never`, enforced at runtime, not merely typed**: `select`,
`$count`, `db.query.*` and `refreshMaterializedView` route through
`fromSafePromise` (via `runSafeQuery`), so a `23xxx` reaching a read path —
narrowly reachable, via a `SELECT` calling a volatile function that writes —
becomes a `Defect` rather than an `Err` the type says cannot exist. That is
the trap `@unthrown/prisma` shipped in the other direction, and the runtime
half is what stops the declaration from lying; all three routes into a read
agree, `prepare(name).execute()` included (reads hand back
`PgUnthrownSafePreparedQuery`). `refreshMaterializedView` is a read **by
explicit decision** even though `REFRESH … CONCURRENTLY` can raise a real
23505 against the view's unique index — a duplicate-producing matview is a bug
in the view definition, not a domain outcome. Writes (`insert`, `update`,
`delete`, ``db.execute(sql`…`)``, `transaction`) carry the **whole**
`PgQueryError` union, unnarrowed: a `delete` still raises 23505 through an
`ON DELETE SET DEFAULT`. **Transactions**: `Ok` commits; `Err` **and**
`Defect` both roll back, and an `Err` re-surfaces typed — so there is
deliberately **no `tx.rollback()`**, because rollback _is_ returning an `Err`
(drizzle needs one only because its rollback signal is a throw). `E` unions
`PgQueryError` **whatever the callback's own channel**, since a `DEFERRABLE`
constraint is checked at `COMMIT` and the commit can raise 23505 on its own
account; nesting is a savepoint, named from a counter **shared by every
handle descended from one transaction** and claimed before anything is
issued — **not** by nesting depth, which is drizzle's scheme and collides:
two nested transactions started concurrently (which `allAsync` makes easy to
write) would both be `sp1` on the one connection, and the first
`rollback to savepoint sp1` would unwind the other's work. A callback that
hands back something that is **not a `Result`** at all — reachable only from
JS or a cast, the `async (tx) => { await tx.insert(…) }` that forgot its
`return` — takes the **undo** path too and surfaces as a `Defect` (core's
out-of-contract rule): `isOk`/`isErr` read `.tag`, which _throws_ on
`null`/`undefined`, and that TypeError used to escape before any `ROLLBACK`
was issued, releasing the pooled client with `BEGIN` still open so the next
borrower ran inside a stale transaction. A config that renders **no clauses**
(`{}`) omits them entirely rather than interpolating an empty string —
`begin ` and `set transaction ` are both syntax errors, and `setTransaction({})`
issues no statement at all. When an undo **itself** fails it takes over the
outcome as an `AggregateError`, ordered `[thrown, original]` — core's
failure-observer convention. Every driver rejection is wrapped in drizzle's
own `DrizzleQueryError` first, exactly as `PgAsyncPreparedQuery.execute`
does, so a defect names the failing **statement and params** (node-postgres'
`DatabaseError` carries `code`/`constraint`/`table`/`column`/`detail` but not
the SQL); triage is unaffected because `qualifyPgError` already reads the
SQLSTATE through one `cause` level. A query
builder is a **thenable**, not an `AsyncResult` — `await` it into a `Result`,
or end the chain in `.execute()` to reach the combinators; compilation runs
_inside_ the boundary (`prepare` is a thunk), so a `getSQL()` throw is a
defect rather than a rejection escaping a caller with no `try`/`catch`.
It **subclasses drizzle's `@internal` pg-core APIs** (`PgSelectBase`,
`PgInsertBase`, the HKT encodings, `PgSession`/`PgPreparedQuery`) rather than
wrapping the public surface, because drizzle's builders are what carry the
select-shape inference: reimplementing them would mean reimplementing
`.from().where().leftJoin().returning()`'s type-level plumbing, and wrapping
the finished promise would put the qualification boundary _after_ the
compilation throw. The cost is a real coupling to unpublished internals — the
reason the peer range stays broad and the integration suite is not optional.
`qualifyPgError` **is** a `qualify` — `(cause, defect)`, generic in the marker
type — so it drops into a `fromPromise` at a boundary of your own; `db.$client`
is the escape hatch (a stock `drizzle-orm/node-postgres` db over the same
`Pool` is one line). Tested against a **real PostgreSQL**
(`postgres:18.4-alpine`, pinned to an exact patch) started once per run by
`@testcontainers/postgresql` in a vitest `globalSetup`, with a fresh
`CREATE DATABASE` per fixture — so **this package's suite requires a running
Docker daemon**, the one departure from the monorepo's self-contained-suite
convention (`@unthrown/prisma` deliberately uses in-memory SQLite for exactly
that reason). It is justified because the behaviour under test _is_
PostgreSQL's SQLSTATE reporting, constraint naming and transaction semantics.
Hosted GitHub runners (`ubuntu-latest`, which every job in the shared
`ci-reusable.yml` uses directly, with no job `container:`) ship Docker, so CI
needs no configuration; a future move to a containerized job would need DinD
plus `TESTCONTAINERS_HOST_OVERRIDE`. The prose samples in the README, the
how-to page and `pg-core/db.ts`'s `@example` blocks are **compiled** by
`src/docs-examples.test-d.ts` — the drizzle-side sibling of core's
`doc-examples.spec.ts`. Documented in the Drizzle guide page.
