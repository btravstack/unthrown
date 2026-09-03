# @unthrown/* satellite packages

Contents: [Testing: @unthrown/vitest](#testing-unthrownvitest) ·
[Linting: @unthrown/oxlint](#linting-unthrownoxlint) ·
[Prisma](#prisma-unthrownprisma) · [Drizzle](#drizzle-unthrowndrizzle) ·
[oRPC](#orpc-unthrownorpc) ·
[Validation: @unthrown/standard-schema](#validation-unthrownstandard-schema) ·
[Interop bridges](#interop-bridges-effect-neverthrow-boxed)

Every satellite takes core (`unthrown`) as a peer/`workspace:^` dependency —
never pin core exactly (dual-copy hazard with `isResult`'s `instanceof`).

## Testing: @unthrown/vitest

Importing the package registers matchers via `expect.extend` (its one
import-time side effect) and a module-level `afterEach`.

| matcher                                  | asserts                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toBeOk()` / `toBeOkWith(value)`         | Ok / Ok with deep-equal value                                                                                                                       |
| `toBeErr()` / `toBeErrWith(error)`       | Err / Err with deep-equal error                                                                                                                     |
| `toBeErrTagged(tag, payload?)`           | Err carrying a TaggedError with `_tag === tag`; optional payload is deep-compared (exact for a plain object, partial for `expect.objectContaining`) |
| `toBeDefect()` / `toBeDefectWith(cause)` | Defect / Defect with deep-equal `cause` (`unknown` — asymmetric matchers work: `expect.any(TypeError)`)                                             |

They detect a thenable `AsyncResult` and await internally:

```ts
await expect(asyncResult).toBeErrTagged("NotFound", { id: "42" });
```

A forgotten `await` on an async assertion fails the test at its end
(`failOnForgottenAwait`, auto-registered), naming the pending matchers and the
call site that created them (full stack on the error's `cause`). Manual
wiring exports: the seven raw matcher functions, `failOnForgottenAwait`, and the
`UnthrownMatchers` type.

## Linting: @unthrown/oxlint

An oxlint JS plugin (peer `oxlint`). Eight rules. The type-shaped ones
(`no-ambiguous-error-type`, `prefer-async-result`, `no-unhandled-result`,
`no-async-result-race`, `no-catch-all-pattern`) resolve bindings by scope analysis, so they only fire
on unthrown's own `Result` — another library's is left alone. Three are keyed
on a name or shape instead, and need no import to resolve:
`no-unused-matcher` (the `…Cases` method names), `no-get-or-throw` (a
zero-argument `.getOrThrow()` member call), and `no-throw` (the language
statement itself — it reports every `throw`, in any file).

**Recommended preset:**

- `no-ambiguous-error-type` — bans `unknown`/`any`/`Error`/`{}`/primitive
  keywords in `E` (annotations and `returnType<R>()` pins inside `mapErrCases`).
- `prefer-async-result` — reports `Promise<Result<T, E>>` in favour of
  `AsyncResult<T, E>`; the autofix adds the `AsyncResult` specifier to an
  existing `unthrown` import when needed (no autofix on `async` function return annotations or
  function-type return positions — those must stay `Promise`).
- `no-unhandled-result` — flags a bare expression statement dropping a
  `Result` (syntactic; a dropped method chain is out of scope).
- `no-async-result-race` — flags a sibling `AsyncResult` construction while an
  earlier binding in the same statement list is still unconsumed: construction
  is eager, so the sibling-`const` sequence races. Chaining and the one-statement
  join (`allAsync([a, b])`) are exempt; manual start-both-await-both is
  reported — its sanctioned spelling is `allAsync`, and a deliberate site
  carries a targeted `oxlint-disable` with a reason.
- `no-catch-all-pattern` — reports `P._` (and ts-pattern's `P.any`); self-exempts
  when an in-file `Result` annotation proves `E` is a single non-union type or
  an unresolved generic; unprovable keep-the-wildcard sites carry a targeted
  `oxlint-disable` with a reason.
- `no-unused-matcher` — reports a `…Cases` callback (or `match`'s `errCases`
  handler) whose matcher parameter is absent or never read, and a second
  `match(...)` built in the callback's own body — a borrowed builder matches
  whatever value it closed over, not the error. No escape hatch.

**Opt-in (not in the preset):**

- `no-get-or-throw` — reports `getOrThrow()` (a zero-argument member call, so
  Effect's one-argument `Option.getOrThrow(o)` is untouched). It throws the
  modeled error, abandoning errors-as-values at the last step; fold with
  `recoverErrCases` + `get`. Legitimate in tests — exempt them with an oxlint
  `overrides` entry, not a rule option.
- `no-throw` — reports every `throw` statement. For a codebase that has
  committed to errors-as-values end to end: a modeled failure is `Err(...)`,
  an unmodeled one reaches the defect channel through a boundary or the
  injected `defect(cause)`, and a genuinely deliberate `throw` (a framework
  that reads the thrown value) carries a targeted `oxlint-disable` with a
  reason. Opt-in because it bans a core language statement — but the only way
  to enforce the ban, oxlint having no `no-restricted-syntax`.
- `prefer-pre-lifted` — reports `.toAsync()` on a freshly constructed
  `Ok(...)`/`Err(...)`; `OkAsync(...)`/`ErrAsync(...)` are what unthrown ships
  for that. The receiver is the whole test, so `.toAsync()` on a `Result` that
  already exists is never touched. Autofixable, adding the specifier to the
  existing `unthrown` import. Opt-in because it is a spelling preference, not a
  thesis about correctness.

## Prisma: @unthrown/prisma

Peer `@prisma/client` ^7 (node >= 20.19). A client extension:

```ts
import { unthrownPrisma } from "@unthrown/prisma";
const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

db.user.tryFindUniqueOrThrow({ where: { id } });
// AsyncResult<User, RecordNotFound>

db.user.tryFindMany();
// AsyncResult<User[], never> — a read has NO modeled failure
```

- `try*` variants of all seventeen model delegate operations. `E` carries only
  **domain outcomes**: `UniqueConstraintViolation` (P2002, 409),
  `ForeignKeyViolation` (P2003, 400), `RecordNotFound` (P2025 _and_ P2018,
  404). Only the **batch** mutations (`createMany` / `updateMany` and their
  `*AndReturn` twins) are free of `RecordNotFound` — they take no nested
  writes. `create` and `upsert` DO carry it: a nested `connect` can point at a
  row that does not exist.
- **Everything infrastructural is a defect** — dropped connections, pool
  timeouts, deadlocks, unmapped P-codes, malformed queries, engine panics.
  There is no `DriverError` class. Nobody branches on those in domain code, so
  modelling them would only make every call site carry an arm duplicating its
  own `defect` arm.
- `$tryTransaction(cb)` — interactive transaction whose callback speaks
  `AsyncResult`: an `Err` rolls back and re-surfaces typed; a defect (throwing
  callback included) rolls back and stays a defect. `TransactionClient<C>`
  names the callback's `tx` for a helper factored out of it.
- `$tryTransaction([...])` — the batch form, one round trip, all or nothing. It
  takes the **raw** delegate methods (Prisma's batch needs unexecuted
  `PrismaPromise`s), so `E` is the whole `PrismaQueryError` union rather than
  the per-operation narrowing. A tuple keeps positional types; a dynamic array
  collapses to a list.
- `tryPaginate(...).withCursor(...)` — cursor pagination; its `E` is
  `InvalidCursor` (the cursor is the only part of the query that came from
  outside). `after` and `before` are mutually exclusive.
- `qualifyPrismaError` — the exported qualify, for hand-rolled boundaries.
- Raw methods remain the escape hatch for raw SQL, and are what a batch
  `$tryTransaction([...])` is composed from.

## Drizzle: @unthrown/drizzle

Peers `drizzle-orm` ^1.0.0-rc and `pg` ^8.16.0. Unlike the Prisma extension this
**replaces** the stock database rather than adding to it — every method already
speaks `AsyncResult`, so there is **no `try*` prefix**, and migrating a call
site is an import change:

```ts
import { drizzle } from "@unthrown/drizzle/node-postgres";

const db = drizzle({ client: pool, relations });
// also: drizzle(connectionString), drizzle(connectionString, config),
//       drizzle({ connection }). There is NO positional drizzle(pool) form.

const rows = (await db.select().from(users)).get();
// awaiting the builder yields Result<User[], never>, so get() compiles.
// `.execute()` is what returns an AsyncResult.
```

- A query builder is a **thenable, not an `AsyncResult`**. To reach the
  combinators, `await` it into a `Result` first, or end the chain in
  `.execute()`: `db.insert(t).values(v).execute().mapErrCases(…)`.
- **Reads infer `E = never`** — `select`, `$count`, `db.query.*`,
  `refreshMaterializedView`, `prepare(name).execute()` included. Enforced at
  runtime (they route through `fromSafePromise`), so a stray `23xxx` on a read
  path becomes a `Defect`, never an `Err` the type denies. `never` does not mean
  infallible: `get()` still panics on a defect.
- **Writes carry the whole `PgQueryError` union**, unnarrowed —
  `insert`, `update`, `delete`, ``db.execute(sql`…`)``, `transaction`:
  `UniqueConstraintViolation` (23505), `ForeignKeyViolation` (23503),
  `NotNullViolation` (23502 — carries `column`, not `constraint`),
  `CheckViolation` (23514), `ExclusionViolation` (23P01).
- **Everything else is a defect** — deadlock (40P01), serialization failure
  (40001), statement timeout (57014), too many connections (53300), syntax
  errors, connection loss, non-Postgres causes. Retry with one `recoverDefect`
  wrapper inspecting the cause, not an arm at every write call site.
- The cause a defect carries is drizzle's own `DrizzleQueryError` (as in stock
  drizzle): it names the failing `query` and its `params`, with the driver's
  error one level down under `.cause`. Read a SQLSTATE through that level.
- `db.transaction(fn)` — `Ok` commits; `Err` **and** `Defect` roll back, and an
  `Err` re-surfaces typed. There is deliberately **no `tx.rollback()`**:
  rollback _is_ returning an `Err`. `PgQueryError` joins the result's channel
  whatever the callback's own `E` (a `DEFERRABLE` constraint is checked at
  `COMMIT`), so `get()` never compiles on a transaction. Nesting is a savepoint.
- `qualifyPgError` — the exported qualify, for hand-rolled boundaries.
- `db.$client` is the escape hatch: a stock `drizzle-orm/node-postgres` db over
  the same `Pool` is one line.

## oRPC: @unthrown/orpc

Peers `@orpc/client` + optional `@orpc/server` (^2.0.0-beta). Mapping: `Ok` ↔
output, `Err` ↔ returned _inferable_ `ORPCError` (declared via `.errors({...})`
or returned as a value), `Defect` ↔ everything else (collapses to
`INTERNAL_SERVER_ERROR` on the wire). Three entry points, no root export:

- `@unthrown/orpc/server` — `handlerResult(fn)` adapts a `Result`-returning
  handler; `Err` must be an `ORPCError` (do the `mapErrCases` into
  `errors.CODE(...)` at the endpoint); a `Defect` rethrows its cause. The
  callback may be async (an elimination edge, exempt like `match`).
- `@unthrown/orpc/extensions/result` — opt-in `.result()` builder method
  (side-effectful import: prototype patches + module augmentation).
- `@unthrown/orpc/client` — `fromCall(promise)` lifts one call;
  `createResultClient(client)` wraps a whole router. `E` is the raw inferable
  `ORPCError` union discriminated by `code` — match with
  `.with({ code: "NOT_FOUND" }, …)`, not `P.tag`.
- Event-iterator (streaming) procedures are out of scope — use the raw client.

## Validation: @unthrown/standard-schema

Bridges any Standard Schema validator (Zod, Valibot, ArkType) to `Result`:

- `fromSchema(schema)` → `(input) => Result<Output, SchemaIssues>`
- `fromSchemaAsync(schema)` → `(input) => AsyncResult<Output, SchemaIssues>`

Both are **curried** — build the parser once, call it per input:

```ts
const parseUser = fromSchema(userSchema);
parseUser(input); // Result<User, SchemaIssues>
```

`fromSchema` throws a `TypeError` if the schema turns out to validate
asynchronously — use `fromSchemaAsync` for those.

The validation issues are the modeled `E` — no throwing parse.

## Interop bridges (effect, neverthrow, boxed)

Thin `to*`/`from*` bridges. The shape rule: **does the neighbour have a defect
channel?**

- `@unthrown/effect` — Effect has one (`Cause.die`), so `Result ↔ Exit` is a
  bijection: `toExit`/`fromExit` (a die-cause defect dominates), plus
  `toEffect`/`fromEffect` and `toEither`/`fromEither` (`toEither` has no
  defect target, so it takes a mandatory `onDefect`).
- `@unthrown/neverthrow` — no defect channel: `fromNeverthrow` /
  `fromNeverthrowAsync` (only Ok/Err come in); `toNeverthrow` /
  `toNeverthrowAsync` take a **mandatory** `onDefect: (cause) => E` (forced
  triage; there is no one-arg form).
- `@unthrown/boxed` — same rule (peer is `@bloodyowl/boxed`, the maintained
  scope): `fromBoxed` / `fromBoxedFuture`; `toBoxed` / `toBoxedFuture` with
  mandatory `onDefect`.

The async names are deliberately asymmetric (`toNeverthrowAsync` vs
`toBoxedFuture`) — each names the neighbour's own async type.
