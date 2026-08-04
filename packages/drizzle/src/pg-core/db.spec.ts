import { integer, pgMaterializedView, pgTable, text } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core/dialect";
import type { PgTransactionConfig, PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import { defineRelations } from "drizzle-orm/relations";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { type Query, sql } from "drizzle-orm/sql/sql";
import { type AsyncResult, isDefect } from "unthrown";
import { describe, expect, it } from "vitest";
// Registers the Result matchers used throughout this file (`toBeOkWith`, …).
import "@unthrown/vitest";

import type { PgQueryError } from "../errors.js";
import { PgUnthrownCountBuilder } from "./count.js";
import { UnthrownPgDatabase } from "./db.js";
import { PgUnthrownRaw } from "./raw.js";
import { PgUnthrownSelectBase } from "./select.js";
import { type PgRowMapper, UnthrownPgPreparedQuery, UnthrownPgSession } from "./session.js";

const users = pgTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

/** A second table, never joined, used to provoke a compilation failure. */
const posts = pgTable("posts", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
});

const userCounts = pgMaterializedView("user_counts", {
  name: text("name").notNull(),
  total: integer("total").notNull(),
}).as(sql`select "name", count(*) as "total" from "users" group by "name"`);

const relations = defineRelations({ users, posts });

/** The driver-result kind a fake node-postgres would expose. */
type FakeQueryResultHKT = {
  readonly $brand: "PgQueryResultHKT";
  readonly row: unknown;
  readonly type: { readonly rowCount: number };
};

const noopLogger = { logQuery: () => undefined };

/** What a fake session was asked to run, so a test can assert the SQL. */
type Asked = { readonly sql: string; readonly params: unknown[]; readonly mode: string };

/**
 * A session that answers every query from a canned value (or a canned
 * rejection), recording what it was asked for. That is all the builders need:
 * they only ever hand the session a compiled query and read back an
 * `AsyncResult`, so a fake driver exercises the whole tree without a database.
 */
class FakeSession extends UnthrownPgSession<never> {
  readonly asked: Asked[] = [];

  constructor(private readonly answer: () => Promise<unknown>) {
    super(new PgDialect());
  }

  override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: Query,
    mode: "arrays" | "objects" | "raw",
    _name: string | boolean,
    mapper?: PgRowMapper,
  ): UnthrownPgPreparedQuery<T> {
    this.asked.push({ sql: query.sql, params: query.params, mode });
    return new UnthrownPgPreparedQuery<T>(this.answer, query, mapper, mode, noopLogger);
  }

  override transaction<A, E>(
    _fn: (tx: never) => AsyncResult<A, E>,
    _config?: PgTransactionConfig,
  ): AsyncResult<A, E | PgQueryError> {
    throw new Error("not part of this task");
  }
}

const makeDb = (answer: () => Promise<unknown>) => {
  const session = new FakeSession(answer);
  const db = new UnthrownPgDatabase<FakeQueryResultHKT, typeof relations>(
    new PgDialect(),
    session,
    relations,
  );
  return { db, session };
};

const rows = (value: unknown) => async () => value;

const violation = () => {
  const cause = Object.assign(new Error("dup"), { code: "23505", constraint: "users_pkey" });
  return async () => {
    throw cause;
  };
};

describe("UnthrownPgDatabase — select", () => {
  it("awaits to an Ok of the mapped rows, without an explicit execute()", async () => {
    const { db, session } = makeDb(rows([[1, "ada"]]));

    const result = await db.select().from(users);

    expect(session.asked[0]?.mode).toBe("arrays");
    expect(session.asked[0]?.sql).toContain('from "users"');
    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });

  it("returns the same rows through execute() as through await", async () => {
    const { db } = makeDb(rows([[1, "ada"]]));

    const result = await db.select().from(users).execute();

    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });

  it("threads a where clause and its parameters through to the session", async () => {
    const { db, session } = makeDb(rows([]));

    await db.select().from(users).where(eq(users.id, 42));

    expect(session.asked[0]?.sql).toContain("where");
    expect(session.asked[0]?.params).toEqual([42]);
  });

  it("keeps returning an unthrown builder as the query is chained", async () => {
    const { db } = makeDb(rows([]));

    // The HKT is what makes this hold: `.where()` rebuilds the builder, and a
    // drizzle-tree rebuild would silently give back a promise-based one.
    const chained = db.select().from(users).where(eq(users.id, 1)).limit(1);

    expect(chained).toBeInstanceOf(PgUnthrownSelectBase);
    expect(await chained).toBeOk();
  });

  it("builds a named prepared statement", async () => {
    const { db, session } = makeDb(rows([[1, "ada"]]));

    const prepared = db.select().from(users).prepare("by_id");
    const result = await prepared.execute();

    expect(prepared).toBeInstanceOf(UnthrownPgPreparedQuery);
    expect(session.asked).toHaveLength(1);
    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });

  it("supports selectDistinct and selectDistinctOn", async () => {
    const { db, session } = makeDb(rows([]));

    await db.selectDistinct({ name: users.name }).from(users);
    await db.selectDistinctOn([users.name], { name: users.name }).from(users);

    expect(session.asked[0]?.sql).toContain("select distinct");
    expect(session.asked[1]?.sql).toContain("select distinct on");
  });
});

describe("UnthrownPgDatabase — writes", () => {
  it("qualifies a unique violation into the error channel", async () => {
    const { db } = makeDb(violation());

    const result = await db.insert(users).values({ id: 1, name: "ada" });

    expect(result).toBeErrTagged(
      "UniqueConstraintViolation",
      expect.objectContaining({ constraint: "users_pkey" }),
    );
  });

  it("routes an infrastructure failure to the defect channel", async () => {
    const { db } = makeDb(async () => {
      throw Object.assign(new Error("deadlock"), { code: "40P01" });
    });

    const result = await db.insert(users).values({ id: 1, name: "ada" });

    expect(result).toBeDefect();
  });

  it("maps an insert ... returning through the row mapper", async () => {
    const { db, session } = makeDb(rows([[1, "ada"]]));

    const result = await db.insert(users).values({ id: 1, name: "ada" }).returning();

    expect(session.asked[0]?.mode).toBe("arrays");
    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });

  it("asks for raw rows when an insert has no returning clause", async () => {
    const { db, session } = makeDb(rows({ rowCount: 1 }));

    const result = await db.insert(users).values({ id: 1, name: "ada" });

    expect(session.asked[0]?.mode).toBe("raw");
    expect(result).toBeOkWith({ rowCount: 1 });
  });

  it("runs an update, mapping its returning clause", async () => {
    const { db, session } = makeDb(rows([[1, "grace"]]));

    const result = await db.update(users).set({ name: "grace" }).where(eq(users.id, 1)).returning();

    expect(session.asked[0]?.sql).toContain('update "users"');
    expect(result).toBeOkWith([{ id: 1, name: "grace" }]);
  });

  it("runs a delete, mapping its returning clause", async () => {
    const { db, session } = makeDb(rows([[1, "ada"]]));

    const result = await db.delete(users).where(eq(users.id, 1)).returning();

    expect(session.asked[0]?.sql).toContain('delete from "users"');
    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });

  it("runs an update with no returning clause against the raw row shape", async () => {
    const { db, session } = makeDb(rows({ rowCount: 2 }));

    const result = await db.update(users).set({ name: "grace" });

    expect(session.asked[0]?.mode).toBe("raw");
    expect(result).toBeOkWith({ rowCount: 2 });
  });

  it("runs a delete with no returning clause against the raw row shape", async () => {
    const { db, session } = makeDb(rows({ rowCount: 3 }));

    const result = await db.delete(users);

    expect(session.asked[0]?.mode).toBe("raw");
    expect(result).toBeOkWith({ rowCount: 3 });
  });
});

describe("UnthrownPgDatabase — $count", () => {
  it("coerces the bigint string Postgres returns for count(*)", async () => {
    const { db, session } = makeDb(rows([["7"]]));

    const result = await db.$count(users);

    expect(session.asked[0]?.sql).toContain("select count(*)");
    expect(result).toBeOkWith(7);
  });

  it("passes a numeric count through untouched", async () => {
    const { db } = makeDb(rows([[7]]));

    const result = await db.$count(users);

    expect(result).toBeOkWith(7);
  });

  it("counts as zero when the driver returns no cell", async () => {
    const { db } = makeDb(rows([[]]));

    const result = await db.$count(users);

    expect(result).toBeOkWith(0);
  });

  it("carries a filter into the counted query", async () => {
    const { db, session } = makeDb(rows([["1"]]));

    const builder = db.$count(users, eq(users.id, 1));
    await builder;

    expect(builder).toBeInstanceOf(PgUnthrownCountBuilder);
    expect(session.asked[0]?.params).toEqual([1]);
  });
});

describe("UnthrownPgDatabase — raw execute", () => {
  it("runs a tagged SQL fragment", async () => {
    const { db, session } = makeDb(rows({ rowCount: 0 }));

    const raw = db.execute(sql`select now()`);
    const result = await raw;

    expect(raw).toBeInstanceOf(PgUnthrownRaw);
    expect(session.asked[0]?.sql).toBe("select now()");
    expect(result).toBeOkWith({ rowCount: 0 });
  });

  it("runs a plain string", async () => {
    const { db, session } = makeDb(rows({ rowCount: 0 }));

    await db.execute("select 1");

    expect(session.asked[0]?.sql).toBe("select 1");
  });

  it("hands back the already-prepared query from _prepare", () => {
    const { db } = makeDb(rows({ rowCount: 0 }));

    const raw = db.execute("select 1");

    expect(raw._prepare()).toBeInstanceOf(UnthrownPgPreparedQuery);
  });
});

describe("UnthrownPgDatabase — CTEs and relational queries", () => {
  it("selects from a CTE built with $with", async () => {
    const { db, session } = makeDb(rows([[1, "ada"]]));

    const adults = db.$with("adults").as(db.select().from(users));
    const result = await db.with(adults).select().from(adults);

    expect(session.asked.at(-1)?.sql).toContain('with "adults"');
    expect(result).toBeOk();
  });

  it("exposes the write builders on the with(...) namespace", async () => {
    const { db, session } = makeDb(rows({ rowCount: 1 }));

    const adults = db.$with("adults").as(db.select().from(users));
    await db.with(adults).delete(users);
    await db.with(adults).update(users).set({ name: "grace" });
    await db.with(adults).insert(users).values({ id: 2, name: "grace" });
    await db.with(adults).selectDistinct().from(users);
    await db.with(adults).selectDistinctOn([users.id]).from(users);

    expect(session.asked.map((a) => a.sql.startsWith('with "adults"'))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(session.asked[3]?.sql).toContain("select distinct");
    expect(session.asked[4]?.sql).toContain("select distinct on");
  });

  it("builds a CTE from a raw SQL fragment and an explicit selection", async () => {
    const { db, session } = makeDb(rows([[1]]));

    const totals = db.$with("totals", { total: users.id }).as(() => sql`select "id" from "users"`);

    const result = await db.with(totals).select({ total: totals.total }).from(totals);

    expect(session.asked.at(-1)?.sql).toContain('with "totals"');
    expect(result).toBeOk();
  });

  it("runs a relational findMany through the unthrown query builder", async () => {
    const { db, session } = makeDb(rows([[1, "ada"]]));

    const result = await db.query.users.findMany();

    expect(session.asked[0]?.mode).toBe("arrays");
    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });

  it("runs a relational findFirst, unwrapping the single row", async () => {
    const { db } = makeDb(rows([[1, "ada"]]));

    const result = await db.query.users.findFirst();

    expect(result).toBeOkWith({ id: 1, name: "ada" });
  });

  it("prepares a relational query by name", async () => {
    const { db } = makeDb(rows([[1, "ada"]]));

    const prepared = db.query.users.findMany().prepare("all_users");

    expect(await prepared.execute()).toBeOk();
  });
});

describe("UnthrownPgDatabase — refreshMaterializedView", () => {
  it("issues a refresh statement", async () => {
    const { db, session } = makeDb(rows({ rowCount: 0 }));

    const result = await db.refreshMaterializedView(userCounts);

    expect(session.asked[0]?.mode).toBe("raw");
    expect(session.asked[0]?.sql).toContain("refresh materialized view");
    expect(result).toBeOkWith({ rowCount: 0 });
  });

  it("prepares a refresh by name", async () => {
    const { db } = makeDb(rows({ rowCount: 0 }));

    const prepared = db.refreshMaterializedView(userCounts).concurrently().prepare("refresh");

    expect(await prepared.execute()).toBeOk();
  });
});

/**
 * A session that refuses to prepare anything, standing in for every way the
 * compile-and-prepare step can blow up. Preparing a query is not bookkeeping —
 * it runs `getSQL()` and the dialect's query builders — so a throw there must
 * land in the defect channel rather than escaping as a rejection.
 */
class ThrowingSession extends UnthrownPgSession<never> {
  constructor() {
    super(new PgDialect());
  }

  override prepareQuery(): never {
    throw new Error("prepare exploded");
  }

  override transaction<A, E>(
    _fn: (tx: never) => AsyncResult<A, E>,
    _config?: PgTransactionConfig,
  ): AsyncResult<A, E | PgQueryError> {
    throw new Error("not part of this task");
  }
}

const throwingDb = () =>
  new UnthrownPgDatabase<FakeQueryResultHKT, typeof relations>(
    new PgDialect(),
    new ThrowingSession(),
    relations,
  );

describe("UnthrownPgDatabase — a failure while compiling the query", () => {
  // The reachable, type-legal mistake: `posts.title` is selected but `posts` is
  // never joined, so drizzle throws out of `buildSelectQuery` — inside
  // `_prepare`, ahead of any driver call. Before this was moved inside the
  // failure boundary the throw escaped `then`, and `await` REJECTED: a consumer
  // folding with `match({ ok, errCases, defect })` and no try/catch crashed.
  const broken = () => makeDb(rows([])).db.select({ t: posts.title }).from(users);

  it("yields a Defect when the builder is awaited, rather than rejecting", async () => {
    await expect(broken()).toBeDefect();
  });

  it("yields a Defect from execute(), rather than throwing", async () => {
    expect(await broken().execute()).toBeDefect();
  });

  it("carries drizzle's own compilation error as the defect's cause", async () => {
    const result = await broken();

    expect(isDefect(result)).toBe(true);
    if (isDefect(result)) {
      expect(result.cause).toBeInstanceOf(Error);
      expect((result.cause as Error).message).toContain('the table "posts" is not part of');
    }
  });

  it("does not reject even when the compiled query is never reached", async () => {
    // `.resolves` is the direct statement of the contract: the thenable settles.
    await expect(broken().execute()).resolves.toBeDefined();
  });

  // Every builder prepares inside `execute()`, so each needs the same guard.
  // A session that throws from `prepareQuery` stands in for the whole
  // compile-and-prepare path — including `PgUnthrownCountBuilder.build()`, which
  // compiles without a `_prepare` of its own.
  it.each([
    ["select", () => throwingDb().select().from(users)],
    ["insert", () => throwingDb().insert(users).values({ id: 1, name: "ada" })],
    ["update", () => throwingDb().update(users).set({ name: "grace" })],
    ["delete", () => throwingDb().delete(users)],
    ["$count", () => throwingDb().$count(users)],
    ["relational query", () => throwingDb().query.users.findMany()],
    ["refreshMaterializedView", () => throwingDb().refreshMaterializedView(userCounts)],
  ])("routes a %s prepare failure to the defect channel", async (_name, build) => {
    await expect(build()).toBeDefect();
    expect(await build().execute()).toBeDefect();
  });
});

describe("UnthrownPgDatabase — tagged mode", () => {
  it("threads the tagged flag to the select builder", async () => {
    const session = new FakeSession(rows([[1, "ada"]]));
    // `tagged` is the last constructor flag. It reaches `PgSelectBuilder`, which
    // is meant to put it on the select config so `_prepare` compiles through
    // `dialect._sqlToQuery` (the per-parameter type hints a tagged driver
    // needs). drizzle 1.0.0-rc.4 stores the flag on the builder but never
    // forwards it into the config, so the tagged path is unreachable today —
    // the code mirrors drizzle's own async tree, and this test pins the wiring
    // that exists.
    const db = new UnthrownPgDatabase<FakeQueryResultHKT, typeof relations>(
      new PgDialect(),
      session,
      relations,
      false,
      true,
    );

    const result = await db.select().from(users).where(eq(users.id, 1));

    expect(session.asked[0]?.params).toEqual([1]);
    expect(result).toBeOkWith([{ id: 1, name: "ada" }]);
  });
});

describe("UnthrownPgDatabase — prepared writes", () => {
  it("prepares an insert by name", async () => {
    const { db } = makeDb(rows({ rowCount: 1 }));

    const prepared = db.insert(users).values({ id: 1, name: "ada" }).prepare("add_user");

    expect(await prepared.execute()).toBeOk();
  });

  it("prepares an update by name", async () => {
    const { db } = makeDb(rows({ rowCount: 1 }));

    const prepared = db.update(users).set({ name: "grace" }).prepare("rename_user");

    expect(await prepared.execute()).toBeOk();
  });

  it("prepares a delete by name", async () => {
    const { db } = makeDb(rows({ rowCount: 1 }));

    const prepared = db.delete(users).prepare("clear_users");

    expect(await prepared.execute()).toBeOk();
  });
});
