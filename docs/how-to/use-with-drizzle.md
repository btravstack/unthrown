# Use with Drizzle

> **How-to.** [`@unthrown/drizzle`](/api/drizzle/) **replaces** the
> [Drizzle ORM](https://orm.drizzle.team) Postgres database rather than wrapping
> one: every query resolves to an
> [`AsyncResult`](../explanation/async-model) whose error channel is exactly the
> failures _that operation_ can raise.

```sh
pnpm add @unthrown/drizzle drizzle-orm pg unthrown
```

`drizzle-orm` (`^1.0.0-rc`) and `pg` (`^8.16.0`) are peer dependencies — this
package sits on drizzle's own Postgres builder tree, so you bring your own copy
of it.

::: tip Contributing to this package
Its test suite runs against a **real PostgreSQL**, started for the run by
[testcontainers](https://testcontainers.com), so **a running Docker daemon is
required** to run it locally. That is a deliberate departure from the rest of
this monorepo, whose suites are self-contained: the behaviour under test _is_
PostgreSQL's SQLSTATE reporting, constraint naming and transaction semantics,
and a fake would only pin our own assumptions about them.
:::

## Construct the database

The call forms are **exactly** drizzle's own, so migrating a call site is an
import change:

```ts
import { drizzle } from "@unthrown/drizzle/node-postgres";

// A connection string — the factory builds the pool.
const db = drizzle("postgres://localhost/app");

// …with configuration.
const db = drizzle("postgres://localhost/app", { relations });

// A client you own.
const db = drizzle({ client: pool, relations });

// Connection details, as a string or a `pg.PoolConfig`.
const db = drizzle({ connection: { host, database, user }, relations });
```

There is deliberately **no positional-client form**: `drizzle(pool)` does not
compile, because drizzle has none either and a second spelling of
`{ client: pool }` would mean a call site no longer ports back by changing the
import.

The config carries `relations` (drizzle's `defineRelations` schema, backing
`db.query`), `logger` and `codecs`. There is no `try*` prefix to learn — every
method on the database _already_ speaks `AsyncResult`.

## Reads have no modeled failure

A read's error channel is `never`, so `get()` compiles:

```ts
import { eq } from "drizzle-orm";

const found = await db.select().from(users).where(eq(users.id, id));
//    ^? Result<{ id: number; email: string }[], never>

const rows = found.get();
```

`never` here is **not** a promise of infallibility — it is the statement that
nothing a read can hit is worth branching on. A dropped connection, a pool
timeout, a statement that will not compile: all of those are
[defects](../explanation/the-defect-channel), and `get()` panics on one, exactly
as it does anywhere else.

That is enforced at **runtime**, not merely declared: the read builders route
through `fromSafePromise`, so even a `23xxx` reaching a read path — narrowly
reachable, via a `SELECT` calling a volatile function that writes — becomes a
`Defect` rather than an `Err` the type says cannot exist. The declaration cannot
drift from the runtime, which is the trap `@unthrown/prisma` once shipped by
omitting an error from `E` that the runtime still produced.

Four builders are reads, and all three routes into them agree — `await`,
`.execute()`, and `prepare(name).execute()`:

| Operation                         | Error channel                               |
| --------------------------------- | ------------------------------------------- |
| `db.select()` / `selectDistinct…` | `never`                                     |
| `db.$count(…)`                    | `never`                                     |
| `db.query.<table>.findMany/First` | `never`                                     |
| `db.refreshMaterializedView(…)`   | `never`                                     |
| `db.insert(…)`                    | `PgQueryError`                              |
| `db.update(…)`                    | `PgQueryError`                              |
| `db.delete(…)`                    | `PgQueryError`                              |
| ``db.execute(sql`…`)``            | `PgQueryError`                              |
| `db.transaction(fn)`              | the callback's own `E`, plus `PgQueryError` |

::: warning `refreshMaterializedView` is a read by decision
`REFRESH MATERIALIZED VIEW … CONCURRENTLY` genuinely _can_ raise a `23505`
against the view's unique index. It is classified as a read anyway: a matview
whose own definition produces duplicates is a bug in that definition, not a
domain outcome a request handler branches on.
:::

## Writes carry the full constraint union

Nothing is narrowed per-operation. A `delete` can still raise `23505` through an
`ON DELETE SET DEFAULT`, and an `insert` can still raise `23503` through a
foreign key — so every write carries the same five:

| Tag                         | SQLSTATE | Payload                                  |
| --------------------------- | -------- | ---------------------------------------- |
| `UniqueConstraintViolation` | `23505`  | `constraint`, `table`, `detail`, `cause` |
| `ForeignKeyViolation`       | `23503`  | `constraint`, `table`, `detail`, `cause` |
| `NotNullViolation`          | `23502`  | **`column`**, `table`, `detail`, `cause` |
| `CheckViolation`            | `23514`  | `constraint`, `table`, `detail`, `cause` |
| `ExclusionViolation`        | `23P01`  | `constraint`, `table`, `detail`, `cause` |

`NotNullViolation` carries `column` rather than `constraint` because `23502`
names the offending column and has no constraint name of its own. Nothing parses
`detail` for a column list — PostgreSQL localizes message text, so only
`constraint` / `table` / `column` are read.

A query builder is a **thenable**, not an `AsyncResult`. To reach the
combinators, either `await` it into a `Result` first, or end the chain in
`.execute()`:

```ts
import { P } from "unthrown";

const created = await db
  .insert(users)
  .values({ id, email })
  .returning()
  .execute()
  .mapErrCases((matcher, defect) =>
    matcher
      .with(
        P.tag("UniqueConstraintViolation"),
        (e) => `taken: ${e.constraint}` as const,
      )
      .with(
        P.tag("ForeignKeyViolation"),
        P.tag("NotNullViolation"),
        P.tag("CheckViolation"),
        P.tag("ExclusionViolation"),
        (e) => defect(e),
      ),
  );
```

Every case is named. Grouping several tags in one arm keeps the list explicit,
so a sixth SQLSTATE added later lights up every call site — which is the point.
Handling all five empties the channel, and `get()` starts compiling on a write:

```ts
const inserted = (
  await db
    .insert(users)
    .values({ id, email })
    .execute()
    .recoverErrCases((matcher) =>
      matcher.with(
        P.tag("UniqueConstraintViolation"),
        P.tag("ForeignKeyViolation"),
        P.tag("NotNullViolation"),
        P.tag("CheckViolation"),
        P.tag("ExclusionViolation"),
        () => "rejected" as const,
      ),
    )
).get();
```

Folding at the edge is the same matcher, through `match`:

```ts
const r = await db.insert(users).values({ id, email });

return r.match({
  ok: (res) => resp.created(res),
  errCases: (matcher) =>
    matcher
      .with(P.tag("UniqueConstraintViolation"), (e) =>
        resp.conflict(e.constraint),
      )
      .with(P.tag("NotNullViolation"), (e) => resp.badRequest(e.column))
      .with(
        P.tag("ForeignKeyViolation"),
        P.tag("CheckViolation"),
        P.tag("ExclusionViolation"),
        () => resp.badRequest("bad write"),
      ),
  defect: (cause) => resp.serverError(cause),
});
```

## Everything infrastructural is a defect

A deadlock (`40P01`), a serialization failure (`40001`), a statement timeout
(`57014`), too many connections (`53300`), a syntax error, a dropped connection,
a non-Postgres cause: none of those reaches your error channel. They go to the
[defect channel](../explanation/the-defect-channel), with the original cause
preserved.

That is not a demotion. **A defect is not a crash**: it flows through the
pipeline untouched and is folded at the edge by `match`'s `defect` handler,
exactly where you already turn unexpected failures into a 500.

The test is _would you branch on it?_ You genuinely handle a duplicate email
(409) or a violated check (400). You do not write domain logic for a severed TCP
connection. Modelling those would force **every write call site** to carry an arm
doing precisely what the `defect` arm beside it already does.

### Retries live in one wrapper

Because `40001` and `40P01` are defects, a retry wrapper reaches for
`recoverDefect` and inspects the cause — one place in a codebase, rather than an
arm at every call site:

```ts
import type { AsyncResult } from "unthrown";

const RETRYABLE = new Set(["40001", "40P01"]);

/** The driver's SQLSTATE, through drizzle's `DrizzleQueryError` wrapper if present. */
const sqlState = (cause: unknown): string | undefined => {
  if (typeof cause !== "object" || cause === null) return undefined;
  const code: unknown = (cause as { code?: unknown }).code;
  if (typeof code === "string") return code;
  return sqlState((cause as { cause?: unknown }).cause);
};

const withRetry = <T, E>(
  run: () => AsyncResult<T, E>,
  attempts = 3,
): AsyncResult<T, E> =>
  run().recoverDefect((cause) => {
    if (attempts <= 1 || !RETRYABLE.has(sqlState(cause) ?? "")) throw cause;
    return withRetry(run, attempts - 1);
  });

const moved = await withRetry(() =>
  db.transaction((tx) => tx.update(accounts).set({ balance }).execute(), {
    isolationLevel: "serializable",
  }),
);
```

The `throw cause` is caught by the pipeline's own throw-to-defect net, so a
cause that is not retryable stays a defect with its original value — no
`try`/`catch` at the call site, and nothing leaks into `E`.

## Transactions

`Ok` commits. `Err` **and** `Defect` both roll back, and an `Err` re-surfaces
typed, so rolling back costs no information:

```ts
const moved = await db.transaction((tx) =>
  tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} - ${amount}` })
    .where(eq(accounts.id, from))
    .execute()
    .flatMap(() =>
      tx
        .update(accounts)
        .set({ balance: sql`${accounts.balance} + ${amount}` })
        .where(eq(accounts.id, to))
        .execute(),
    ),
);
//    ^? Result<…, PgQueryError>
```

- There is deliberately **no `tx.rollback()`**. Drizzle needs one because its
  rollback signal is a throw; here the signal is an `Err`, and a second spelling
  of one concept is exactly what this library does not do.
- The callback owes an `AsyncResult`, so each step ends in `.execute()` and the
  steps compose with `flatMap` (or `DoAsync().bind(…)`).
- A read inside the transaction still has `E = never` **at the callback**, so it
  composes without an arm for an error it cannot raise.
- `PgQueryError` joins the result's channel **whatever the callback's own `E`**,
  because the control statements fail on their own account: a `DEFERRABLE`
  constraint is checked at `COMMIT`, so a unique violation can be raised by the
  commit rather than by any statement the callback ran. That is why `get()` never
  compiles on a transaction's result, however clean the callback was.
- Nesting is a **savepoint**. `Ok` releases it; `Err` and `Defect` roll back to
  it, leaving the enclosing transaction open to decide for itself:

```ts
const r = await db.transaction((tx) =>
  tx
    .transaction((nested) => nested.insert(logs).values({ message }).execute())
    .recoverErrCases((matcher) =>
      matcher.with(
        P.tag("UniqueConstraintViolation"),
        P.tag("ForeignKeyViolation"),
        P.tag("NotNullViolation"),
        P.tag("CheckViolation"),
        P.tag("ExclusionViolation"),
        () => undefined,
      ),
    ),
);
// The savepoint rolled back; the outer transaction still commits.
```

`tx.setTransaction({ isolationLevel: "serializable" })` sets the characteristics
of a transaction already in progress; the `db.transaction(fn, config)` second
argument renders them into the `BEGIN`.

## The escape hatch

`db.$client` is the very client you passed (or the pool the factory built), so a
stock drizzle database over the same pool — for a migration runner, or an API
this package does not model — is one line away:

```ts
import { drizzle as drizzleStock } from "drizzle-orm/node-postgres";

const raw = drizzleStock({ client: db.$client, relations });
```

For a boundary of your own, `qualifyPgError` **is** a `qualify` in the
[qualification](../explanation/qualification) sense — the boundary injects the
`defect` helper as its second argument — so it drops straight into a
`fromPromise`:

```ts
import { fromPromise } from "unthrown";
import { qualifyPgError } from "@unthrown/drizzle";

const rows = fromPromise(
  () => pool.query("insert into users values ($1)", [id]),
  qualifyPgError,
);
//    ^? AsyncResult<pg.QueryResult, PgQueryError>
```

See the [API reference](/api/drizzle/) for every builder's exact signature.

## Where to go next

- Serve these results over RPC: [Use with oRPC](./use-with-orpc).
- Fold them at the edge: [Handle results at the edge](./handle-results-at-the-edge).
