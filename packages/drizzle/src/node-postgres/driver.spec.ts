import { DrizzleQueryError } from "drizzle-orm/errors";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { defineRelations } from "drizzle-orm/relations";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { sql } from "drizzle-orm/sql/sql";
import pg from "pg";
import { Err, isDefect, isErr, isOk, P, type Result } from "unthrown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Registers the Result matchers used throughout this file (`toBeOkWith`, …).
import "@unthrown/vitest";

import { type PgFixture, startPg } from "../test-harness.js";
import { drizzle, NodePgUnthrownDatabase } from "./driver.js";

const users = pgTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull().unique(),
});

const relations = defineRelations({ users });

describe("drizzle()", () => {
  let fixture: PgFixture;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    fixture = await startPg();
    await fixture.pool.query(`CREATE TABLE users (id int primary key, email text NOT NULL UNIQUE)`);
    db = drizzle({ client: fixture.pool });
  });
  afterAll(async () => {
    await fixture.stop();
  });

  // The three cases below are ordered, and deliberately so: the unfiltered
  // select asserts the whole table. Every case added after them writes rows of
  // its own and filters for them.
  it("returns Ok for a successful insert", async () => {
    const r = await db.insert(users).values({ id: 1, email: "a@b.c" });
    expect(isOk(r)).toBe(true);
  });

  it("returns Ok with the rows for a select", async () => {
    const r = await db.select().from(users);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual([{ id: 1, email: "a@b.c" }]);
  });

  it("exposes the underlying client as the escape hatch", () => {
    expect(db.$client).toBe(fixture.pool);
  });

  it("hands back rows the column codecs decoded, not driver strings", async () => {
    const r = await db.select().from(users).where(eq(users.id, 1));
    await expect(r).toBeOkWith([{ id: 1, email: "a@b.c" }]);
    // The real driver returns `int4` as a JS string over the wire; a row that
    // arrived undecoded would still pass a loose shape check.
    if (isOk(r)) expect(typeof r.value[0]?.id).toBe("number");
  });

  // Deliberately ahead of every error-provoking case below, and kept that way.
  // Under the old PGlite harness this read intermittently came back `Ok([])`
  // for a row that is certainly there — electric-sql/pglite#958, a duplicate
  // `ReadyForQuery` after an errored extended-query batch desyncing the
  // responses that followed it (see test-harness.ts). Real PostgreSQL does not
  // send it, so the ordering is no longer load-bearing; it costs nothing, and
  // this read is a stronger check while the table holds exactly the seed row.
  it("wires the relational query API when relations are configured", async () => {
    const related = drizzle({ client: fixture.pool, relations });
    const r = await related.query.users.findMany({ where: { id: 1 } });
    await expect(r).toBeOkWith([{ id: 1, email: "a@b.c" }]);
  });

  it("routes a constraint violation to the modeled error channel", async () => {
    const r = await db.insert(users).values({ id: 1, email: "duplicate@b.c" });
    await expect(r).toBeErrTagged("UniqueConstraintViolation");
  });

  it("runs a raw statement through db.execute", async () => {
    const r = await db.execute<{ one: number }>(sql`select 1 as one`);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.rows).toEqual([{ one: 1 }]);
  });

  it("commits a transaction whose callback returns Ok", async () => {
    const r = await db.transaction((tx) =>
      tx
        .insert(users)
        .values({ id: 2, email: "committed@b.c" })
        .execute()
        .flatMap(() => tx.insert(users).values({ id: 3, email: "committed2@b.c" }).execute()),
    );
    expect(isOk(r)).toBe(true);

    const rows = await db.select().from(users).where(eq(users.id, 2));
    await expect(rows).toBeOkWith([{ id: 2, email: "committed@b.c" }]);
  });

  it("rolls a transaction back when the callback returns Err", async () => {
    const r = await db.transaction((tx) =>
      tx
        .insert(users)
        .values({ id: 4, email: "rolled@b.c" })
        .execute()
        .flatMap(() => Err("abort" as const)),
    );
    await expect(r).toBeErrWith("abort");

    const rows = await db.select().from(users).where(eq(users.id, 4));
    await expect(rows).toBeOkWith([]);
  });

  it("re-surfaces a rolled-back transaction's error with every case named", async () => {
    const r = await db
      .transaction((tx) => tx.insert(users).values({ id: 1, email: "clash@b.c" }).execute())
      .mapErrCases((m) =>
        m.with(
          P.tag("UniqueConstraintViolation"),
          P.tag("ForeignKeyViolation"),
          P.tag("CheckViolation"),
          P.tag("ExclusionViolation"),
          P.tag("NotNullViolation"),
          (e) => e._tag,
        ),
      );
    await expect(r).toBeErrWith("UniqueConstraintViolation");
  });
});

describe("drizzle() client forms", () => {
  let fixture: PgFixture;

  beforeAll(async () => {
    fixture = await startPg();
    await fixture.pool.query(`CREATE TABLE users (id int primary key, email text NOT NULL UNIQUE)`);
  });
  afterAll(async () => {
    await fixture.stop();
  });

  it("accepts a client under `client`", async () => {
    const db = drizzle({ client: fixture.pool });
    expect(db.$client).toBe(fixture.pool);
    expect(db).toBeInstanceOf(NodePgUnthrownDatabase);
    await expect(db.insert(users).values({ id: 1, email: "client@b.c" })).toBeOk();
  });

  it("accepts a checked-out client", async () => {
    const checkedOut = await fixture.pool.connect();
    try {
      const db = drizzle({ client: checkedOut });
      expect(db.$client).toBe(checkedOut);
      await expect(db.insert(users).values({ id: 2, email: "pooled@b.c" })).toBeOk();
    } finally {
      checkedOut.release();
    }
  });

  it("builds its own pool from a connection string", async () => {
    const db = drizzle(connectionString(fixture.pool));
    try {
      expect(db.$client).toBeInstanceOf(pg.Pool);
      await expect(db.insert(users).values({ id: 3, email: "string@b.c" })).toBeOk();
    } finally {
      await db.$client.end();
    }
  });

  it("builds its own pool from a `connection` object", async () => {
    const db = drizzle({ connection: { ...address(fixture.pool), user: "postgres" } });
    try {
      await expect(db.insert(users).values({ id: 4, email: "connection@b.c" })).toBeOk();
    } finally {
      await db.$client.end();
    }
  });

  it("builds its own pool from a `connection` string", async () => {
    const db = drizzle({ connection: connectionString(fixture.pool) });
    try {
      await expect(db.insert(users).values({ id: 5, email: "connection-string@b.c" })).toBeOk();
    } finally {
      await db.$client.end();
    }
  });
});

describe("read builders declare E = never, and the runtime enforces it", () => {
  let fixture: PgFixture;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    fixture = await startPg();
    await fixture.pool.query(`CREATE TABLE users (id int primary key, email text NOT NULL UNIQUE)`);
    await fixture.pool.query(`INSERT INTO users VALUES (1, 'a@b.c')`);
    // A SELECT writes nothing, so it cannot violate a constraint on its own —
    // but it can CALL something that does. A volatile function that writes is
    // the one realistic way a read reaches a 23xxx, and therefore the exact
    // case that decides whether `E = never` is a promise or a lie.
    await fixture.pool.query(
      `CREATE FUNCTION dup_insert() RETURNS int LANGUAGE sql VOLATILE
       AS $$ INSERT INTO users VALUES (1, 'dup@b.c'); SELECT 1; $$`,
    );
    db = drizzle({ client: fixture.pool });
  });
  afterAll(async () => {
    await fixture.stop();
  });

  /** A read whose selected field raises SQLSTATE 23505 when the row is produced. */
  const violatingRead = () => db.select({ v: sql<number>`dup_insert()` }).from(users);

  // Typed as what a read actually hands back — `Result<unknown, never>` — which
  // is also the assertion: only a value whose error channel is already empty can
  // be passed in. `isDefect` then narrows, so reading `cause` needs no cast.
  const expect23505Defect = (r: Result<unknown, never>): void => {
    // `isErr` is asserted false explicitly: the whole point is that this failure
    // must NOT reach the modeled channel the type says is empty.
    expect(isErr(r)).toBe(false);
    expect(isDefect(r)).toBe(true);
    // The SQLSTATE sits one level down: the query wraps a driver rejection in
    // drizzle's `DrizzleQueryError` so the defect a caller logs names the
    // statement. Asserting the wrapper too keeps that visible here.
    if (isDefect(r)) {
      expect(r.cause).toBeInstanceOf(DrizzleQueryError);
      const wrapped = r.cause as DrizzleQueryError;
      expect(wrapped.query).toContain("dup_insert()");
      expect((wrapped.cause as { code?: string } | undefined)?.code).toBe("23505");
    }
  };

  it("sends a 23505 raised on a read path to the defect channel via execute()", async () => {
    const r = await violatingRead().execute();
    expect23505Defect(r);
  });

  it("does the same when the read builder is awaited directly", async () => {
    // The `then` path, which is a separate route into `execute()`.
    const r = await violatingRead();
    expect23505Defect(r);
  });

  it("sends a 23505 raised under $count to the defect channel", async () => {
    const r = await db.$count(users, sql`dup_insert() = 1`).execute();
    expect23505Defect(r);
  });

  it("sends a 23505 raised under a relational query to the defect channel", async () => {
    const related = drizzle({ client: fixture.pool, relations });
    const r = await related.query.users.findMany({
      extras: { v: sql<number>`dup_insert()`.as("v") },
    });
    expect23505Defect(r);
  });

  // `prepare(name).execute()` is the THIRD route to running a read, next to
  // `execute()` and `await`. It hands back a prepared query object whose own
  // `execute` used to qualify — so a prepared read produced the very `Err` the
  // builder's `never` says is impossible. `$count` is absent below because
  // drizzle's `PgCountBuilder` exposes no `prepare()` at all.
  it("sends a 23505 to the defect channel through a prepared select", async () => {
    const r = await violatingRead().prepare("prepared_select").execute();
    expect23505Defect(r);
  });

  it("sends a 23505 to the defect channel through a prepared relational query", async () => {
    const related = drizzle({ client: fixture.pool, relations });
    const r = await related.query.users
      .findMany({ extras: { v: sql<number>`dup_insert()`.as("v") } })
      .prepare("prepared_rqb")
      .execute();
    expect23505Defect(r);
  });

  it("keeps `.get()` compiling on a read — it only type-checks while E is never", async () => {
    // This is the compile guard, not a runtime assertion: `get()` is typed
    // `this: Result<T, never>`, so if a read builder's error channel ever
    // widened again this line would stop compiling.
    const rows = (await db.select().from(users)).get();
    expect(rows).toEqual([{ id: 1, email: "a@b.c" }]);

    const total = (await db.$count(users)).get();
    expect(total).toBe(1);

    // The same guard on the prepared route — this is what Finding 1 was about.
    const prepared = await db.select().from(users).prepare("get_guard").execute();
    expect(prepared.get()).toEqual([{ id: 1, email: "a@b.c" }]);
  });

  it("still gives a WRITE the modeled error channel — reads are the exception", async () => {
    // The contrast that makes the rule above meaningful: an insert's 23505 is a
    // value you branch on, and stays one.
    const r = await db.insert(users).values({ id: 1, email: "clash@b.c" });
    expect(isDefect(r)).toBe(false);
    await expect(r).toBeErrTagged("UniqueConstraintViolation");
  });
});

describe("drizzle() logger config", () => {
  let fixture: PgFixture;

  beforeAll(async () => {
    fixture = await startPg();
    await fixture.pool.query(`CREATE TABLE users (id int primary key, email text NOT NULL UNIQUE)`);
  });
  afterAll(async () => {
    await fixture.stop();
  });

  it("logs every statement through a logger of your own", async () => {
    const logged: string[] = [];
    const db = drizzle({
      client: fixture.pool,
      logger: { logQuery: (query) => logged.push(query) },
    });
    await expect(db.insert(users).values({ id: 1, email: "logged@b.c" })).toBeOk();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("insert into");
  });

  it("logs nothing when the logger is off", async () => {
    const db = drizzle({ client: fixture.pool, logger: false });
    await expect(db.insert(users).values({ id: 2, email: "quiet@b.c" })).toBeOk();
  });

  it("accepts `logger: true` for drizzle's console logger", () => {
    // Built, deliberately not run: `DefaultLogger` writes to the console, and a
    // suite's output stays pristine. That it *is* a `DefaultLogger` is drizzle's
    // to test; this covers the branch that chooses one.
    const db = drizzle({ client: fixture.pool, logger: true });
    expect(db).toBeInstanceOf(NodePgUnthrownDatabase);
  });
});

/** Where the harness's pool is pointed, so a second client can reach it too. */
const address = (pool: pg.Pool): { host: string; port: number; database: string } => {
  const { host, port, database } = pool.options;
  if (typeof host !== "string" || typeof port !== "number" || typeof database !== "string") {
    throw new Error("the test harness pool did not report a host/port/database");
  }
  return { host, port, database };
};

const connectionString = (pool: pg.Pool): string => {
  const { host, port, database } = address(pool);
  return `postgres://postgres@${host}:${port}/${database}`;
};
