import { integer, pgMaterializedView, pgTable, text } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { sql } from "drizzle-orm/sql/sql";
import pg from "pg";
import { DoAsync, isDefect, isErr, isOk, P, type Result } from "unthrown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Registers the Result matchers used below (`toBeOk`, `toBeOkWith`, …).
import "@unthrown/vitest";

import {
  CheckViolation,
  ExclusionViolation,
  ForeignKeyViolation,
  NotNullViolation,
  UniqueConstraintViolation,
} from "./errors.js";
import { drizzle } from "./node-postgres/driver.js";
import { type PgFixture, startPg } from "./test-harness.js";

// ---------------------------------------------------------------------------
// Why most of this file drives a bare `pg.Client` rather than the harness pool
// ---------------------------------------------------------------------------
//
// PGlite is ONE Postgres backend, and `pglite-socket` multiplexes every TCP
// connection onto it: each handler's protocol messages go into one shared FIFO
// (`QueryQueueManager`), with a `lastHandlerId` + `isInTransaction()` heuristic
// standing in for real per-session isolation, and a fresh connection's startup
// packet re-initialises that single backend (`_ProcessStartupPacket`). So a
// second live connection is not a second session — it is contention on the one
// session, and a connection being TORN DOWN while another is being OPENED is
// the sharpest form of it: the dying handler's teardown runs
// `clearQueueForHandler` and can issue a queue-bypassing `ROLLBACK`
// (`clearTransactionIfNeeded`) while the replacement's startup packet is
// already in flight.
//
// `pg.Pool` manufactures exactly that on every failing query:
// `Pool.prototype.query` calls `client.release(err)`, and `_release` with an
// error goes straight to `_remove` → `client.end()`, so the connection is
// destroyed and the next query opens a new one. Task 8 saw the result — a
// `SELECT` resolving to `Ok([])` for a row that is certainly there, roughly one
// run in twelve — and worked around it by ordering one read ahead of the error
// cases. This suite provokes an error in nearly every case, which is precisely
// the shape that would hit it repeatedly.
//
// A checked-out `PoolClient` and a standalone `pg.Client` are NOT released with
// the error (`client.release(err)` is reached only from `Pool.prototype.query`),
// so neither churns. Driving the SQLSTATE and defect blocks through a bare
// `pg.Client` therefore removes the precondition rather than waiting it out:
// one TCP connection, opened once, never destroyed — which is also the honest
// model of what PGlite actually is, and a client form nothing else covered.
// The pool keeps a block of its own below, for the paths that are about being a
// pool (`isPool` → `pool.connect()` inside `transaction`); those run their
// statements on a checked-out client, so they do not churn either.
//
// None of this is a limitation of the library: a real PostgreSQL gives every
// connection its own backend, and `qualifyPgError` never sees the difference.

const users = pgTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull().unique(),
  age: integer("age"),
});

const posts = pgTable("posts", {
  id: integer("id").primaryKey(),
  authorId: integer("author_id").notNull(),
});

const bookings = pgTable("bookings", {
  id: integer("id").primaryKey(),
  room: integer("room"),
});

const deferred = pgTable("deferred", {
  id: integer("id").primaryKey(),
  code: text("code"),
});

const mvSource = pgTable("mv_source", {
  id: integer("id").primaryKey(),
  label: text("label").notNull(),
});

/** Declared as `.existing()`: the DDL below is what actually creates it. */
const labels = pgMaterializedView("labels", { label: text("label").notNull() }).existing();

const SCHEMA: readonly string[] = [
  `CREATE TABLE users (
     id int primary key,
     email text NOT NULL UNIQUE,
     age int CHECK (age IS NULL OR age > 0)
   )`,
  `CREATE TABLE posts (
     id int primary key,
     author_id int NOT NULL REFERENCES users(id)
   )`,
  // A scalar `EXCLUDE (room WITH =)` rather than the range-and-gist form: PGlite
  // 0.5.4 ships no `btree_gist` (`pg_available_extensions` does not list it, and
  // `CREATE EXTENSION btree_gist` fails 0A000), so `EXCLUDE USING gist (room
  // WITH =, during WITH &&)` cannot be built here. The scalar form needs no
  // extension and raises the same SQLSTATE 23P01 from the same code path — what
  // is untested is Postgres's gist operator classes, which are not ours.
  `CREATE TABLE bookings (
     id int primary key,
     room int,
     EXCLUDE (room WITH =)
   )`,
  `CREATE TABLE deferred (
     id int primary key,
     code text,
     CONSTRAINT deferred_code_key UNIQUE (code) DEFERRABLE INITIALLY DEFERRED
   )`,
  `CREATE TABLE mv_source (id int primary key, label text NOT NULL)`,
  `INSERT INTO mv_source VALUES (1, 'first')`,
  `CREATE MATERIALIZED VIEW labels AS SELECT label FROM mv_source`,
  `CREATE UNIQUE INDEX labels_label_key ON labels (label)`,
];

/** Build the schema, and seed the one row every block starts from. */
const applySchema = async (run: (statement: string) => Promise<unknown>): Promise<void> => {
  for (const statement of SCHEMA) await run(statement);
  await run(`INSERT INTO users VALUES (1, 'a@b.c', 30)`);
};

/**
 * A standalone `pg.Client` on the fixture's server.
 *
 * @remarks
 * `pool.options` is the `PoolConfig` the harness built, which is a `ClientConfig`
 * plus pool-only members a `Client` ignores — so this is an assignment, not a
 * re-derivation of the address.
 */
const soloClient = async (fixture: PgFixture): Promise<pg.Client> => {
  const client = new pg.Client(fixture.pool.options);
  await client.connect();
  return client;
};

/**
 * The two databases this file builds, named through call helpers.
 *
 * @remarks
 * `ReturnType<typeof drizzle>` resolves the connection-string overload, so it
 * types `$client` as a `Pool` whatever was passed; an instantiation expression
 * (`typeof drizzle<pg.Client>`) picks that same first overload and so binds the
 * client to the *relations* type parameter. Inferring from a call is what
 * actually selects the client-config overload.
 */
const clientDb = (client: pg.Client) => drizzle({ client });
type ClientDb = ReturnType<typeof clientDb>;

const poolDb = (client: pg.Pool) => drizzle({ client });
type PoolDb = ReturnType<typeof poolDb>;

/** The SQLSTATE the driver reported, read off a modeled error's `cause`. */
const sqlstateOf = (cause: unknown): string | undefined => {
  const code = (value: unknown): string | undefined =>
    typeof value === "object" && value !== null && "code" in value && typeof value.code === "string"
      ? value.code
      : undefined;
  if (typeof cause !== "object" || cause === null) return undefined;
  // Drizzle wraps a driver failure in a `DrizzleQueryError`; the original is
  // one level down, exactly as `qualifyPgError`'s own `driverError` reads it.
  return code(cause) ?? code("cause" in cause ? cause.cause : undefined);
};

/**
 * Narrow to `Err` and to the expected class, failing the test (rather than
 * silently skipping the assertions after it) when either does not hold.
 */
const expectErrOf = <C, E>(
  result: Result<unknown, E>,
  constructor: new (...args: never[]) => C,
): C => {
  if (!isErr(result)) return expect.fail(`expected Err, got ${result.tag}`);
  if (!(result.error instanceof constructor)) {
    return expect.fail(`expected ${constructor.name}, got ${String(result.error)}`);
  }
  return result.error;
};

/** Narrow to `Defect`, asserting the modeled channel was NOT taken. */
const expectDefectCause = <E>(result: Result<unknown, E>): unknown => {
  expect(isErr(result)).toBe(false);
  if (!isDefect(result)) return expect.fail(`expected Defect, got ${result.tag}`);
  return result.cause;
};

/**
 * How many rows the table holds under `id` — the after-the-fact check that a
 * rollback really happened, rather than merely being reported.
 *
 * @remarks
 * Read through `$count` on the database under test rather than through a second
 * connection of its own. That is deliberate, and it is the flake remedy: PGlite
 * is ONE backend and `pglite-socket` multiplexes every TCP connection onto it
 * (see the note at the top of this file), so a dedicated probe connection is not
 * an independent observer — it is a second party contending for the one session,
 * and holding one open is what reproduced the desync (`Received unexpected
 * parseComplete message from backend`). Each fixture here therefore keeps
 * exactly one live connection. Nothing is lost: the transaction has already
 * ended by the time this runs, so the rows it reads are committed state either
 * way.
 */
const rowsUnder = async (count: PromiseLike<Result<number, never>>): Promise<number> =>
  // `get()` only type-checks on a `Result<T, never>`, so this line is also the
  // compile-time half of the reads-are-defect-only ruling.
  (await count).get();

describe("SQLSTATE mapping against a real PostgreSQL", () => {
  let fixture: PgFixture;
  let client: pg.Client;
  let db: ClientDb;

  beforeAll(async () => {
    fixture = await startPg();
    client = await soloClient(fixture);
    await applySchema((statement) => client.query(statement));
    db = clientDb(client);
  });
  afterAll(async () => {
    await client.end();
    await fixture.stop();
  });

  it("maps 23505 — a real unique index — to UniqueConstraintViolation", async () => {
    const result = await db.insert(users).values({ id: 2, email: "a@b.c" });
    const error = expectErrOf(result, UniqueConstraintViolation);
    expect(error.constraint).toBe("users_email_key");
    expect(error.table).toBe("users");
    expect(error.detail).toBe("Key (email)=(a@b.c) already exists.");
    expect(sqlstateOf(error.cause)).toBe("23505");
  });

  it("maps 23503 — a real foreign key — to ForeignKeyViolation", async () => {
    const result = await db.insert(posts).values({ id: 1, authorId: 999 });
    const error = expectErrOf(result, ForeignKeyViolation);
    expect(error.constraint).toBe("posts_author_id_fkey");
    expect(error.table).toBe("posts");
    expect(error.detail).toBe('Key (author_id)=(999) is not present in table "users".');
    expect(sqlstateOf(error.cause)).toBe("23503");
  });

  it("maps 23502 — a real NOT NULL — to NotNullViolation carrying the column", async () => {
    // `email` is NOT NULL, so the typed builder refuses null by construction —
    // provoke it through the sql template, not by casting the builder's types away.
    const result = await db.execute(sql`INSERT INTO users (id, email) VALUES (3, NULL)`).execute();
    const error = expectErrOf(result, NotNullViolation);
    // 23502 names a column and has no constraint name of its own — which is why
    // `NotNullViolation` carries `column` where the others carry `constraint`.
    expect(error.column).toBe("email");
    expect(error.table).toBe("users");
    expect(error.detail).toBe("Failing row contains (3, null, null).");
    expect(sqlstateOf(error.cause)).toBe("23502");
  });

  it("maps 23514 — a real CHECK — to CheckViolation", async () => {
    const result = await db.insert(users).values({ id: 4, email: "d@e.f", age: -1 });
    const error = expectErrOf(result, CheckViolation);
    expect(error.constraint).toBe("users_age_check");
    expect(error.table).toBe("users");
    expect(sqlstateOf(error.cause)).toBe("23514");
  });

  it("maps 23P01 — a real EXCLUDE — to ExclusionViolation", async () => {
    await expect(db.insert(bookings).values({ id: 1, room: 7 })).toBeOk();
    const result = await db.insert(bookings).values({ id: 2, room: 7 });
    const error = expectErrOf(result, ExclusionViolation);
    expect(error.constraint).toBe("bookings_room_excl");
    expect(error.table).toBe("bookings");
    expect(sqlstateOf(error.cause)).toBe("23P01");
  });

  it("gives an update and a delete the same modeled channel as an insert", async () => {
    // Every write builder routes through the one qualified boundary; an insert
    // proving it would leave that as an assumption for the other two.
    await expect(db.insert(users).values({ id: 5, email: "e@f.g" })).toBeOk();

    const updated = await db.update(users).set({ email: "a@b.c" }).where(eq(users.id, 5));
    expect(expectErrOf(updated, UniqueConstraintViolation).constraint).toBe("users_email_key");

    await expect(db.insert(posts).values({ id: 2, authorId: 1 })).toBeOk();
    const deleted = await db.delete(users).where(eq(users.id, 1));
    expect(expectErrOf(deleted, ForeignKeyViolation).constraint).toBe("posts_author_id_fkey");
  });

  it("hands the whole union to an exhaustive match, every case named", async () => {
    // The payoff of the modeled channel: the five tags are the WHOLE of `E`, so
    // this compiles with no catch-all — and would stop compiling if the union grew.
    const result = await db
      .insert(users)
      .values({ id: 6, email: "a@b.c" })
      .execute()
      .mapErrCases((matcher) =>
        matcher.with(
          P.tag("UniqueConstraintViolation"),
          P.tag("ForeignKeyViolation"),
          P.tag("CheckViolation"),
          P.tag("ExclusionViolation"),
          P.tag("NotNullViolation"),
          (error) => error._tag,
        ),
      );
    await expect(result).toBeErrWith("UniqueConstraintViolation");
  });
});

describe("defect routing against a real PostgreSQL", () => {
  let fixture: PgFixture;
  let client: pg.Client;
  let db: ClientDb;

  beforeAll(async () => {
    fixture = await startPg();
    client = await soloClient(fixture);
    await applySchema((statement) => client.query(statement));
    db = clientDb(client);
  });
  afterAll(async () => {
    await client.end();
    await fixture.stop();
  });

  it("routes a syntax error (42601) to the defect channel", async () => {
    const result = await db.execute(sql`SELCT 1`).execute();
    expect(sqlstateOf(expectDefectCause(result))).toBe("42601");
  });

  it("routes an undefined table (42P01) to the defect channel", async () => {
    const result = await db.execute(sql`SELECT * FROM no_such_table`).execute();
    expect(sqlstateOf(expectDefectCause(result))).toBe("42P01");
  });

  it("routes a wrong-type cast (22P02) to the defect channel", async () => {
    // A `22xxx` data exception is the nearest neighbour of the modeled `23xxx`
    // family, and still not something a handler branches on.
    const result = await db.execute(sql`SELECT 'not-a-number'::int`).execute();
    expect(sqlstateOf(expectDefectCause(result))).toBe("22P02");
  });

  it("routes a lost connection to the defect channel", async () => {
    const solo = await startPg();
    // A pool of our own, so stopping the fixture kills the server under a client
    // that is still very much alive — a genuine infrastructure failure, not a
    // "you already ended this pool" guard.
    const pool = new pg.Pool(solo.pool.options);
    try {
      const soloDb = drizzle({ client: pool });
      await expect(soloDb.execute(sql`SELECT 1`).execute()).toBeOk();
      await solo.stop();
      const result = await soloDb.execute(sql`SELECT 1`).execute();
      expectDefectCause(result);
    } finally {
      await pool.end();
    }
  });

  it("keeps a defect a value — it flows to the edge and folds there", async () => {
    // The whole point of the channel: an unmodeled failure is not a crash. It
    // passes through every combinator untouched and is folded once, at `match`.
    const folded = await db
      .execute(sql`SELCT 1`)
      .execute()
      .map(() => "ok" as const)
      .mapErrCases((matcher) =>
        matcher.with(
          P.tag("UniqueConstraintViolation"),
          P.tag("ForeignKeyViolation"),
          P.tag("CheckViolation"),
          P.tag("ExclusionViolation"),
          P.tag("NotNullViolation"),
          () => "modeled" as const,
        ),
      );
    expect(
      folded.match({
        ok: (value) => value,
        errCases: (matcher) => matcher.with(P.union("modeled"), (value) => value),
        defect: (cause) => `defect:${sqlstateOf(cause) ?? "?"}`,
      }),
    ).toBe("defect:42601");
  });
});

describe("reads keep E = never against a real PostgreSQL", () => {
  let fixture: PgFixture;
  let client: pg.Client;
  let db: ClientDb;

  beforeAll(async () => {
    fixture = await startPg();
    client = await soloClient(fixture);
    await applySchema((statement) => client.query(statement));
    db = clientDb(client);
  });
  afterAll(async () => {
    await client.end();
    await fixture.stop();
  });

  it("refreshes a materialized view successfully", async () => {
    // The success case first: the failing ones below poison the source table.
    const result = await db.refreshMaterializedView(labels);
    expect(isOk(result)).toBe(true);
    // `get()` only type-checks while the error channel is `never` — the compile
    // half of the same ruling the runtime cases below cover.
    result.get();
  });

  it("sends a real 23505 raised by a refresh to the defect channel", async () => {
    // `refresh materialized view` is classified as a READ, so its `E` is `never`
    // — and a refresh CAN raise a genuine 23505, because rebuilding the heap has
    // to satisfy the view's unique index. This is the case that decides whether
    // the `never` is a promise or a lie: a duplicate must land in the DEFECT
    // channel, not in the modeled one the type says is empty.
    await expect(db.insert(mvSource).values({ id: 2, label: "first" })).toBeOk();

    const result = await db.refreshMaterializedView(labels);
    expect(sqlstateOf(expectDefectCause(result))).toBe("23505");
  });

  it("does the same for REFRESH … CONCURRENTLY", async () => {
    // The concurrent path reports the duplicate as 21000 rather than 23505, so
    // it never even reaches the modeled switch — but it is the variant the
    // ruling was actually argued about, so it is asserted rather than assumed.
    const result = await db.refreshMaterializedView(labels).concurrently();
    expect(sqlstateOf(expectDefectCause(result))).toBe("21000");
  });

  it("sends a prepared refresh's 23505 to the defect channel too", async () => {
    // `prepare(name).execute()` is a third route into the same statement, and it
    // has to carry the same `never` — a prepared read that qualified would
    // produce the very `Err` the builder's type excludes.
    const result = await db.refreshMaterializedView(labels).prepare("prepared_refresh").execute();
    expect(sqlstateOf(expectDefectCause(result))).toBe("23505");
  });
});

describe("transactions on a connection pool", () => {
  let fixture: PgFixture;
  let db: PoolDb;

  beforeAll(async () => {
    fixture = await startPg();
    await applySchema((statement) => fixture.pool.query(statement));
    db = poolDb(fixture.pool);
  });
  afterAll(async () => {
    await fixture.stop();
  });

  it("commits on Ok", async () => {
    const result = await db.transaction((tx) =>
      tx.insert(users).values({ id: 10, email: "t1@x.y" }).execute(),
    );
    expect(isOk(result)).toBe(true);
    expect(await rowsUnder(db.$count(users, eq(users.id, 10)))).toBe(1);
  });

  it("rolls back on Err and re-surfaces the error typed", async () => {
    const result = await db.transaction((tx) =>
      DoAsync()
        .bind("first", () => tx.insert(users).values({ id: 11, email: "t2@x.y" }).execute())
        .bind("clash", () => tx.insert(users).values({ id: 12, email: "a@b.c" }).execute()),
    );
    expect(expectErrOf(result, UniqueConstraintViolation).constraint).toBe("users_email_key");
    // The Result says it rolled back; the database is what proves it.
    expect(await rowsUnder(db.$count(users, eq(users.id, 11)))).toBe(0);
    expect(await rowsUnder(db.$count(users, eq(users.id, 12)))).toBe(0);
  });

  it("rolls back and stays a Defect when the callback throws", async () => {
    const result = await db.transaction((tx) =>
      tx
        .insert(users)
        .values({ id: 13, email: "t3@x.y" })
        .execute()
        .map(() => {
          throw new Error("boom");
        }),
    );
    expect(expectDefectCause(result)).toBeInstanceOf(Error);
    expect(await rowsUnder(db.$count(users, eq(users.id, 13)))).toBe(0);
  });

  it("surfaces a DEFERRABLE constraint raised by COMMIT as a modeled error", async () => {
    await expect(db.insert(deferred).values({ id: 1, code: "dup" })).toBeOk();
    const result = await db.transaction((tx) =>
      tx.insert(deferred).values({ id: 2, code: "dup" }).execute(),
    );
    // Every statement inside succeeded; COMMIT is what raised 23505 — which is
    // why the control statements run on the raw, still-rejecting path.
    const error = expectErrOf(result, UniqueConstraintViolation);
    expect(error.constraint).toBe("deferred_code_key");
    expect(sqlstateOf(error.cause)).toBe("23505");
    expect(await rowsUnder(db.$count(deferred, eq(deferred.id, 2)))).toBe(0);
  });

  it("undoes only the nested scope, so the enclosing transaction still commits", async () => {
    const result = await db.transaction((tx) =>
      tx
        .transaction((nested) => nested.insert(users).values({ id: 14, email: "a@b.c" }).execute())
        .recoverErrCases((matcher) =>
          matcher.with(
            P.tag("UniqueConstraintViolation"),
            P.tag("ForeignKeyViolation"),
            P.tag("CheckViolation"),
            P.tag("ExclusionViolation"),
            P.tag("NotNullViolation"),
            () => undefined,
          ),
        )
        .flatMap(() => tx.insert(users).values({ id: 15, email: "t5@x.y" }).execute()),
    );
    expect(isOk(result)).toBe(true);
    expect(await rowsUnder(db.$count(users, eq(users.id, 14)))).toBe(0);
    expect(await rowsUnder(db.$count(users, eq(users.id, 15)))).toBe(1);
  });

  it("renders the transaction config into the BEGIN", async () => {
    const result = await db.transaction(
      (tx) =>
        tx.execute<{ transaction_isolation: string }>(sql`SHOW transaction_isolation`).execute(),
      { isolationLevel: "serializable", accessMode: "read write" },
    );
    expect(isOk(result)).toBe(true);
    expect(isOk(result) && result.value.rows[0]?.transaction_isolation).toBe("serializable");
  });

  it("leaves the pool usable after every one of those failures", async () => {
    // The transaction paths above rolled back, threw and failed a COMMIT. A
    // connection left in an aborted transaction would surface here, not there.
    await expect(db.select().from(users).where(eq(users.id, 1))).toBeOkWith([
      { id: 1, email: "a@b.c", age: 30 },
    ]);
  });
});

describe("transactions on a bare pg.Client", () => {
  let fixture: PgFixture;
  let client: pg.Client;
  let db: ClientDb;

  beforeAll(async () => {
    fixture = await startPg();
    client = await soloClient(fixture);
    await applySchema((statement) => client.query(statement));
    db = clientDb(client);
  });
  afterAll(async () => {
    await client.end();
    await fixture.stop();
  });

  it("runs the transaction on the client itself, checking nothing out", async () => {
    // `isPool` is false for a standalone `Client`, so there is no `connect()`
    // to check a connection out of — the session is used as-is.
    expect(db.$client).toBe(client);
    const result = await db.transaction((tx) =>
      tx.insert(users).values({ id: 20, email: "c1@x.y" }).execute(),
    );
    expect(isOk(result)).toBe(true);
    expect(await rowsUnder(db.$count(users, eq(users.id, 20)))).toBe(1);
  });

  it("rolls back on Err and leaves the client usable", async () => {
    const result = await db.transaction((tx) =>
      DoAsync()
        .bind("first", () => tx.insert(users).values({ id: 21, email: "c2@x.y" }).execute())
        .bind("clash", () => tx.insert(users).values({ id: 22, email: "a@b.c" }).execute()),
    );
    expect(expectErrOf(result, UniqueConstraintViolation).constraint).toBe("users_email_key");
    expect(await rowsUnder(db.$count(users, eq(users.id, 21)))).toBe(0);
    // The same client, immediately after a rolled-back transaction: a session
    // left mid-transaction would fail this, and a pool would have hidden it by
    // handing out a different connection.
    await expect(db.select().from(users).where(eq(users.id, 20))).toBeOkWith([
      { id: 20, email: "c1@x.y", age: null },
    ]);
  });

  it("rolls back and stays a Defect when the callback throws", async () => {
    const result = await db.transaction((tx) =>
      tx
        .insert(users)
        .values({ id: 23, email: "c3@x.y" })
        .execute()
        .map(() => {
          throw new Error("boom");
        }),
    );
    expect(expectDefectCause(result)).toBeInstanceOf(Error);
    expect(await rowsUnder(db.$count(users, eq(users.id, 23)))).toBe(0);
  });
});
