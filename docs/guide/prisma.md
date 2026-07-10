# Prisma

[`@unthrown/prisma`](/api/prisma/) is a [Prisma](https://www.prisma.io) Client
extension that bridges queries into unthrown's [`AsyncResult`](./async-results).
Applying it with `$extends` adds `try`-prefixed variants of the model delegate
operations **alongside** the raw promise ones — each returns an `AsyncResult`
whose error channel is exactly the set of failures _that operation_ can produce,
mapped to [tagged errors](./tagged-errors).

```sh
pnpm add @unthrown/prisma unthrown
```

```ts
import { unthrownPrisma } from "@unthrown/prisma";
import { PrismaClient } from "./generated/prisma/client.ts";

const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

const users = db.user.tryFindMany({ select: { id: true } });
//    ^? AsyncResult<{ id: number }[], DriverError>
```

Qualification happens **once, inside the extension** ([Boundaries](./boundaries)):
no raw `Promise` — and so no un-triaged rejection — ever reaches your code.
`select` / `include` payload inference survives the wrap, so the success type is
still narrowed by your query.

## Per-operation error unions

The point of the bridge isn't one flat error type — it's that **each operation's
error channel is only what that operation can actually raise**. A read cannot
fail with a `UniqueConstraintViolation` _in the type_, so you never write a
handler for a case that can't happen.

| Method                                       | Error channel                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tryFindMany` / `tryFindUnique` / `tryCount` | `DriverError`                                                                       |
| `tryFindUniqueOrThrow`                       | `RecordNotFound \| DriverError`                                                     |
| `tryCreate`                                  | `UniqueConstraintViolation \| ForeignKeyViolation \| DriverError`                   |
| `tryUpdate`                                  | `RecordNotFound \| UniqueConstraintViolation \| ForeignKeyViolation \| DriverError` |
| `tryDelete`                                  | `RecordNotFound \| ForeignKeyViolation \| DriverError`                              |
| `tryPaginate(...).withCursor(...)`           | `DriverError`                                                                       |

The tagged errors map to Prisma's P-codes: `UniqueConstraintViolation` is `P2002`
(and carries the offending `fields`), `ForeignKeyViolation` is `P2003`, and
`RecordNotFound` is `P2025`. Everything else — connection drops, timeouts,
unmapped codes, non-Prisma causes — folds into `DriverError` with the original
`cause` preserved.

::: tip Absence is not an error
`tryFindUnique` returns `Ok(null)` for a miss — a missing row is an anticipated
value, not a failure. Reach for `tryFindUniqueOrThrow` when the absence _is_ the
error you want to model (`RecordNotFound`).
:::

## Handling the errors

Because the errors are [tagged](./tagged-errors), `matchTags` gives you an
exhaustive fold — the compiler lists exactly the cases the operation can hit:

```ts
import { matchTags } from "unthrown";

const created = await db.user.tryCreate({ data: { email, name } });

return matchTags(created, {
  Ok: (user) => resp.created(user),
  UniqueConstraintViolation: (e) => resp.conflict(`taken: ${e.fields.join(", ")}`),
  ForeignKeyViolation: () => resp.badRequest("unknown reference"),
  Defect: (cause) => resp.serverError(cause),
});
// No RecordNotFound arm — a create can't raise it, and the type knows.
```

Or handle it inline with `.match({ ok, err, defect })` when you don't need
per-tag branches — one call at the HTTP edge, no `try`/`catch`.

## Transactions

`$tryTransaction` runs an interactive transaction whose callback speaks
`AsyncResult`. An `Err` anywhere in the chain triggers a **ROLLBACK** and comes
back out as the same typed error; the `try*` methods are available on the
transaction client `tx`:

```ts
const moved = await db.$tryTransaction((tx) =>
  tx.account
    .tryUpdate({ where: { id: from }, data: { balance: { decrement: amount } } })
    .flatMap(() =>
      tx.account.tryUpdate({ where: { id: to }, data: { balance: { increment: amount } } }),
    ),
);
//    ^? AsyncResult<Account, RecordNotFound | UniqueConstraintViolation | ForeignKeyViolation | DriverError>
// Any Err → both updates rolled back, and the Err is in `moved`.
```

- An `Err` from the callback rolls back and re-surfaces as that same modeled
  error.
- A [`Defect`](./the-defect-channel) also rolls back and **stays a defect** — a
  bug is never quietly downgraded into your error channel.
- Nesting is a compile error: `tx` has no `$tryTransaction`. For a batch of
  independent writes, use the raw `$transaction([...])` with the raw (unexecuted)
  promise methods.

## Cursor pagination

`tryPaginate(query).withCursor(...)` follows the
[`prisma-extension-pagination`](https://github.com/deptyped/prisma-extension-pagination)
cursor API — same option names, same `[results, meta]` shape:

```ts
const page = await db.user
  .tryPaginate({ where: { active: true }, orderBy: { id: "asc" } })
  .withCursor({ limit: 20, after: req.query.cursor });
//    ^? AsyncResult<[User[], CursorPaginationMeta], DriverError>

page.match({
  ok: ([users, meta]) => json({ users, nextCursor: meta.endCursor, hasMore: meta.hasNextPage }),
  err: (e) => serverError(e),
  defect: serverError,
});
```

`meta` carries `hasPreviousPage` / `hasNextPage` / `startCursor` / `endCursor`.
The query args exclude `cursor` / `take` / `skip` (pagination owns them), and
payload inference still flows through `select` / `include`.

Three deliberate differences from upstream:

- **A cursor pointing at a now-filtered-out row doesn't skip the first element**
  of the page (folds in the fix for
  [deptyped/prisma-extension-pagination#35](https://github.com/deptyped/prisma-extension-pagination/issues/35)).
- **`before` + `limit: null` is a compile error** — Prisma's negative `take`
  can't express "everything before the cursor, unbounded."
- **The default cursor preserves the id's type** — all-digit cursors parse back
  to numbers (autoincrement ids), anything else stays a string (uuid / cuid).
  Provide `getCursor` / `parseCursor` for composite keys or a selection without
  `id`.

## The raw methods stay on purpose

The bridge is additive: `db.user.findMany(...)` (the raw promise) is still there.
That's the escape hatch for anything the extension doesn't wrap — batch
`$transaction([...])` (which needs unexecuted `PrismaPromise`s), and operations
without a `try*` variant yet (`findFirst`, `upsert`, `createMany`, `aggregate`,
`groupBy`, …). Qualify those yourself at the boundary with
[`fromPromise`](./boundaries):

```ts
import { fromPromise } from "unthrown";
import { qualifyPrismaError } from "@unthrown/prisma";

// qualifyPrismaError is exported — reuse the same P-code triage for a raw call.
const first = fromPromise(db.user.findFirst({ where: { active: true } }), qualifyPrismaError);
//    ^? AsyncResult<User | null, UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound | DriverError>
```

See the [API reference](/api/prisma/) for every method's exact signature.
