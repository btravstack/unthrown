# @unthrown/drizzle

> A [Drizzle ORM](https://orm.drizzle.team) Postgres integration for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`: every query
> returns an `AsyncResult`, with Postgres integrity-constraint violations as
> tagged, modeled errors and every infrastructure failure as a `Defect`.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/use-with-drizzle)** ·
[API Reference](https://btravstack.github.io/unthrown/api/drizzle/)

```sh
pnpm add @unthrown/drizzle drizzle-orm pg unthrown
```

`drizzle({ client: pool, relations })` (from `@unthrown/drizzle/node-postgres`) builds
a `db` that _replaces_ the stock drizzle db rather than wrapping one: every
method already speaks `AsyncResult`, so there is no `try*` prefix to reach
for.

```ts
import { drizzle } from "@unthrown/drizzle/node-postgres";
import { eq } from "drizzle-orm";
import { usersTable } from "./schema.ts";

const db = drizzle({ client: pool, relations });

const found = await db.select().from(usersTable).where(eq(usersTable.id, id));
//    ^? Result<User[], never>
//       A read has no modeled failure — a database that will not answer at
//       all is a Defect, not an absent value.

const users = found.get();
//    ^? User[] — `get()` compiles precisely because the channel is empty.
```

Writes carry the full `PgQueryError` union — a `delete` can still raise
`23505` through an `ON DELETE SET DEFAULT`, so nothing is narrowed away.
A builder is a thenable, not an `AsyncResult`: reach for the combinators
either by `await`ing it first, or by ending the chain in `.execute()`:

```ts
import { P } from "unthrown";

const r = await db
  .insert(usersTable)
  .values(v)
  .execute()
  .mapErrCases((matcher, defect) =>
    matcher
      .with(P.tag("UniqueConstraintViolation"), (e) => conflict(e.constraint))
      .with(
        P.tag("ForeignKeyViolation"),
        P.tag("NotNullViolation"),
        P.tag("CheckViolation"),
        P.tag("ExclusionViolation"),
        (e) => defect(e),
      ),
  );
```

Transactions follow the `Ok`/`Err`/`Defect` rule directly — `Ok` commits,
`Err` and `Defect` both roll back, with no separate `tx.rollback()` to learn:

```ts
const r = await db.transaction((tx) =>
  tx
    .insert(usersTable)
    .values(v)
    .execute()
    .flatMap(() => tx.insert(postsTable).values(p).execute()),
);
// Ok → COMMIT; Err → ROLLBACK (error re-surfaces typed); Defect → ROLLBACK
```

`drizzle-orm` (`^1.0.0-rc`) and `pg` (`^8.16.0`) are peer dependencies.

## Contributing

This package's test suite runs against a **real PostgreSQL**, started for the
run by [testcontainers](https://testcontainers.com), so **a running Docker
daemon is required** to run `pnpm --filter @unthrown/drizzle test` locally. That
is a deliberate departure from the rest of this monorepo, whose suites are
self-contained: the behaviour under test _is_ PostgreSQL's SQLSTATE reporting,
constraint naming and transaction semantics, and a fake would only pin our own
assumptions about them.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
