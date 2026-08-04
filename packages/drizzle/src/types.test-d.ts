// Type-level test suite. These assertions have no runtime; they are checked by
// `tsc` (the `typecheck` script runs this file through `tsconfig.test-d.json`,
// which relaxes the unused-locals rules so throwaway assertion bindings are
// allowed). A failing assertion is a compile error.
//
// `Expect<Equal<A, B>>` is a hard error when `A` and `B` differ; `@ts-expect-error`
// guards the cases that must NOT compile.
//
// What this file exists to defend: **the per-operation error channel**. Reads
// declare `E = never` and writes declare the full `PgQueryError` union, and both
// halves have to stay exactly true. Over-narrowing is not a cosmetic slip — it
// is the trap `@unthrown/prisma` shipped, where a write's `E` omitted an error
// the runtime still produced, so a type-exhaustive `mapErrCases` found no
// matching case, threw `NonExhaustiveError`, and the modeled error *silently
// became a defect*. Under-widening is the mirror: an `E` nobody can ever
// receive forces a dead arm at every call site. The assertions below pin both
// directions for every entry point, and for all three routes into a query
// (`await`, `execute()`, and `prepare(name).execute()` — the last being the one
// that was quietly wrong until `UnthrownPgSafePreparedQuery` landed).

import { integer, pgMaterializedView, pgTable, text } from "drizzle-orm/pg-core";
import { defineRelations } from "drizzle-orm/relations";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { sql } from "drizzle-orm/sql/sql";
import pg from "pg";
import { type AsyncResult, type ErrOf, type OkOf, P, type Result } from "unthrown";

import type {
  CheckViolation,
  ExclusionViolation,
  ForeignKeyViolation,
  NotNullViolation,
  PgQueryError,
  UniqueConstraintViolation,
} from "./errors.js";
import type { NodePgUnthrownDatabase } from "./node-postgres/driver.js";
import { drizzle } from "./node-postgres/driver.js";

// --- assertion helpers -------------------------------------------------------

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * The error channel of whatever an `async` thunk resolves to.
 *
 * Deliberately routed through a real `await` (`Awaited<ReturnType<…>>` of an
 * async arrow) rather than `Awaited<typeof builder>`: a query builder is a
 * hand-rolled thenable, and reading its channel off the builder type would test
 * the shape of `ResultThen` instead of what an awaiting caller actually gets.
 */
type ErrChannel<F extends () => Promise<unknown>> = ErrOf<Awaited<ReturnType<F>>>;
/** The success channel of whatever an `async` thunk resolves to. */
type OkChannel<F extends () => Promise<unknown>> = OkOf<Awaited<ReturnType<F>>>;

// --- fixtures ----------------------------------------------------------------

const users = pgTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
});

const posts = pgTable("posts", {
  id: integer("id").primaryKey(),
  authorId: integer("author_id").notNull(),
});

const userCounts = pgMaterializedView("user_counts", {
  email: text("email").notNull(),
  total: integer("total").notNull(),
}).as(sql`select "email", count(*) as "total" from "users" group by "email"`);

const relations = defineRelations({ users, posts });

declare const pool: pg.Pool;

// The database under test. Built by *calling* the factory rather than by
// reading `ReturnType<typeof drizzle>`: `drizzle` is three overloads, and
// `ReturnType` silently picks the last one — which would type `$client` as
// `pg.Pool` even for a call that passed something else. A call expression runs
// real overload resolution, so the binding below is the type a consumer writing
// `drizzle({ client: pool, relations })` actually holds.
const db = drizzle({ client: pool, relations });

// --- the factory's call forms ------------------------------------------------

// The client overload keeps the *caller's* client type on `$client`, and the
// relational schema flows into the database's type parameter.
type _dbFromClient = Expect<
  Equal<typeof db, NodePgUnthrownDatabase<typeof relations> & { $client: pg.Pool }>
>;

// A connection string (and the `{ connection }` object form) has the factory
// build the pool, so `$client` is a `pg.Pool` it owns.
const dbFromString = drizzle("postgres://localhost/app");
type _dbFromString = Expect<
  Equal<typeof dbFromString, NodePgUnthrownDatabase & { $client: pg.Pool }>
>;

const dbFromConnection = drizzle({ connection: "postgres://localhost/app", relations });
type _dbFromConnection = Expect<
  Equal<typeof dbFromConnection, NodePgUnthrownDatabase<typeof relations> & { $client: pg.Pool }>
>;

// There is deliberately no positional-client form — drizzle has none, and a
// second spelling of `{ client: pool }` would mean a call site no longer ports
// back by changing the import.
// @ts-expect-error — a bare client is not a call form.
drizzle(pool);

// --- reads: the error channel is empty ---------------------------------------
//
// `get()` is typed `this: Result<T, never>`, so every `.get()` below is itself
// an assertion: it stops compiling the moment a read grows a modeled error.

const selectRead = async () => await db.select().from(users);
type _selectErr = Expect<Equal<ErrChannel<typeof selectRead>, never>>;
type _selectOk = Expect<Equal<OkChannel<typeof selectRead>, { id: number; email: string }[]>>;

const selectGet = async () => (await db.select().from(users)).get();
type _selectGet = Expect<
  Equal<Awaited<ReturnType<typeof selectGet>>, { id: number; email: string }[]>
>;

// `execute()` is the second route into the same query and must agree.
const selectExecute = async () => await db.select().from(users).where(eq(users.id, 1)).execute();
type _selectExecuteErr = Expect<Equal<ErrChannel<typeof selectExecute>, never>>;

const countRead = async () => (await db.$count(users)).get();
type _count = Expect<Equal<Awaited<ReturnType<typeof countRead>>, number>>;

const countExecute = async () => await db.$count(users, eq(users.id, 1)).execute();
type _countErr = Expect<Equal<ErrChannel<typeof countExecute>, never>>;

const findMany = async () => await db.query.users.findMany();
type _findManyErr = Expect<Equal<ErrChannel<typeof findMany>, never>>;

const findFirstGet = async () => (await db.query.users.findFirst()).get();
type _findFirstOk = Expect<
  Equal<Awaited<ReturnType<typeof findFirstGet>>, { id: number; email: string } | undefined>
>;

const refresh = async () => await db.refreshMaterializedView(userCounts);
type _refreshErr = Expect<Equal<ErrChannel<typeof refresh>, never>>;

const refreshConcurrently = async () => await db.refreshMaterializedView(userCounts).concurrently();
type _refreshConcurrentlyErr = Expect<Equal<ErrChannel<typeof refreshConcurrently>, never>>;

// No `Equal` here on purpose: `get()` returns the *unwrapped* value, so an
// `ErrOf` of it would be `never` whatever the channel had been — a vacuous
// assertion. The call itself is the assertion (`this: Result<T, never>`).
const refreshGet = async () => (await db.refreshMaterializedView(userCounts)).get();

// --- reads: a PREPARED read stays empty too ----------------------------------
//
// The third route into a read, and the one that was silently wrong: `prepare()`
// used to hand back the qualifying `UnthrownPgPreparedQuery`, so a prepared
// read reopened the error channel the builder had just declared closed. Reads
// now return `UnthrownPgSafePreparedQuery`, whose `execute()` routes through
// `fromSafePromise`. These pin all three preparable read paths — `$count` is
// the fourth read but exposes no `prepare()` at all (nor does drizzle's own
// `PgCountBuilder`), so it has nothing to reopen.

const preparedSelect = async () =>
  (await db.select().from(users).prepare("p_select").execute()).get();
type _preparedSelectOk = Expect<
  Equal<Awaited<ReturnType<typeof preparedSelect>>, { id: number; email: string }[]>
>;

const preparedSelectErr = async () => await db.select().from(users).prepare("p_select2").execute();
type _preparedSelectErr = Expect<Equal<ErrChannel<typeof preparedSelectErr>, never>>;

const preparedFindMany = async () => await db.query.users.findMany().prepare("p_rqb").execute();
type _preparedFindManyErr = Expect<Equal<ErrChannel<typeof preparedFindMany>, never>>;

const preparedRefresh = async () =>
  await db.refreshMaterializedView(userCounts).prepare("p_refresh").execute();
type _preparedRefreshErr = Expect<Equal<ErrChannel<typeof preparedRefresh>, never>>;

// --- writes: the full constraint union ---------------------------------------

const insertWrite = async () => await db.insert(users).values({ id: 1, email: "a@b.c" });
type _insertErr = Expect<Equal<ErrChannel<typeof insertWrite>, PgQueryError>>;

// Spelled out once, member by member, so that dropping a tag from the union
// fails here rather than only where a matcher happens to name it.
type _pgQueryErrorMembers = Expect<
  Equal<
    PgQueryError,
    | UniqueConstraintViolation
    | ForeignKeyViolation
    | NotNullViolation
    | CheckViolation
    | ExclusionViolation
  >
>;

const insertGet = async () => {
  const r = await db.insert(users).values({ id: 1, email: "a@b.c" });
  // @ts-expect-error — the error channel is non-empty, so `get()` must not compile.
  r.get();
  return r;
};

const updateWrite = async () =>
  await db.update(users).set({ email: "a@b.c" }).where(eq(users.id, 1));
type _updateErr = Expect<Equal<ErrChannel<typeof updateWrite>, PgQueryError>>;

const deleteWrite = async () => await db.delete(users).where(eq(users.id, 1));
type _deleteErr = Expect<Equal<ErrChannel<typeof deleteWrite>, PgQueryError>>;

const returningWrite = async () =>
  await db.insert(users).values({ id: 1, email: "a@b.c" }).returning();
type _returningErr = Expect<Equal<ErrChannel<typeof returningWrite>, PgQueryError>>;
type _returningOk = Expect<
  Equal<OkChannel<typeof returningWrite>, { id: number; email: string }[]>
>;

// `db.execute(sql`…`)` is a write by this package's ruling: an arbitrary
// statement can violate a constraint, so it carries the union.
const rawWrite = async () => await db.execute(sql`insert into users values (1, 'a@b.c')`);
type _rawErr = Expect<Equal<ErrChannel<typeof rawWrite>, PgQueryError>>;

// The mirror of the prepared-read block: a prepared *write* must keep its
// union. `asSafe()` is applied by the read builders only, and this is what
// would catch it leaking onto a write.
const preparedInsert = async () =>
  await db.insert(users).values({ id: 1, email: "a@b.c" }).prepare("p_insert").execute();
type _preparedInsertErr = Expect<Equal<ErrChannel<typeof preparedInsert>, PgQueryError>>;

// --- the matcher: exhaustiveness is enforced ---------------------------------

const missingArm = async () => {
  const r = await db.insert(users).values({ id: 1, email: "a@b.c" });
  return r.mapErrCases((m) =>
    // @ts-expect-error — ExclusionViolation is unhandled, so the builder is not
    // exhaustive. The directive sits on the callback's returned expression, which
    // is where the `ExhaustiveMatch` constraint is reported, not on the call.
    m
      .with(P.tag("UniqueConstraintViolation"), () => "dup" as const)
      .with(P.tag("ForeignKeyViolation"), () => "fk" as const)
      .with(P.tag("NotNullViolation"), () => "null" as const)
      .with(P.tag("CheckViolation"), () => "check" as const),
  );
};

const exhaustive = async () => {
  const r = await db.insert(users).values({ id: 1, email: "a@b.c" });
  return r.mapErrCases((m) =>
    m
      .with(P.tag("UniqueConstraintViolation"), () => "dup" as const)
      .with(P.tag("ForeignKeyViolation"), () => "fk" as const)
      .with(P.tag("NotNullViolation"), () => "null" as const)
      .with(P.tag("CheckViolation"), () => "check" as const)
      .with(P.tag("ExclusionViolation"), () => "exclusion" as const),
  );
};
type _exhaustiveErr = Expect<
  Equal<ErrChannel<typeof exhaustive>, "dup" | "fk" | "null" | "check" | "exclusion">
>;

// A branch that returns the injected `defect(…)` marker contributes nothing to
// the outgoing error type — the marker is subtracted (`Exclude<…, Defect>`),
// exactly as at a `qualify` boundary. Only the one modeled arm survives.
const defectBranch = async () => {
  const r = await db.insert(users).values({ id: 1, email: "a@b.c" });
  return r.mapErrCases((m, defect) =>
    m
      .with(P.tag("UniqueConstraintViolation"), () => "email already taken" as const)
      .with(
        P.tag("ForeignKeyViolation"),
        P.tag("NotNullViolation"),
        P.tag("CheckViolation"),
        P.tag("ExclusionViolation"),
        (e) => defect(e),
      ),
  );
};
type _defectBranchErr = Expect<Equal<ErrChannel<typeof defectBranch>, "email already taken">>;

// Recovering every arm empties the channel, which is what makes `get()` legal
// on a write once it has been handled — the errors-as-values payoff, pinned.
const recovered = async () => {
  const r = await db.insert(users).values({ id: 1, email: "a@b.c" });
  const handled = r.recoverErrCases((m) =>
    m
      .with(P.tag("UniqueConstraintViolation"), () => "conflict" as const)
      .with(
        P.tag("ForeignKeyViolation"),
        P.tag("NotNullViolation"),
        P.tag("CheckViolation"),
        P.tag("ExclusionViolation"),
        () => "rejected" as const,
      ),
  );
  // Compiles only because every arm was recovered: `get()` is `this:
  // Result<T, never>`, and the write's channel started as the full union.
  handled.get();
  return handled;
};
type _recoveredErr = Expect<Equal<ErrChannel<typeof recovered>, never>>;
type _recoveredOk = Expect<
  Equal<OkChannel<typeof recovered>, pg.QueryResult<never> | "conflict" | "rejected">
>;

// --- transactions ------------------------------------------------------------
//
// `transaction` unions the callback's own error channel with `PgQueryError`,
// because the control statements can fail on their own account — a `DEFERRABLE`
// constraint is checked at `COMMIT`, so a unique violation can be raised by the
// commit rather than by any statement the callback ran.

declare const boom: AsyncResult<number, "boom">;

const txDomainError = async () => await db.transaction(() => boom);
type _txDomainErr = Expect<Equal<ErrChannel<typeof txDomainError>, "boom" | PgQueryError>>;
type _txDomainOk = Expect<Equal<OkChannel<typeof txDomainError>, number>>;

// Even a callback whose own channel is EMPTY comes back carrying `PgQueryError`
// — the union is added by the transaction, not inherited from the callback.
const txCleanCallback = async () => await db.transaction((tx) => tx.select().from(users).execute());
type _txCleanErr = Expect<Equal<ErrChannel<typeof txCleanCallback>, PgQueryError>>;

// ... which is why `get()` does not compile on a transaction's result, however
// clean the callback was.
const txGet = async () => {
  const r = await db.transaction((tx) => tx.select().from(users).execute());
  // @ts-expect-error — `PgQueryError` is in the channel, so `get()` must not compile.
  r.get();
  return r;
};

// A write inside a transaction keeps the same union as one outside it: the
// handle is the same builder tree, not a second, laxer one.
const txWrite = async () =>
  await db.transaction((tx) => tx.insert(users).values({ id: 1, email: "a@b.c" }).execute());
type _txWriteErr = Expect<Equal<ErrChannel<typeof txWrite>, PgQueryError>>;

// A read inside a transaction is still `never` *at the callback*: the handle is
// the same builder tree, so a tx-scoped read composes without an arm for an
// error it cannot raise, and the transaction's own union is added only at the
// boundary. `requiresEmptyChannel` is the assertion — `AsyncResult` is
// covariant in `E`, so a `PgQueryError`-carrying argument would not be
// assignable to its `never` parameter.
const requiresEmptyChannel = <T>(r: AsyncResult<T, never>): AsyncResult<T, never> => r;

const txScopedRead = async () =>
  await db.transaction((tx) => requiresEmptyChannel(tx.select().from(users).execute()));
type _txScopedReadErr = Expect<Equal<ErrChannel<typeof txScopedRead>, PgQueryError>>;
type _txScopedReadOk = Expect<
  Equal<OkChannel<typeof txScopedRead>, { id: number; email: string }[]>
>;

export {
  countExecute,
  countRead,
  db,
  defectBranch,
  deleteWrite,
  exhaustive,
  findFirstGet,
  findMany,
  insertGet,
  insertWrite,
  missingArm,
  preparedFindMany,
  preparedInsert,
  preparedRefresh,
  preparedSelect,
  preparedSelectErr,
  rawWrite,
  recovered,
  refresh,
  refreshConcurrently,
  refreshGet,
  returningWrite,
  selectExecute,
  selectGet,
  selectRead,
  txCleanCallback,
  txDomainError,
  txGet,
  txScopedRead,
  txWrite,
  updateWrite,
};
