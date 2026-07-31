---
"@unthrown/prisma": minor
---

Fix an unsound error channel on `tryCreate` / `tryUpsert`, route Prisma's
bug-shaped errors to the defect channel, and make `after`/`before` mutually
exclusive.

**`tryCreate` and `tryUpsert` now carry `RecordNotFound`.** A nested `connect`
pointing at a record that does not exist raises `P2025`, even though neither
operation has a row of its own to miss:

```ts
db.post.tryCreate({ data: { title, author: { connect: { id: 999 } } } });
// Err(RecordNotFound) — P2025
```

Their unions previously excluded it, so the runtime produced an error the type
said was impossible. An exhaustive `mapErrCases` over the declared union then had
no arm for the value that arrived, the matcher threw `NonExhaustiveError`, and
the throw-to-defect net turned a modeled database failure into a `Defect`.
`P2018` — the same failure reported from the to-many side of a nested write —
now maps to `RecordNotFound` too, instead of falling through to `DriverError`.
The **batch** mutations (`tryCreateMany` / `tryUpdateMany` and their `*AndReturn`
twins) are unchanged: they accept no nested writes, so they remain genuinely free
of `RecordNotFound`.

**Prisma's non-query errors now take the defect channel.**
`PrismaClientValidationError` (a malformed query — unreachable without casting
the `Prisma.Exact` args away), `PrismaClientInitializationError` and
`PrismaClientRustPanicError` are bugs and environment faults, not anticipated
outcomes, so they no longer land in `E` as `DriverError`. `DriverError` now means
what it says: the database refused the query — connection drops, timeouts,
unmapped P-codes. `PrismaClientUnknownRequestError` deliberately stays a
`DriverError`. Cursor pagination keeps one carve-out: a validation error out of
`withCursor` remains a modeled `DriverError`, because the cursor is an opaque
string from a client rather than code you wrote.

**`withCursor`'s `after` and `before` are now mutually exclusive.** Passing both
type-checked and silently ignored `after`.

Breaking, but shipped as a minor: `qualifyPrismaError` now takes the injected
`defect` helper as a second argument. It is a `qualify`, so passing it to a
boundary is unchanged (`fromPromise(db.$queryRaw\`…\`, qualifyPrismaError)`);
only direct invocation needs updating. Handling the widened create/upsert unions
is a compile error at every call site until each new case is named — which is
the point.
