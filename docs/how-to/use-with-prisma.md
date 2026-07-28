# Use with Prisma

> **How-to.** [`@unthrown/prisma`](/api/prisma/) is a
> [Prisma](https://www.prisma.io) Client extension that bridges queries into an
> [`AsyncResult`](../explanation/async-model) whose error channel is exactly the
> failures _that operation_ can raise.

```sh
pnpm add @unthrown/prisma unthrown
```

## Apply the extension

`$extends(unthrownPrisma)` adds `try`-prefixed variants of the model delegate
operations **alongside** the raw promise ones:

```ts
import { unthrownPrisma } from "@unthrown/prisma";
import { PrismaClient } from "./generated/prisma/client.ts";

const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

const users = db.user.tryFindMany({ select: { id: true } });
//    ^? AsyncResult<{ id: number }[], DriverError>
```

Qualification happens **once, inside the extension** — no raw `Promise`, and so no
un-triaged rejection, ever reaches your code. `select` / `include` payload
inference survives the wrap, so the success type is still narrowed by your query.

## Per-operation error unions

Each operation's error channel is only what that operation can actually raise — a
read cannot fail with a `UniqueConstraintViolation` _in the type_, so you never
write a handler for a case that can't happen.

| Method                                                                                        | Error channel                                                                       |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tryFindMany` / `tryFindUnique` / `tryFindFirst` / `tryCount` / `tryAggregate` / `tryGroupBy` | `DriverError`                                                                       |
| `tryFindUniqueOrThrow` / `tryFindFirstOrThrow`                                                | `RecordNotFound \| DriverError`                                                     |
| `tryCreate` / `tryCreateMany` / `tryCreateManyAndReturn`                                      | `UniqueConstraintViolation \| ForeignKeyViolation \| DriverError`                   |
| `tryUpsert`                                                                                   | `UniqueConstraintViolation \| ForeignKeyViolation \| DriverError`                   |
| `tryUpdate`                                                                                   | `RecordNotFound \| UniqueConstraintViolation \| ForeignKeyViolation \| DriverError` |
| `tryUpdateMany` / `tryUpdateManyAndReturn`                                                    | `UniqueConstraintViolation \| ForeignKeyViolation \| DriverError`                   |
| `tryDelete`                                                                                   | `RecordNotFound \| ForeignKeyViolation \| DriverError`                              |
| `tryDeleteMany`                                                                               | `ForeignKeyViolation \| DriverError`                                                |
| `tryPaginate(...).withCursor(...)`                                                            | `DriverError`                                                                       |

Note where `RecordNotFound` does **not** appear: `tryUpsert` (a miss _creates_) and
the batch mutations (`*Many` — zero matches is `Ok({ count: 0 })`, not an error).

The tagged errors map to Prisma's P-codes: `UniqueConstraintViolation` is `P2002`
(and carries the offending `fields`), `ForeignKeyViolation` is `P2003`, and
`RecordNotFound` is `P2025`. Everything else — connection drops, timeouts, unmapped
codes, non-Prisma causes — folds into `DriverError` with the original `cause`
preserved.

::: tip Absence is not an error
`tryFindUnique` returns `Ok(null)` for a miss — a missing row is an anticipated
value, not a failure. Reach for `tryFindUniqueOrThrow` when the absence _is_ the
error you want to model (`RecordNotFound`).
:::

## Handle the errors

Because the errors are [tagged](./model-errors), driving `match`'s `errCases` handler
with the matcher gives you an exhaustive fold — the compiler lists
exactly the cases the operation can hit:

```ts
import { P } from "unthrown";

const created = await db.user.tryCreate({ data: { email, name } });

return created.match({
  ok: (user) => resp.created(user),
  errCases: (matcher) =>
    matcher
      .with(P.tag("UniqueConstraintViolation"), (e) =>
        resp.conflict(`taken: ${e.fields.join(", ")}`),
      )
      .with(P.tag("ForeignKeyViolation"), () => resp.badRequest("unknown reference"))
      .with(P.tag("DriverError"), (e) => resp.serverError(e)),
  defect: (cause) => resp.serverError(cause),
});
// No RecordNotFound arm — a create can't raise it, and the type knows.
```

When several tags deserve the same response, **group** them in one arm rather
than reaching for a wildcard — the list stays explicit, so a new P-code still
lights the call site up:

```ts
matcher
  .with(P.tag("UniqueConstraintViolation"), P.tag("ForeignKeyViolation"), () =>
    resp.badRequest("bad write"),
  )
  .with(P.tag("DriverError"), (e) => resp.serverError(e));
```

## Transactions

`$tryTransaction` runs an interactive transaction whose callback speaks
`AsyncResult`. An `Err` anywhere in the chain triggers a **ROLLBACK** and comes
back out as the same typed error; the `try*` methods are available on the
transaction client `tx`:

```ts
const moved = db.$tryTransaction((tx) =>
  tx.account
    .tryUpdate({ where: { id: from }, data: { balance: { decrement: amount } } })
    .flatMap(() =>
      tx.account.tryUpdate({ where: { id: to }, data: { balance: { increment: amount } } }),
    ),
);
//    ^? AsyncResult<Account, RecordNotFound | UniqueConstraintViolation | ForeignKeyViolation | DriverError>
// Any Err → both updates rolled back, and the Err is in `moved`.
```

- An `Err` from the callback rolls back and re-surfaces as that same modeled error.
- A [`Defect`](../explanation/the-defect-channel) also rolls back and **stays a
  defect** — including a callback that _throws_ instead of returning an
  `AsyncResult`. A bug is never quietly downgraded into your error channel.
- Nesting is a compile error: `tx` has no `$tryTransaction`. For a batch of
  independent writes, use the raw `$transaction([...])` with the raw promise
  methods.

## Cursor pagination

`tryPaginate(query).withCursor(...)` follows the
[`prisma-extension-pagination`](https://github.com/deptyped/prisma-extension-pagination)
cursor API — same option names, same `[results, meta]` shape:

```ts
import { P } from "unthrown";

const page = await db.user
  .tryPaginate({ where: { active: true }, orderBy: { id: "asc" } })
  .withCursor({ limit: 20, after: req.query.cursor });
//    ^? Result<[User[], CursorPaginationMeta], DriverError>

page.match({
  ok: ([users, meta]) => json({ users, nextCursor: meta.endCursor, hasMore: meta.hasNextPage }),
  errCases: (matcher) => matcher.with(P.tag("DriverError"), (e) => serverError(e)),
  defect: serverError,
});
```

Three deliberate differences from upstream: a cursor pointing at a now-filtered-out
row doesn't skip the first element (folds in the fix for
[deptyped/prisma-extension-pagination#35](https://github.com/deptyped/prisma-extension-pagination/issues/35));
`before` + `limit: null` is a compile error; and the default cursor preserves the
id's type (all-digit → number/`bigint`, otherwise string). Provide `getCursor` /
`parseCursor` for composite keys.

## Raw methods and raw SQL

The bridge is additive: `db.user.findMany(...)` (the raw promise) is still there,
for exactly two things — batch `$transaction([...])` (which needs unexecuted
`PrismaPromise`s) and raw SQL. Qualify those yourself at the boundary, reusing the
exported `qualifyPrismaError`:

```ts
import { fromPromise } from "unthrown";
import { qualifyPrismaError } from "@unthrown/prisma";

const rows = fromPromise(db.$queryRaw`SELECT 1`, qualifyPrismaError);
//    ^? AsyncResult<unknown, UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound | DriverError>
```

See the [API reference](/api/prisma/) for every method's exact signature.

## Where to go next

- Serve these results over RPC: [Use with oRPC](./use-with-orpc).
- Fold them at the edge: [Handle results at the edge](./handle-results-at-the-edge).
