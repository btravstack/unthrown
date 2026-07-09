---
"@unthrown/prisma": minor
---

Initial release of **@unthrown/prisma** — a Prisma Client extension that bridges
Prisma queries into unthrown's `AsyncResult`. `$extends(unthrownPrisma)` adds
`try`-prefixed variants of the model delegate operations (`tryFindMany`,
`tryFindUnique`, `tryFindUniqueOrThrow`, `tryCount`, `tryCreate`, `tryUpdate`,
`tryDelete`) alongside the raw promise ones: each returns an `AsyncResult` whose
error channel is exactly the set of P-codes that operation can produce, mapped to
tagged errors (`UniqueConstraintViolation` / `ForeignKeyViolation` /
`RecordNotFound` / `DriverError`) — with `select` / `include` payload inference
preserved. `$tryTransaction` runs an interactive transaction whose callback
speaks `AsyncResult`: an `Err` triggers a rollback and comes out as the same
typed `Err`; a defect also rolls back and stays a defect.
