---
"@unthrown/drizzle": minor
---

Transaction, CTE and error-serialisation fixes.

- **Nested transactions started concurrently on one handle no longer corrupt
  each other.** Savepoints are a stack, so
  `allAsync([tx.transaction(a), tx.transaction(b)])` could roll back or release
  the wrong savepoint — `b`'s writes vanished while it reported `Ok`, or its
  release failed with 3B001. Nested transactions on one handle now run one after
  another, in start order. Start further nesting from inside a nested callback on
  the handle that callback receives.
- **A pooled client is guarded while checked out.** A connection dropping
  mid-transaction emitted an unhandled `error` event (fatal on Node); the session
  now listens for it, and a client that errored or whose `ROLLBACK` failed is
  destroyed (`release(true)`) instead of returned to the pool.
- **A select over a writing CTE is typed and qualified as a write.**
  `db.with(db.$with("x").as(db.insert(t).values(v).returning())).select()` runs
  a real `INSERT`, but carried `E = never` and turned a 23505 into a `Defect`. It
  now carries `PgQueryError`. A CTE over raw SQL counts as writing too; a CTE over
  a plain select stays a read. `PgUnthrownSelectBase`, `PgUnthrownSelectHKT` and
  `PgUnthrownSelectBuilder` gain a trailing `TError` parameter (default `never`),
  and `db.$with` is typed as the new `PgUnthrownWithBuilder`.
- **Modeled errors no longer serialise driver detail.** `detail` (which quotes
  row values) and `cause` (the `DrizzleQueryError`, with SQL and bound params)
  are non-enumerable, so `JSON.stringify(error)` leaves them out. They are still
  readable. Never send a modeled error to a client unmapped.
- `qualifyPgError` only models an error the server reported — a SQLSTATE `code`
  **and** a `severity`. A thrown value that merely carries `code: "23505"` is a
  defect.
- The `drizzle-orm` peer range is `^1.0.0-rc.5-0`: the package imports
  `resolveNullableObjectPaths`, which only exists from rc.5.
