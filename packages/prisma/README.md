# @unthrown/prisma

> A [Prisma](https://www.prisma.io) Client extension for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`: `try`-prefixed
> query methods returning `AsyncResult`, with per-operation tagged errors.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/interop)** ·
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
import { unthrownPrisma } from "@unthrown/prisma";
import { PrismaClient } from "./generated/prisma/client.ts";

const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

const users = db.user.tryFindMany({ select: { id: true } });
//    ^? AsyncResult<{ id: number }[], DriverError>
//       `select` / `include` payload inference survives the wrap.

await db.user.tryCreate({ data }).match({
  ok: (user) => created(user),
  err: (e) => (e._tag === "UniqueConstraintViolation" ? conflict(e.fields) : serverError(e)),
  defect: serverError,
});
```

- **Per-operation errors** — reads (`tryFindMany` / `tryFindUnique` / `tryCount`)
  fail only with `DriverError`; writes add `UniqueConstraintViolation` (P2002)
  and `ForeignKeyViolation` (P2003); `tryFindUniqueOrThrow` / `tryUpdate` /
  `tryDelete` add `RecordNotFound` (P2025). Everything else folds into
  `DriverError` with the cause preserved.
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

The raw promise methods stay available on purpose: they are the escape hatch for
batch `$transaction([...])`, which needs unexecuted `PrismaPromise`s.

`@prisma/client` (v7+) is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
