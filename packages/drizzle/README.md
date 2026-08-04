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

const users = (
  await db.select().from(usersTable).where(eq(usersTable.id, id))
).get();
//    ^? AsyncResult<User[], never>
//       A read has no modeled failure — a database that will not answer at
//       all is a Defect, not an absent value.
```

Writes carry the full `PgQueryError` union — a `delete` can still raise
`23505` through an `ON DELETE SET DEFAULT`, so nothing is narrowed away:

```ts
import { P } from "unthrown";

const r = await db
  .insert(usersTable)
  .values(v)
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
    .flatMap((u) => tx.insert(postsTable).values({ userId: u[0].id })),
);
// Ok → COMMIT; Err → ROLLBACK (error re-surfaces typed); Defect → ROLLBACK
```

`drizzle-orm` (`^1.0.0-rc`) and `pg` (`^8.16.0`) are peer dependencies.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
