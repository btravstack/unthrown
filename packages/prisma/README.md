# @unthrown/prisma

> A [Prisma](https://www.prisma.io) Client extension for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`: `try`-prefixed
> query methods returning `AsyncResult`, with per-operation tagged errors.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/use-with-prisma)** ·
[API Reference](https://btravstack.github.io/unthrown/api/prisma/)

```sh
pnpm add @unthrown/prisma unthrown
```

`$extends(unthrownPrisma)` adds `try*` variants of the model delegate operations
**alongside** the raw promise ones. Each returns an `AsyncResult` whose error
channel is exactly the set of P-codes that operation can produce, mapped to
tagged errors — a read cannot fail with `UniqueConstraintViolation` _in the
type_. Qualification happens once, inside the extension: no raw Promise ever
reaches your code.

```ts
import { P } from "unthrown";
import { unthrownPrisma } from "@unthrown/prisma";
import { PrismaClient } from "./generated/prisma/client.ts";

const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

const users = db.user.tryFindMany({ select: { id: true } });
//    ^? AsyncResult<{ id: number }[], DriverError>
//       `select` / `include` payload inference survives the wrap.

await db.user.tryCreate({ data }).match({
  ok: (user) => created(user),
  // every P-code `tryCreate` can raise gets an arm — cases sharing a handler
  // are grouped, so nothing is absorbed unnamed:
  errCases: (matcher) =>
    matcher
      .with(P.tag("UniqueConstraintViolation"), (e) => conflict(e.fields))
      .with(P.tag("RecordNotFound"), () => badRequest("unknown reference"))
      .with(P.tag("ForeignKeyViolation"), P.tag("DriverError"), (e) => serverError(e)),
  defect: serverError,
});
```

- **Per-operation errors** — every operation carries `DriverError`; on top of
  that:

  | Operation                                                                                     | Adds                                                                 |
  | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
  | `tryFindMany` / `tryFindUnique` / `tryFindFirst` / `tryCount` / `tryAggregate` / `tryGroupBy` | — (reads fail only in the driver)                                    |
  | `tryFindUniqueOrThrow` / `tryFindFirstOrThrow`                                                | `RecordNotFound`                                                     |
  | `tryCreate` / `tryUpsert`                                                                     | `UniqueConstraintViolation`, `ForeignKeyViolation`, `RecordNotFound` |
  | `tryUpdate`                                                                                   | `UniqueConstraintViolation`, `ForeignKeyViolation`, `RecordNotFound` |
  | `tryDelete`                                                                                   | `ForeignKeyViolation`, `RecordNotFound`                              |
  | `tryCreateMany` / `tryCreateManyAndReturn` / `tryUpdateMany` / `tryUpdateManyAndReturn`       | `UniqueConstraintViolation`, `ForeignKeyViolation`                   |
  | `tryDeleteMany`                                                                               | `ForeignKeyViolation`                                                |

  `UniqueConstraintViolation` is P2002 (and carries the offending `fields`),
  `ForeignKeyViolation` is P2003, `RecordNotFound` is P2025/P2018. Only the
  **batch** mutations are free of `RecordNotFound`: they take no nested writes,
  and zero matches is `Ok({ count: 0 })`. `tryCreate` and `tryUpsert` carry it
  because a nested `connect` can point at a row that does not exist.

- **Bugs stay bugs** — a malformed query, a client that cannot start and an
  engine panic (`PrismaClientValidationError` /
  `PrismaClientInitializationError` / `PrismaClientRustPanicError`) go to the
  **defect** channel, not into `E`. `DriverError` means the database refused
  the query — connection drops, timeouts, unmapped P-codes — which is an
  anticipated outcome worth handling.
- **`$tryTransaction`** — an interactive transaction whose callback speaks
  `AsyncResult`: an `Err` triggers a ROLLBACK and comes out as the same typed
  `Err`; a defect also rolls back and stays a defect. The `try*` methods are
  available on `tx`, and nesting is a compile error.

```ts
const moved = db.$tryTransaction((tx) =>
  tx.account
    .tryUpdate({ where: { id: from }, data: { balance: { decrement: amount } } })
    .flatMap(() =>
      tx.account.tryUpdate({ where: { id: to }, data: { balance: { increment: amount } } }),
    ),
);
// Err anywhere → both updates rolled back, and the Err is in `moved`.
```

- **`tryPaginate`** — cursor pagination in the style of
  [`prisma-extension-pagination`](https://github.com/deptyped/prisma-extension-pagination)
  (same option names, same `[results, meta]` shape), with one fix folded in: a
  cursor pointing at a record that no longer matches the query filter does not
  skip the first element of the page
  ([deptyped/prisma-extension-pagination#35](https://github.com/deptyped/prisma-extension-pagination/issues/35)).

```ts
const page = await db.user
  .tryPaginate({ where: { active: true }, orderBy: { id: "asc" } })
  .withCursor({ limit: 20, after: req.query.cursor });
// Ok([users, { hasPreviousPage, hasNextPage, startCursor, endCursor }])
// | Err(DriverError) — a malformed cursor included: it comes from a client, so
//   it stays a value you can turn into a 400, never a defect.
// `after` and `before` are mutually exclusive, and `before` + `limit: null` is
// a compile error.

// Custom serialization (composite keys, non-id cursors):
const liked = await db.like.tryPaginate({ orderBy: { postId: "asc" } }).withCursor({
  limit: 20,
  getCursor: ({ postId, userId }) => `${postId}:${userId}`,
  parseCursor: (cursor) => {
    const [postId, userId] = cursor.split(":");
    return { userId_postId: { postId: Number(postId), userId: Number(userId) } };
  },
});
```

The raw promise methods stay available on purpose: they are the escape hatch for
batch `$transaction([...])`, which needs unexecuted `PrismaPromise`s.

`@prisma/client` (v7+) is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
