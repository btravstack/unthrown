---
"@unthrown/prisma": minor
---

Cover Prisma's batch `$transaction([...])` form in `$tryTransaction`.

`$tryTransaction` is now overloaded exactly as Prisma's own `$transaction` is —
one method, two forms — so the `try*` prefix keeps mapping one-to-one onto a
Prisma method. The batch form is the natural fit for "insert N rows atomically"
and is cheaper than the interactive one: a single round trip, with no open
transaction held across application code.

```ts
const rows = db.$tryTransaction(inputs.map((data) => db.user.create({ data })));
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
