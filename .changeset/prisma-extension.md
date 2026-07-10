---
"@unthrown/prisma": minor
---

Initial release of **@unthrown/prisma** — a Prisma Client extension that bridges
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
