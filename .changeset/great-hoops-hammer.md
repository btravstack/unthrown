---
"@unthrown/drizzle": minor
---

Add `@unthrown/drizzle`, a Drizzle ORM Postgres integration that **replaces** the
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

`drizzle-orm` and `pg` are peer dependencies (`^1.0.0-rc` and `^8.16.0`); the
internals — which subclass drizzle's `pg-core` builder tree — were verified
against `drizzle-orm@1.0.0-rc.4`.
