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
//    ^? AsyncResult<{ id: number }[], never>
```

Qualification happens **once, inside the extension** — no raw `Promise`, and so no
un-triaged rejection, ever reaches your code. `select` / `include` payload
inference survives the wrap, so the success type is still narrowed by your query.

## Per-operation error unions

`E` carries **only domain outcomes** — things a caller did, or a legitimate state
conflict, that your code actually branches on. Each operation's channel is
exactly what that operation can raise, so you never write a handler for a case
that can't happen:

| Method                                                                                        | Error channel                                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `tryFindMany` / `tryFindUnique` / `tryFindFirst` / `tryCount` / `tryAggregate` / `tryGroupBy` | `never`                                                              |
| `tryFindUniqueOrThrow` / `tryFindFirstOrThrow`                                                | `RecordNotFound`                                                     |
| `tryCreate` / `tryUpsert` / `tryUpdate`                                                       | `UniqueConstraintViolation \| ForeignKeyViolation \| RecordNotFound` |
| `tryDelete`                                                                                   | `ForeignKeyViolation \| RecordNotFound`                              |
| `tryCreateMany` / `tryCreateManyAndReturn`                                                    | `UniqueConstraintViolation \| ForeignKeyViolation`                   |
| `tryUpdateMany` / `tryUpdateManyAndReturn`                                                    | `UniqueConstraintViolation \| ForeignKeyViolation`                   |
| `tryDeleteMany`                                                                               | `ForeignKeyViolation`                                                |
| `tryPaginate(...).withCursor(...)`                                                            | `InvalidCursor`                                                      |

`UniqueConstraintViolation` is `P2002` (a 409, and it carries the offending
`fields`), `ForeignKeyViolation` is `P2003` (a 400), and `RecordNotFound` is
`P2025` — plus `P2018`, which says the same thing from the to-many side of a
nested write (a 404).

A **read has no modeled failure at all**. Absence is `null`, and a database that
will not answer is a defect — so `tryFindMany` is `AsyncResult<User[], never>`.

Note where `RecordNotFound` does **not** appear: the **batch** mutations (`*Many`
and their `*AndReturn` twins). Those are the only operations genuinely free of it —
they accept no nested writes, and zero matches is `Ok({ count: 0 })`, not an error.

`tryCreate` and `tryUpsert` _do_ carry it, which is worth a second look: neither
has a row of its own to miss, but a **nested `connect`** does.

```ts
db.post.tryCreate({ data: { title, author: { connect: { id: authorId } } } });
// Err(RecordNotFound) when that author does not exist — P2025.
```

::: tip Absence is not an error
`tryFindUnique` returns `Ok(null)` for a miss — a missing row is an anticipated
value, not a failure. Reach for `tryFindUniqueOrThrow` when the absence _is_ the
error you want to model (`RecordNotFound`).
:::

## Everything infrastructural is a defect

A dropped connection, a pool timeout, a deadlock, an unmapped P-code, a malformed
query, a client that could not start, an engine panic — none of those reaches your
error channel. They go to the
[defect channel](../explanation/the-defect-channel), with the original cause
preserved.

That is not a demotion. **A defect is not a crash**: it flows through the pipeline
untouched and is folded at the edge by `match`'s `defect` handler, exactly where
you already turn unexpected failures into a 500. The channel means "not worth
threading through domain code", not "fatal".

The test is simple — _would you branch on it?_ You genuinely handle a duplicate
email (409) or a missing parent row (404). You do not write domain logic for a
severed TCP connection; you log it and return a 500. Modelling it would only force
every call site to carry an arm that does the same thing as the `defect` arm
sitting right beside it:

```ts
// What modelling infrastructure failures would cost you, at EVERY call site:
errCases: (matcher) => matcher
  .with(P.tag("UniqueConstraintViolation"), (e) => resp.conflict(e.fields))
  .with(P.tag("DriverError"), (e) => resp.serverError(e)),   // ← this
defect: (cause) => resp.serverError(cause),                   // ← and this
```

::: tip The one carve-out: pagination cursors
A cursor is an **opaque string from the outside world**, turned into a query by
your `parseCursor`. A client sending garbage is anticipated input you answer with
a 400 — so it is modeled, as `InvalidCursor`. A throw out of `getCursor` (which
reads rows _you_ fetched) is a bug, and stays a defect. See
[Cursor pagination](#cursor-pagination) below.
:::

::: warning Retries
Deadlocks (`P2034`) and pool timeouts (`P2024`) are defects too, so a retry
wrapper reaches for `recoverDefect` and inspects the cause, rather than matching a
tag. That is one place in a codebase — versus an arm at every call site.
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
      .with(P.tag("ForeignKeyViolation"), P.tag("RecordNotFound"), () =>
        resp.badRequest("unknown reference"),
      ),
  defect: (cause) => resp.serverError(cause),
});
// Exactly the three cases a create can raise — no more, no fewer. Add a case to
// the union and every call site like this one stops compiling until it is
// handled. Everything else (a dropped connection, a deadlock, a bug) lands in
// the one `defect` arm.
```

When several tags deserve the same response, **group** them in one arm rather
than reaching for a wildcard — the list stays explicit, so a new P-code still
lights the call site up:

```ts
matcher.with(
  P.tag("UniqueConstraintViolation"),
  P.tag("ForeignKeyViolation"),
  P.tag("RecordNotFound"),
  () => resp.badRequest("bad write"),
);
```

## Transactions

`$tryTransaction` runs an interactive transaction whose callback speaks
`AsyncResult`. An `Err` anywhere in the chain triggers a **ROLLBACK** and comes
back out as the same typed error; the `try*` methods are available on the
transaction client `tx`:

```ts
const moved = db.$tryTransaction((tx) =>
  tx.account
    .tryUpdate({
      where: { id: from },
      data: { balance: { decrement: amount } },
    })
    .flatMap(() =>
      tx.account.tryUpdate({
        where: { id: to },
        data: { balance: { increment: amount } },
      }),
    ),
);
//    ^? AsyncResult<Account, RecordNotFound | UniqueConstraintViolation | ForeignKeyViolation>
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
//    ^? Result<[User[], CursorPaginationMeta], InvalidCursor>

page.match({
  ok: ([users, meta]) =>
    json({ users, nextCursor: meta.endCursor, hasMore: meta.hasNextPage }),
  errCases: (matcher) =>
    matcher.with(P.tag("InvalidCursor"), () => badRequest("bad cursor")),
  defect: serverError,
});
```

Four deliberate differences from upstream: a cursor pointing at a now-filtered-out
row doesn't skip the first element (folds in the fix for
[deptyped/prisma-extension-pagination#35](https://github.com/deptyped/prisma-extension-pagination/issues/35));
`after` and `before` are mutually exclusive (a page runs in one direction, and
passing both used to silently drop `after`); `before` + `limit: null` is a compile
error; and the default cursor preserves the id's type (all-digit → number/`bigint`,
otherwise string). Provide `getCursor` / `parseCursor` for composite keys.

A malformed cursor is a modeled `InvalidCursor` rather than a defect — the one
place a Prisma validation error is treated as anticipated input, because the
cursor comes from the client rather than from your code. A throw out of
`getCursor`, which reads rows the query just returned, is a bug and stays a
defect.

## Raw methods and raw SQL

The bridge is additive: `db.user.findMany(...)` (the raw promise) is still there,
for exactly two things — batch `$transaction([...])` (which needs unexecuted
`PrismaPromise`s) and raw SQL. Qualify those yourself at the boundary, reusing the
exported `qualifyPrismaError`:

```ts
import { fromPromise } from "unthrown";
import { qualifyPrismaError } from "@unthrown/prisma";

const rows = fromPromise(db.$queryRaw`SELECT 1`, qualifyPrismaError);
//    ^? AsyncResult<unknown, UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound>
```

`qualifyPrismaError` **is** a `qualify` — the boundary injects the `defect`
helper as its second argument, so the same triage you get inside the extension
(including routing the three bug-shaped Prisma errors to the defect channel)
applies to your own boundaries for free.

See the [API reference](/api/prisma/) for every method's exact signature.

## Where to go next

- Serve these results over RPC: [Use with oRPC](./use-with-orpc).
- Fold them at the edge: [Handle results at the edge](./handle-results-at-the-edge).
