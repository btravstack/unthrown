// Integration tests against a REAL Prisma client over in-memory SQLite
// (`@prisma/adapter-better-sqlite3`): every mapped P-code is provoked for real —
// a duplicate email for P2002, a dangling relation for P2003, a missing row for
// P2025 — and `$tryTransaction` is exercised end-to-end (commit, rollback on
// `Err`, rollback on defect, `try*` methods available on the itx client). The
// pure P-code mapping gets its own unit block.

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import "@unthrown/vitest";
import { Err, fromSafePromise, P, TaggedError } from "unthrown";
import { describe, expect, test } from "vitest";

import { PrismaClient } from "./generated/prisma/client.ts";
import { qualifyPrismaError, unthrownPrisma } from "./index.js";
import { paginateWithCursor } from "./pagination.js";

// The test schema's tables, created by hand (no Migrate): an in-memory database
// is born empty, and DDL-by-hand keeps the suite free of any migration engine.
const DDL = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE "User" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "name" TEXT)`,
  `CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`,
  `CREATE TABLE "Post" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "title" TEXT NOT NULL, "authorId" INTEGER NOT NULL, CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id"))`,
];

const makeClient = () =>
  new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: ":memory:" }) }).$extends(
    unthrownPrisma,
  );

// Test-context fixtures (lazy — a test only pays for what it destructures):
// `db` is a fresh extended client over its own in-memory database, disconnected
// on teardown; `seededDb` layers six users on top, ids 1..6 — `name` is the
// filter knob: flipping one row to "banned" makes its cursor stop matching a
// `where: { name: "member" }`.
const it = test.extend<{
  db: ReturnType<typeof makeClient>;
  seededDb: ReturnType<typeof makeClient>;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest fixtures require a destructuring pattern; `db` depends on no other fixture
  db: async ({}, use) => {
    const db = makeClient();
    for (const stmt of DDL) await db.$executeRawUnsafe(stmt);
    await use(db);
    await db.$disconnect();
  },
  seededDb: async ({ db }, use) => {
    await db.user.createMany({
      data: [1, 2, 3, 4, 5, 6].map((n) => ({ email: `u${n}@example.com`, name: "member" })),
    });
    await use(db);
  },
});

describe("try* model methods", () => {
  it("wraps a successful create and read in Ok", async ({ db }) => {
    await expect(db.user.tryCreate({ data: { email: "ada@example.com", name: "Ada" } })).toBeOkWith(
      expect.objectContaining({ email: "ada@example.com", name: "Ada" }),
    );
    await expect(db.user.tryFindMany()).toBeOkWith([
      expect.objectContaining({ email: "ada@example.com" }),
    ]);
  });

  it("applies a select at runtime (the narrowed payload is real)", async ({ db }) => {
    await db.user.tryCreate({ data: { email: "ada@example.com", name: "Ada" } });
    await expect(db.user.tryFindMany({ select: { email: true } })).toBeOkWith([
      { email: "ada@example.com" },
    ]);
  });

  it("returns Ok(null) for a findUnique miss (absence is not an error)", async ({ db }) => {
    await expect(db.user.tryFindUnique({ where: { id: 999 } })).toBeOkWith(null);
  });

  it("maps a duplicate key to UniqueConstraintViolation (P2002)", async ({ db }) => {
    await db.user.tryCreate({ data: { email: "dup@example.com" } });
    await expect(db.user.tryCreate({ data: { email: "dup@example.com" } })).toBeErrTagged(
      "UniqueConstraintViolation",
      expect.objectContaining({ fields: ["email"] }),
    );
  });

  it("maps a dangling relation to ForeignKeyViolation (P2003)", async ({ db }) => {
    await expect(db.post.tryCreate({ data: { title: "orphan", authorId: 999 } })).toBeErrTagged(
      "ForeignKeyViolation",
    );
  });

  it("maps a missing row to RecordNotFound (P2025) on findUniqueOrThrow, update, and delete", async ({
    db,
  }) => {
    await expect(db.user.tryFindUniqueOrThrow({ where: { id: 999 } })).toBeErrTagged(
      "RecordNotFound",
    );
    await expect(db.user.tryUpdate({ where: { id: 999 }, data: { name: "x" } })).toBeErrTagged(
      "RecordNotFound",
    );
    await expect(db.user.tryDelete({ where: { id: 999 } })).toBeErrTagged("RecordNotFound");
  });

  // `create` and `upsert` have no row of their own to miss, but a nested
  // `connect` pointing at a record that does not exist raises P2025 all the
  // same — so RecordNotFound belongs in their unions.
  it("models a nested connect to a missing record as RecordNotFound (create and upsert)", async ({
    db,
  }) => {
    await expect(
      db.post.tryCreate({ data: { title: "orphan", author: { connect: { id: 999 } } } }),
    ).toBeErrTagged("RecordNotFound");
    await expect(
      db.post.tryUpsert({
        where: { id: 999 },
        create: { title: "orphan", author: { connect: { id: 999 } } },
        update: {},
      }),
    ).toBeErrTagged("RecordNotFound");
  });

  // The regression this guards: while CreateError omitted RecordNotFound, the
  // match below was exhaustive *by type* yet had no arm for the value that
  // actually arrived — the matcher threw NonExhaustiveError and the
  // throw-to-defect net turned a modeled database failure into a Defect.
  it("keeps that nested-connect failure a VALUE under an exhaustive match (never a Defect)", async ({
    db,
  }) => {
    await expect(
      db.post
        .tryCreate({ data: { title: "orphan", author: { connect: { id: 999 } } } })
        .mapErrCases((matcher) =>
          matcher
            .with(P.tag("UniqueConstraintViolation"), () => "conflict" as const)
            .with(P.tag("ForeignKeyViolation"), () => "bad-reference" as const)
            .with(P.tag("RecordNotFound"), () => "missing" as const),
        ),
    ).toBeErrWith("missing");
  });

  // A malformed query is a BUG, not an anticipated outcome — `Prisma.Exact`
  // rejects it in typed code, so reaching it means the types were cast away.
  it("routes a malformed query (a Prisma validation error) to the DEFECT channel", async ({
    db,
  }) => {
    await expect(db.user.tryFindMany({ where: { bogus: true } } as never)).toBeDefect();
  });

  it("updates, deletes, and counts through the bridge", async ({ db }) => {
    await db.user.tryCreate({ data: { email: "ada@example.com" } });
    await expect(
      db.user.tryUpdate({ where: { email: "ada@example.com" }, data: { name: "Countess" } }),
    ).toBeOkWith(expect.objectContaining({ name: "Countess" }));
    await expect(db.user.tryDelete({ where: { email: "ada@example.com" } })).toBeOkWith(
      expect.objectContaining({ email: "ada@example.com" }),
    );
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("finds the first match — Ok(row) on hit, Ok(null) on miss, RecordNotFound only for OrThrow", async ({
    db,
  }) => {
    await db.user.tryCreate({ data: { email: "bee@example.com", name: "Bee" } });
    await expect(db.user.tryFindFirst({ where: { name: "Bee" } })).toBeOkWith(
      expect.objectContaining({ email: "bee@example.com" }),
    );
    await expect(db.user.tryFindFirst({ where: { name: "nobody" } })).toBeOkWith(null);
    await expect(db.user.tryFindFirstOrThrow({ where: { name: "Bee" } })).toBeOkWith(
      expect.objectContaining({ email: "bee@example.com" }),
    );
    await expect(db.user.tryFindFirstOrThrow({ where: { name: "nobody" } })).toBeErrTagged(
      "RecordNotFound",
    );
  });

  it("creates many — the count, the AndReturn rows, and P2002 for a duplicate in the batch", async ({
    db,
  }) => {
    await expect(
      db.user.tryCreateMany({ data: [{ email: "a@x.com" }, { email: "b@x.com" }] }),
    ).toBeOkWith({ count: 2 });
    await expect(
      db.user.tryCreateManyAndReturn({ data: [{ email: "c@x.com" }], select: { email: true } }),
    ).toBeOkWith([{ email: "c@x.com" }]);
    await expect(db.user.tryCreateMany({ data: [{ email: "a@x.com" }] })).toBeErrTagged(
      "UniqueConstraintViolation",
    );
  });

  it("upserts — creates on miss (never P2025), updates on hit, and models a unique collision", async ({
    db,
  }) => {
    const upsert = (update: { name?: string; email?: string }) =>
      db.user.tryUpsert({
        where: { email: "up@x.com" },
        create: { email: "up@x.com", name: "created" },
        update,
      });
    await expect(upsert({ name: "updated" })).toBeOkWith(
      expect.objectContaining({ name: "created" }),
    );
    await expect(upsert({ name: "updated" })).toBeOkWith(
      expect.objectContaining({ name: "updated" }),
    );
    await db.user.tryCreate({ data: { email: "taken@x.com" } });
    await expect(upsert({ email: "taken@x.com" })).toBeErrTagged("UniqueConstraintViolation");
  });

  it("updates many — the count, Ok(0) on zero matches (never P2025), P2002 on a collision", async ({
    seededDb: db,
  }) => {
    await expect(
      db.user.tryUpdateMany({ where: { name: "member" }, data: { name: "crew" } }),
    ).toBeOkWith({ count: 6 });
    await expect(
      db.user.tryUpdateMany({ where: { name: "nobody" }, data: { name: "x" } }),
    ).toBeOkWith({ count: 0 });
    await expect(
      db.user.tryUpdateMany({ where: { id: 1 }, data: { email: "u2@example.com" } }),
    ).toBeErrTagged("UniqueConstraintViolation");
    await expect(
      db.user.tryUpdateManyAndReturn({
        where: { id: 1 },
        data: { name: "solo" },
        select: { name: true },
      }),
    ).toBeOkWith([{ name: "solo" }]);
  });

  it("deletes many — a referenced parent is P2003; the count otherwise (zero matches is Ok)", async ({
    db,
  }) => {
    await db.user.tryCreate({ data: { email: "parent@x.com" } });
    await db.post.tryCreate({ data: { title: "t", authorId: 1 } });
    await expect(db.user.tryDeleteMany({ where: { id: 1 } })).toBeErrTagged("ForeignKeyViolation");
    await expect(db.post.tryDeleteMany()).toBeOkWith({ count: 1 });
    await expect(db.user.tryDeleteMany()).toBeOkWith({ count: 1 });
    await expect(db.user.tryDeleteMany()).toBeOkWith({ count: 0 });
  });

  it("aggregates and groups through the bridge", async ({ seededDb: db }) => {
    await expect(db.user.tryAggregate({ _count: true, _max: { id: true } })).toBeOkWith({
      _count: 6,
      _max: { id: 6 },
    });
    await expect(db.user.tryGroupBy({ by: ["name"], _count: true })).toBeOkWith([
      { name: "member", _count: 6 },
    ]);
  });
});

describe("$tryTransaction", () => {
  it("commits when the callback returns Ok", async ({ db }) => {
    await expect(
      db.$tryTransaction((tx) => tx.user.tryCreate({ data: { email: "tx@example.com" } })),
    ).toBeOkWith(expect.objectContaining({ email: "tx@example.com" }));
    await expect(db.user.tryCount()).toBeOkWith(1);
  });

  it("rolls back on Err and re-surfaces the callback's typed error", async ({ db }) => {
    class Nope extends TaggedError("Nope") {}
    await expect(
      db.$tryTransaction((tx) =>
        tx.user.tryCreate({ data: { email: "gone@example.com" } }).flatMap(() => Err(new Nope())),
      ),
    ).toBeErrTagged("Nope");
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("rolls back on a defect and the defect stays a defect", async ({ db }) => {
    await expect(
      db.$tryTransaction((tx) =>
        tx.user.tryCreate({ data: { email: "boom@example.com" } }).map(() => {
          throw new Error("boom");
        }),
      ),
    ).toBeDefect();
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("a callback that THROWS (instead of returning an AsyncResult) is a defect", async ({ db }) => {
    // The throw bypasses every combinator (no AsyncResult exists yet), so it
    // reaches the transaction boundary raw. A bug must stay a defect — never
    // be downgraded into the modeled error channel.
    await expect(
      db.$tryTransaction(() => {
        throw new Error("sync callback bug");
      }),
    ).toBeDefect();
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("a callback that resolves to a raw value (not a Result) is a defect, and rolls back", async ({
    db,
  }) => {
    // Out of contract: the callback resolves to `42` instead of a Result.
    // Dispatching on `result.isOk` would then throw a TypeError OUTSIDE the
    // sentinel try/catch, reject the transaction with a non-Rollback cause,
    // and be downgraded into the modeled error channel. A bug must stay a defect
    // — and the write made before the rogue return must be rolled back.
    const rogue = (async (tx: { user: { tryCreate: (args: unknown) => PromiseLike<unknown> } }) => {
      await tx.user.tryCreate({ data: { email: "rogue@example.com" } });
      return 42;
    }) as never;
    const result = await db.$tryTransaction(rogue);
    expect(result).toBeDefect();
    if (result.isDefect()) {
      expect(result.cause).toBeInstanceOf(TypeError);
      expect((result.cause as TypeError).message).toMatch(/did not return a Result/);
    }
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("surfaces a query failure inside the transaction as its tagged error", async ({ db }) => {
    await db.user.tryCreate({ data: { email: "dup@example.com" } });
    await expect(
      db.$tryTransaction((tx) => tx.user.tryCreate({ data: { email: "dup@example.com" } })),
    ).toBeErrTagged("UniqueConstraintViolation");
  });

  it("routes a transaction-level failure (commit after timeout) to the defect channel", async ({
    db,
  }) => {
    // The callback outlives the transaction timeout WITHOUT touching `tx`, so the
    // rejection comes from Prisma's commit — not through the sentinel.
    await expect(
      db.$tryTransaction(
        () => fromSafePromise(new Promise((resolve) => setTimeout(resolve, 100))).map(() => "ok"),
        { timeout: 10 },
      ),
    ).toBeDefect();
  });
});

describe("$tryTransaction (batch form)", () => {
  it("commits every operation in one transaction", async ({ db }) => {
    await expect(
      db.$tryTransaction([
        db.user.create({ data: { email: "a@example.com" } }),
        db.user.create({ data: { email: "b@example.com" } }),
      ]),
    ).toBeOkWith([
      expect.objectContaining({ email: "a@example.com" }),
      expect.objectContaining({ email: "b@example.com" }),
    ]);
    await expect(db.user.tryCount()).toBeOkWith(2);
  });

  it("models a constraint violation and rolls the whole batch back", async ({ db }) => {
    await expect(
      db.$tryTransaction([
        db.user.create({ data: { email: "first@example.com" } }),
        db.user.create({ data: { email: "dup@example.com" } }),
        db.user.create({ data: { email: "dup@example.com" } }),
      ]),
    ).toBeErrTagged("UniqueConstraintViolation");
    // The rollback is asserted against the DATABASE, not inferred from the Err.
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("an empty batch is Ok([])", async ({ db }) => {
    await expect(db.$tryTransaction([])).toBeOkWith([]);
  });

  it("threads options through on the batch path", async ({ db }) => {
    await expect(
      db.$tryTransaction([db.user.count()], { isolationLevel: "Serializable" }),
    ).toBeOkWith([0]);
  });
});

describe("tryPaginate / withCursor", () => {
  const ids = (rows: ReadonlyArray<{ id: number }>) => rows.map((r) => r.id);

  it("serves the first page with default cursors", async ({ seededDb: db }) => {
    const page = await db.user.tryPaginate({ orderBy: { id: "asc" } }).withCursor({ limit: 2 });
    expect(page.isOk() && [ids(page.value[0]), page.value[1]]).toEqual([
      [1, 2],
      { hasPreviousPage: false, hasNextPage: true, startCursor: "1", endCursor: "2" },
    ]);
  });

  it("pages forward with after (exclusive) and reports both flags", async ({ seededDb: db }) => {
    const page = await db.user
      .tryPaginate({ orderBy: { id: "asc" } })
      .withCursor({ limit: 2, after: "2" });
    expect(page.isOk() && [ids(page.value[0]), page.value[1]]).toEqual([
      [3, 4],
      { hasPreviousPage: true, hasNextPage: true, startCursor: "3", endCursor: "4" },
    ]);
  });

  it("reaches the last page with hasNextPage false", async ({ seededDb: db }) => {
    const page = await db.user
      .tryPaginate({ orderBy: { id: "asc" } })
      .withCursor({ limit: 2, after: "5" });
    expect(page.isOk() && [ids(page.value[0]), page.value[1]]).toEqual([
      [6],
      { hasPreviousPage: true, hasNextPage: false, startCursor: "6", endCursor: "6" },
    ]);
  });

  it("pages backward with before (exclusive)", async ({ seededDb: db }) => {
    const page = await db.user
      .tryPaginate({ orderBy: { id: "asc" } })
      .withCursor({ limit: 2, before: "4" });
    expect(page.isOk() && [ids(page.value[0]), page.value[1]]).toEqual([
      [2, 3],
      { hasPreviousPage: true, hasNextPage: true, startCursor: "2", endCursor: "3" },
    ]);
  });

  it("serves an empty page past the end with null cursors", async ({ seededDb: db }) => {
    const page = await db.user
      .tryPaginate({ orderBy: { id: "asc" } })
      .withCursor({ limit: 2, after: "6" });
    expect(page.isOk() && [ids(page.value[0]), page.value[1]]).toEqual([
      [],
      { hasPreviousPage: true, hasNextPage: false, startCursor: null, endCursor: null },
    ]);
  });

  it("returns everything with limit null, from the after cursor when given", async ({
    seededDb: db,
  }) => {
    const all = await db.user.tryPaginate({ orderBy: { id: "asc" } }).withCursor({ limit: null });
    expect(all.isOk() && [ids(all.value[0]), all.value[1].hasNextPage]).toEqual([
      [1, 2, 3, 4, 5, 6],
      false,
    ]);
    const rest = await db.user
      .tryPaginate({ orderBy: { id: "asc" } })
      .withCursor({ limit: null, after: "4" });
    expect(rest.isOk() && [ids(rest.value[0]), rest.value[1].hasPreviousPage]).toEqual([
      [5, 6],
      true,
    ]);
  });

  // The fix carried over from deptyped/prisma-extension-pagination#35:
  // when the AFTER cursor row was mutated and no longer matches the filter, the
  // first element of the page must NOT be skipped.
  it("does not skip the first element when the after cursor no longer matches the filter", async ({
    seededDb: db,
  }) => {
    await db.user.update({ where: { id: 3 }, data: { name: "banned" } });
    const query = { where: { name: "member" }, orderBy: { id: "asc" } } as const;
    const wide = await db.user.tryPaginate(query).withCursor({ limit: 2, after: "3" });
    expect(wide.isOk() && [ids(wide.value[0]), wide.value[1]]).toEqual([
      [4, 5],
      { hasPreviousPage: true, hasNextPage: true, startCursor: "4", endCursor: "5" },
    ]);
    // limit 1 exercises the fully-over-fetched trim (limit + 2 rows come back).
    const narrow = await db.user.tryPaginate(query).withCursor({ limit: 1, after: "3" });
    expect(narrow.isOk() && [ids(narrow.value[0]), narrow.value[1].hasNextPage]).toEqual([
      [4],
      true,
    ]);
  });

  it("does not skip the last element when the before cursor no longer matches the filter", async ({
    seededDb: db,
  }) => {
    await db.user.update({ where: { id: 4 }, data: { name: "banned" } });
    const query = { where: { name: "member" }, orderBy: { id: "asc" } } as const;
    const wide = await db.user.tryPaginate(query).withCursor({ limit: 2, before: "4" });
    expect(wide.isOk() && [ids(wide.value[0]), wide.value[1]]).toEqual([
      [2, 3],
      { hasPreviousPage: true, hasNextPage: true, startCursor: "2", endCursor: "3" },
    ]);
    // limit 1 exercises the fully-over-fetched trim on the backward side.
    const narrow = await db.user.tryPaginate(query).withCursor({ limit: 1, before: "4" });
    expect(narrow.isOk() && [ids(narrow.value[0]), narrow.value[1].hasPreviousPage]).toEqual([
      [3],
      true,
    ]);
  });

  it("supports a custom cursor serialization (email)", async ({ seededDb: db }) => {
    const page = await db.user.tryPaginate({ orderBy: { id: "asc" } }).withCursor({
      limit: 2,
      after: "u2@example.com",
      getCursor: (row) => row.email,
      parseCursor: (cursor) => ({ email: cursor }),
    });
    expect(page.isOk() && [ids(page.value[0]), page.value[1].endCursor]).toEqual([
      [3, 4],
      "u4@example.com",
    ]);
  });

  it("paginates a narrowed selection", async ({ seededDb: db }) => {
    await expect(
      db.user
        .tryPaginate({ select: { id: true }, orderBy: { id: "asc" } })
        .withCursor({ limit: 2 }),
    ).toBeOkWith([
      [{ id: 1 }, { id: 2 }],
      { hasPreviousPage: false, hasNextPage: true, startCursor: "1", endCursor: "2" },
    ]);
  });

  // `getCursor` reads rows WE fetched, so a throw there is a bug in the caller's
  // selection, not bad input from a client — the defect channel, not InvalidCursor.
  it("routes a default cursor over a selection without id to the DEFECT channel", async ({
    seededDb: db,
  }) => {
    await expect(
      db.user.tryPaginate({ select: { email: true } }).withCursor({ limit: 2 }),
    ).toBeDefect();
  });

  // The pagination carve-out. Prisma rejects this with a
  // PrismaClientValidationError, which the `try*` surface routes to the DEFECT
  // channel — but here the cursor is an OPAQUE STRING from the outside world, so
  // a client sending garbage is anticipated input, not a bug. It must stay a
  // modeled Err the caller can turn into a 400.
  it("models a malformed cursor as InvalidCursor, not a defect", async ({ seededDb: db }) => {
    // Default parseCursor keeps a non-numeric cursor as a string — invalid for
    // this model's Int id, so Prisma rejects it.
    await expect(
      db.user.tryPaginate({ orderBy: { id: "asc" } }).withCursor({ limit: 2, after: "not-an-id" }),
    ).toBeErrTagged("InvalidCursor");
  });

  // The other half of the carve-out: the caller's own `parseCursor` rejecting a
  // client-supplied string is the same anticipated bad input.
  it("models a throwing parseCursor on a request cursor as InvalidCursor", async ({
    seededDb: db,
  }) => {
    await expect(
      db.user.tryPaginate({ orderBy: { id: "asc" } }).withCursor({
        limit: 2,
        after: "garbage",
        parseCursor: (cursor) => {
          throw new Error(`unparseable: ${cursor}`);
        },
      }),
    ).toBeErrTagged("InvalidCursor");
  });

  // ...but the SAME throw while re-parsing a cursor we generated ourselves is a
  // bug in the caller's cursor functions, and stays a defect.
  it("routes a throwing getCursor to the DEFECT channel", async ({ seededDb: db }) => {
    await expect(
      db.user.tryPaginate({ orderBy: { id: "asc" } }).withCursor({
        limit: 2,
        getCursor: () => {
          throw new Error("no cursor for this row");
        },
      }),
    ).toBeDefect();
  });

  // The `before` + `limit: null` combination is typed away at the public
  // surface (Prisma's negative take cannot express it); untyped callers get
  // the upstream library's behavior. Runtime-only, via the engine directly.
  it("keeps upstream parity for an untyped limit:null + before", async () => {
    const rows = () => [{ id: 1 }, { id: 2 }];
    const model = { findMany: () => Promise.resolve(rows()) };
    await expect(
      paginateWithCursor(model, undefined, { limit: null, before: "9" }),
    ).resolves.toEqual([
      [{ id: 1 }, { id: 2 }],
      { hasPreviousPage: false, hasNextPage: true, startCursor: "1", endCursor: "2" },
    ]);
  });

  it("rejects when the default cursor meets a null id", async () => {
    const model = { findMany: () => Promise.resolve([{ id: null }]) };
    await expect(paginateWithCursor(model, undefined, { limit: 2 })).rejects.toThrow(
      /default cursor reads the `id` field/,
    );
  });

  it("the DEFAULT parser preserves a BigInt id beyond Number.MAX_SAFE_INTEGER", async () => {
    // 2^53 + 1 is not representable as a number; a Number(...) default would
    // silently address the wrong row. The default parser must emit a bigint —
    // and still emit a plain number for safe-range ids.
    const big = 9007199254740993n; // 2^53 + 1
    const seen: unknown[] = [];
    const model = {
      findMany: (args: object) => {
        seen.push((args as { cursor?: unknown }).cursor);
        return Promise.resolve(
          (args as { take?: number }).take === -1 ? [{ id: big }] : [{ id: big }, { id: big + 1n }],
        );
      },
    };
    await expect(
      paginateWithCursor(model, undefined, { limit: 2, after: String(big) }),
    ).resolves.toEqual([
      [{ id: big + 1n }],
      {
        hasPreviousPage: true,
        hasNextPage: false,
        startCursor: "9007199254740994",
        endCursor: "9007199254740994",
      },
    ]);
    // The cursor Prisma received is the EXACT bigint, not a lossy number.
    expect(seen[0]).toEqual({ id: big });
  });

  it("compares cursors structurally — bigint ids survive the round-trip", async () => {
    // JSON.stringify-based comparison would throw on bigint cursor values.
    const model = {
      findMany: (args: object) =>
        Promise.resolve(
          (args as { take?: number }).take === -1
            ? [{ id: 1n }]
            : [{ id: 1n }, { id: 2n }, { id: 3n }],
        ),
    };
    await expect(
      paginateWithCursor(model, undefined, {
        limit: 2,
        after: "1",
        getCursor: (row: { id: bigint }) => String(row.id),
        parseCursor: (cursor) => ({ id: BigInt(cursor) }),
      }),
    ).resolves.toEqual([
      [{ id: 2n }, { id: 3n }],
      { hasPreviousPage: true, hasNextPage: false, startCursor: "2", endCursor: "3" },
    ]);
  });

  it("compares cursors structurally — Date and array values round-trip", async () => {
    // A composite cursor carrying a DateTime and a (contrived) array: both
    // compare by value, not by reference.
    const rows = [
      { at: new Date(1000), tags: ["a", "b"] },
      { at: new Date(2000), tags: ["c"] },
    ];
    const model = {
      findMany: (args: object) =>
        Promise.resolve((args as { take?: number }).take === -1 ? [rows[0]] : [...rows]),
    };
    const cursorOf = (row: { at: Date; tags: string[] }) =>
      `${row.at.getTime()}|${row.tags.join(",")}`;
    await expect(
      paginateWithCursor(model, undefined, {
        limit: 2,
        after: cursorOf(rows[0]!),
        getCursor: cursorOf,
        parseCursor: (cursor) => {
          const [at = "", tags = ""] = cursor.split("|");
          return { at: new Date(Number(at)), tags: tags.split(",") };
        },
      }),
    ).resolves.toEqual([
      [rows[1]],
      { hasPreviousPage: true, hasNextPage: false, startCursor: "2000|c", endCursor: "2000|c" },
    ]);
  });

  it("compares cursors structurally — key order does not matter", async () => {
    // The request cursor and the boundary row's cursor are parsed by separate
    // calls; a parseCursor emitting keys in a different order each time must
    // still round-trip (JSON.stringify comparison would false-negative and
    // leave the cursor row in the page).
    let flip = false;
    const rows = [
      { userId: 1, postId: 2 },
      { userId: 3, postId: 4 },
    ];
    const model = {
      findMany: (args: object) =>
        Promise.resolve((args as { take?: number }).take === -1 ? [rows[0]] : [...rows]),
    };
    await expect(
      paginateWithCursor(model, undefined, {
        limit: 2,
        after: "1:2",
        getCursor: (row: { userId: number; postId: number }) => `${row.userId}:${row.postId}`,
        parseCursor: () => {
          flip = !flip;
          return flip ? { userId: 1, postId: 2 } : { postId: 2, userId: 1 };
        },
      }),
    ).resolves.toEqual([
      [{ userId: 3, postId: 4 }],
      { hasPreviousPage: true, hasNextPage: false, startCursor: "3:4", endCursor: "3:4" },
    ]);
  });
});

describe("qualifyPrismaError", () => {
  const known = (code: string, meta?: Record<string, unknown>) =>
    new PrismaClientKnownRequestError("boom", {
      code,
      clientVersion: "7.0.0",
      ...(meta ? { meta } : {}),
    });

  // Stands in for the `defect` helper a boundary injects: a distinguishable
  // marker, so a test can tell "routed to the defect channel" from "mapped".
  const DEFECTED = Symbol("defected");
  const defect = (cause: unknown) => ({ [DEFECTED]: cause }) as const;
  const qualify = (cause: unknown) => qualifyPrismaError(cause, defect);

  // A Prisma error class the extension recognizes by `name` alone (the runtime
  // module path moves between Prisma majors, so `instanceof` is not an option).
  const named = (name: string) => Object.assign(new Error("boom"), { name });

  it("maps P2002 to UniqueConstraintViolation with the offending fields", () => {
    const cause = known("P2002", { target: ["email"] });
    expect(qualify(cause)).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: ["email"], cause }),
    );
  });

  it("maps P2002 in the driver-adapter shape (fields nested under driverAdapterError)", () => {
    const cause = known("P2002", {
      driverAdapterError: { cause: { constraint: { fields: ["email"] } } },
    });
    expect(qualify(cause)).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: ["email"], cause }),
    );
  });

  it("maps P2002 without a target to an empty field list", () => {
    expect(qualify(known("P2002"))).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: [] }),
    );
  });

  it.each([
    { driverAdapterError: "junk" },
    { driverAdapterError: { cause: "junk" } },
    { driverAdapterError: { cause: { constraint: "junk" } } },
    { driverAdapterError: { cause: { constraint: { fields: "email" } } } },
  ])("maps P2002 with a malformed meta (%j) to an empty field list", (meta) => {
    expect(qualify(known("P2002", meta))).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: [] }),
    );
  });

  it("maps P2003 to ForeignKeyViolation", () => {
    const cause = known("P2003");
    expect(qualify(cause)).toEqual(expect.objectContaining({ _tag: "ForeignKeyViolation", cause }));
  });

  it.each(["P2025", "P2018"])(
    "maps %s to RecordNotFound (the to-one and to-many sides of the same failure)",
    (code) => {
      const cause = known(code);
      expect(qualify(cause)).toEqual(expect.objectContaining({ _tag: "RecordNotFound", cause }));
    },
  );

  // Thesis #1: `E` lists only the failures a caller branches on. Everything
  // infrastructural takes the defect channel — nobody writes domain logic for a
  // dropped connection, they log it and 500, which is what `match`'s `defect`
  // arm already does.
  it.each([
    ["a connection-pool timeout", () => known("P2024")],
    ["a write conflict / deadlock", () => known("P2034")],
    ["an unreachable database server", () => known("P1001")],
    ["any other unmapped P-code", () => known("P2021")],
    ["a malformed query", () => named("PrismaClientValidationError")],
    ["a client that could not start", () => named("PrismaClientInitializationError")],
    ["an engine panic", () => named("PrismaClientRustPanicError")],
    ["an unknown request error", () => named("PrismaClientUnknownRequestError")],
    ["a non-Prisma rejection", () => new Error("socket hang up")],
  ])("routes %s to the DEFECT channel, not to E", (_label, make) => {
    const cause = make();
    expect(qualify(cause)).toEqual(defect(cause));
  });
});
