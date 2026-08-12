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
channel is exactly the **domain** outcomes that operation can produce, mapped to
tagged errors — a read cannot fail with `UniqueConstraintViolation` _in the
type_. Qualification happens once, inside the extension: no raw Promise ever
reaches your code.

```ts
import { P } from "unthrown";
import { unthrownPrisma } from "@unthrown/prisma";
import { PrismaClient } from "./generated/prisma/client.ts";

const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

const users = db.user.tryFindMany({ select: { id: true } });
//    ^? AsyncResult<{ id: number }[], never>
//       A read has no modeled failure. `select` / `include` payload
//       inference survives the wrap.

await db.user.tryCreate({ data }).match({
  ok: (user) => created(user),
  // every case `tryCreate` can raise gets an arm — cases sharing a handler
  // are grouped, so nothing is absorbed unnamed:
  errCases: (matcher) =>
    matcher
      .with(P.tag("UniqueConstraintViolation"), (e) => conflict(e.fields))
      .with(P.tag("ForeignKeyViolation"), P.tag("RecordNotFound"), () =>
        badRequest("unknown reference"),
      ),
  // a dropped connection, a deadlock, a bug — one arm, at the edge:
  defect: serverError,
});
```

- **`E` is domain outcomes only** — things a caller did, or a legitimate state
  conflict, that your code actually branches on:

  | Operation                                                                                     | Error channel                                                        |
  | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
  | `tryFindMany` / `tryFindUnique` / `tryFindFirst` / `tryCount` / `tryAggregate` / `tryGroupBy` | `never`                                                              |
  | `tryFindUniqueOrThrow` / `tryFindFirstOrThrow`                                                | `RecordNotFound`                                                     |
  | `tryCreate` / `tryUpsert` / `tryUpdate`                                                       | `UniqueConstraintViolation \| ForeignKeyViolation \| RecordNotFound` |
  | `tryDelete`                                                                                   | `ForeignKeyViolation \| RecordNotFound`                              |
  | `tryCreateMany` / `tryCreateManyAndReturn` / `tryUpdateMany` / `tryUpdateManyAndReturn`       | `UniqueConstraintViolation \| ForeignKeyViolation`                   |
  | `tryDeleteMany`                                                                               | `ForeignKeyViolation`                                                |
  | `tryPaginate(...).withCursor(...)`                                                            | `InvalidCursor`                                                      |

  `UniqueConstraintViolation` is P2002 (409, and carries the offending
  `fields`), `ForeignKeyViolation` is P2003 (400), `RecordNotFound` is
  P2025/P2018 (404). Only the **batch** mutations are free of `RecordNotFound`:
  they take no nested writes, and zero matches is `Ok({ count: 0 })`.
  `tryCreate` and `tryUpsert` carry it because a nested `connect` can point at a
  row that does not exist.

- **Everything infrastructural is a defect** — a dropped connection, a pool
  timeout, a deadlock, an unmapped P-code, a malformed query, an engine panic.
  Nobody writes domain logic for those: they are logged and turned into a 500 by
  the one `defect` arm you already have at the edge. Putting them in `E` would
  only force every call site to carry an arm duplicating its own `defect` arm.
  (A defect is not a crash — it flows through the pipeline untouched and is
  folded at the edge like any other unmodeled failure.)

  Those four codes are the **whole** modeled set: every other P-code — `P2007`,
  `P2023`, `P2000`, `P2011`, `P2015`, … — is a defect. That matters where a
  defect is _retried_ rather than surfaced (a Temporal activity rethrows it, and
  a malformed id can never succeed on a retry). Replacing a hand-rolled
  qualifier? Diff it against these four and re-qualify the rest with
  `recoverDefect` — see
  [Migrating a hand-rolled qualifier](https://btravstack.github.io/unthrown/how-to/use-with-prisma#migrating-a-hand-rolled-qualifier).

- **`$tryTransaction`** — an interactive transaction whose callback speaks
  `AsyncResult`: an `Err` triggers a ROLLBACK and comes out as the same typed
  `Err`; a defect also rolls back and stays a defect. The `try*` methods are
  available on `tx`, and nesting is a compile error.

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
// Err anywhere → both updates rolled back, and the Err is in `moved`.
```

- **`$tryTransaction([...])`** — the same method's **batch** form: the operations
  run in one round trip, all or nothing. It takes the **raw** delegate methods,
  because Prisma's batch form needs unexecuted `PrismaPromise`s — and for the
  same reason `E` is the whole `PrismaQueryError` union rather than the
  per-operation narrowing `try*` gives.

```ts
const rows = db.$tryTransaction(inputs.map((data) => db.user.create({ data })));
//    ^? AsyncResult<User[], PrismaQueryError>
// Any constraint violation → nothing is written, and the Err is modeled.
```

- **`TransactionClient<C>`** — the type of an interactive callback's `tx`, for
  naming the parameter of a helper factored out of one:
  `type Tx = TransactionClient<typeof db>`.

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
// | Err(InvalidCursor) — the cursor is the only part of the query that came from
//   outside, so it is the only modeled failure: answer it with a 400.
// `after` and `before` are mutually exclusive, and `before` + `limit: null` is
// a compile error.

// Custom serialization (composite keys, non-id cursors):
const liked = await db.like
  .tryPaginate({ orderBy: { postId: "asc" } })
  .withCursor({
    limit: 20,
    getCursor: ({ postId, userId }) => `${postId}:${userId}`,
    parseCursor: (cursor) => {
      const [postId, userId] = cursor.split(":");
      return {
        userId_postId: { postId: Number(postId), userId: Number(userId) },
      };
    },
  });
```

The raw promise methods stay available on purpose: raw SQL goes through them, and
a batch `$tryTransaction([...])` is composed from them.

`@prisma/client` (v7+) is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
