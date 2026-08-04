// The SHAPE of every code sample this package ships in prose, compiled.
//
// The samples in `docs/how-to/use-with-drizzle.md`, in this package's README and
// in the `@example` blocks on `pg-core/db.ts` are markdown: nothing typechecks
// them, and they rot silently. That is not hypothetical — the README shipped a
// `.mapErrCases` hung directly off a query builder (a thenable, which has no
// such method) and a `^?` annotation pointing at the wrong expression, both of
// which this file would have caught. It is the drizzle-side sibling of core's
// `doc-examples.spec.ts`.
//
// This file has no runtime; it is checked by `tsc` through
// `tsconfig.test-d.json`, in the package's second typecheck pass. A sample that
// stops compiling fails the gate. Keep it in step with the prose: when you edit
// a sample in either place, edit it here too.
//
// WHAT THIS DOES NOT GUARANTEE. This is a hand-maintained MIRROR, not an
// extraction: unlike core's `doc-examples.spec.ts`, nothing here reads the
// markdown, so a sample added to the prose and not to this file is simply
// unchecked. It also checks each call's shape against a schema declared BELOW,
// not against the schema the prose implies, so three kinds of divergence are
// deliberate and are marked at the site where they occur:
//
//   1. Table and column names. The `db.ts` blocks are drizzle's own, written
//      against `cars` (with `brand` / `color`) and a `users.name`; the fixtures
//      here are `users` / `posts` / `logs` / `accounts`. The methods and the
//      chaining are what is under test, not the identifiers.
//   2. Columns the prose omits. `logs.id` has no default here, so the mirror
//      passes an `id` the guide's `values({ message })` leaves out — a reader's
//      `logs` table would generate it.
//   3. Placeholder bindings the prose leaves to the reader (`pool`, `id`,
//      `email`, a `resp` responder) are `declare const`s.
//
// What it DOES guarantee is the part that actually broke: that every method
// exists on the receiver the prose hangs it off, in that order, with arguments
// of the right kind, and that each channel is what the prose claims (a `.get()`
// only compiles on `Result<T, never>`, so every `.get()` below is an assertion
// that the read really has an empty error channel).
import { eq, sql } from "drizzle-orm";
import { drizzle as drizzleStock } from "drizzle-orm/node-postgres";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { defineRelations } from "drizzle-orm/relations";
import pg from "pg";
import { type AsyncResult, fromPromise, P } from "unthrown";

import { qualifyPgError } from "./errors.js";
import { drizzle } from "./node-postgres/driver.js";

const users = pgTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
});
const posts = pgTable("posts", {
  id: integer("id").primaryKey(),
  authorId: integer("author_id").notNull(),
});
const logs = pgTable("logs", {
  id: integer("id").primaryKey(),
  message: text("message").notNull(),
});
const accounts = pgTable("accounts", {
  id: integer("id").primaryKey(),
  balance: integer("balance").notNull(),
});

const relations = defineRelations({ users, posts, logs, accounts });

declare const pool: pg.Pool;
declare const id: number;
declare const email: string;
declare const message: string;
declare const amount: number;
declare const from: number;
declare const to: number;
declare const balance: number;

const db = drizzle({ client: pool, relations });

// --- construct ---------------------------------------------------------------
const _d1 = drizzle("postgres://localhost/app");
const _d2 = drizzle("postgres://localhost/app", { relations });
const _d3 = drizzle({ connection: { host: "h", database: "d", user: "u" }, relations });

// --- read --------------------------------------------------------------------
export const readSample = async () => {
  const found = await db.select().from(users).where(eq(users.id, id));
  const rows = found.get();
  return rows;
};

// --- write with mapErrCases ---------------------------------------------------
export const writeSample = async () =>
  await db
    .insert(users)
    .values({ id, email })
    .returning()
    .execute()
    .mapErrCases((matcher, defect) =>
      matcher
        .with(P.tag("UniqueConstraintViolation"), (e) => `taken: ${e.constraint}` as const)
        .with(
          P.tag("ForeignKeyViolation"),
          P.tag("NotNullViolation"),
          P.tag("CheckViolation"),
          P.tag("ExclusionViolation"),
          (e) => defect(e),
        ),
    );

// --- recoverErrCases then get -------------------------------------------------
export const recoverSample = async () =>
  (
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

// --- match at the edge --------------------------------------------------------
declare const resp: {
  created: (v: unknown) => string;
  conflict: (v: unknown) => string;
  badRequest: (v: unknown) => string;
  serverError: (v: unknown) => string;
};

export const matchSample = async () => {
  const r = await db.insert(users).values({ id, email });
  return r.match({
    ok: (res) => resp.created(res),
    errCases: (matcher) =>
      matcher
        .with(P.tag("UniqueConstraintViolation"), (e) => resp.conflict(e.constraint))
        .with(P.tag("NotNullViolation"), (e) => resp.badRequest(e.column))
        .with(
          P.tag("ForeignKeyViolation"),
          P.tag("CheckViolation"),
          P.tag("ExclusionViolation"),
          () => resp.badRequest("bad write"),
        ),
    defect: (cause) => resp.serverError(cause),
  });
};

// --- retry wrapper ------------------------------------------------------------
const RETRYABLE = new Set(["40001", "40P01"]);

const sqlState = (cause: unknown): string | undefined => {
  if (typeof cause !== "object" || cause === null) return undefined;
  const code: unknown = (cause as { code?: unknown }).code;
  if (typeof code === "string") return code;
  return sqlState((cause as { cause?: unknown }).cause);
};

const withRetry = <T, E>(run: () => AsyncResult<T, E>, attempts = 3): AsyncResult<T, E> =>
  run().recoverDefect((cause) => {
    if (attempts <= 1 || !RETRYABLE.has(sqlState(cause) ?? "")) throw cause;
    return withRetry(run, attempts - 1);
  });

export const retrySample = async () =>
  await withRetry(() =>
    db.transaction((tx) => tx.update(accounts).set({ balance }).execute(), {
      isolationLevel: "serializable",
    }),
  );

// --- transactions -------------------------------------------------------------
export const txSample = async () =>
  await db.transaction((tx) =>
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

export const nestedTxSample = async () =>
  await db.transaction((tx) =>
    tx
      // Divergence (2): the guide writes `values({ message })`, on a `logs`
      // table whose id is generated. The fixture's `logs.id` has no default, so
      // the mirror supplies one. The savepoint nesting is the point.
      .transaction((nested) => nested.insert(logs).values({ id, message }).execute())
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

// --- README transaction sample -------------------------------------------------
export const readmeTxSample = async () =>
  await db.transaction((tx) =>
    tx
      .insert(users)
      .values({ id, email })
      .execute()
      .flatMap(() => tx.insert(posts).values({ id, authorId: id }).execute()),
  );

// --- escape hatch --------------------------------------------------------------
//
// The `$client` hand-off is the sample most exposed to rot: it is the only one
// whose shape depends on a FOREIGN factory's signature, across a peer range
// (`drizzle-orm` ^1.0.0-rc) whose rcs are free to change it. That is exactly why
// it is compiled here rather than trusted.
export const stockDbSample = drizzleStock({ client: db.$client, relations });

export const rawSample = async () =>
  await fromPromise(() => pool.query("insert into users values ($1)", [id]), qualifyPgError);

// --- db.ts @example samples ----------------------------------------------------
//
// Divergence (1) applies throughout this block: drizzle's inherited blocks are
// written against a `cars` table (`brand`, `color`) and a `users.name`, and the
// mirror rewrites them onto the `users` fixture above (`email` standing in for
// `brand` / `name`). The identifiers are not what these samples teach — the
// builder chain and the `Result` wrapping are.
export const countSample = async () => (await db.$count(users, eq(users.id, id))).get();

export const cteSample = async () => {
  const sq = db.$with("sq").as(db.select().from(users).where(eq(users.id, 42)));
  return (await db.with(sq).select().from(sq)).get();
};

export const cteAliasSample = async () => {
  const sq = db.$with("sq").as(
    db
      .select({
        name: sql<string>`upper(${users.email})`.as("name"),
      })
      .from(users),
  );
  return (await db.with(sq).select({ name: sq.name }).from(sq)).get();
};

export const distinctSample = async () => {
  const unique = (await db.selectDistinct().from(users).orderBy(users.id, users.email)).get();
  const brands = (await db.selectDistinct({ brand: users.email }).from(users)).get();
  const firstPer = (await db.selectDistinctOn([users.email]).from(users)).get();
  const withCols = (
    await db.selectDistinctOn([users.email], { brand: users.email }).from(users)
  ).get();
  return [unique, brands, firstPer, withCols];
};

export const writeExamples = async () => {
  const all = await db.update(users).set({ email });
  const updated = await db.update(users).set({ email }).where(eq(users.id, 1)).returning();
  const one = await db.insert(users).values({ id, email });
  const inserted = await db.insert(users).values({ id, email }).returning();
  const dAll = await db.delete(users);
  const deleted = await db.delete(users).where(eq(users.id, 1)).returning();
  return [all, updated, one, inserted, dAll, deleted];
};

export const rawExecute = async () => await db.execute(sql`select now()`);
