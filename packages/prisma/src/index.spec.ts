// Integration tests against a REAL Prisma client over in-memory SQLite
// (`@prisma/adapter-better-sqlite3`): every mapped P-code is provoked for real —
// a duplicate email for P2002, a dangling relation for P2003, a missing row for
// P2025 — and `$tryTransaction` is exercised end-to-end (commit, rollback on
// `Err`, rollback on defect, `try*` methods available on the itx client). The
// pure P-code mapping gets its own unit block.

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import "@unthrown/vitest";
import { Err, fromSafePromise, TaggedError } from "unthrown";
import { afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "./generated/prisma/client.ts";
import { qualifyPrismaError, unthrownPrisma } from "./index.js";

// The test schema's tables, created by hand (no Migrate): an in-memory database
// is born empty, and DDL-by-hand keeps the suite free of any migration engine.
const DDL = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE "User" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "name" TEXT)`,
  `CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`,
  `CREATE TABLE "Post" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "title" TEXT NOT NULL, "authorId" INTEGER NOT NULL, CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id"))`,
];

const open: Array<{ $disconnect: () => Promise<void> }> = [];

const makeDb = async () => {
  const adapter = new PrismaBetterSqlite3({ url: ":memory:" });
  const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);
  open.push(db);
  for (const stmt of DDL) await db.$executeRawUnsafe(stmt);
  return db;
};

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.$disconnect()));
});

describe("try* model methods", () => {
  it("wraps a successful create and read in Ok", async () => {
    const db = await makeDb();
    await expect(db.user.tryCreate({ data: { email: "ada@example.com", name: "Ada" } })).toBeOkWith(
      expect.objectContaining({ email: "ada@example.com", name: "Ada" }),
    );
    await expect(db.user.tryFindMany()).toBeOkWith([
      expect.objectContaining({ email: "ada@example.com" }),
    ]);
  });

  it("applies a select at runtime (the narrowed payload is real)", async () => {
    const db = await makeDb();
    await db.user.tryCreate({ data: { email: "ada@example.com", name: "Ada" } });
    await expect(db.user.tryFindMany({ select: { email: true } })).toBeOkWith([
      { email: "ada@example.com" },
    ]);
  });

  it("returns Ok(null) for a findUnique miss (absence is not an error)", async () => {
    const db = await makeDb();
    await expect(db.user.tryFindUnique({ where: { id: 999 } })).toBeOkWith(null);
  });

  it("maps a duplicate key to UniqueConstraintViolation (P2002)", async () => {
    const db = await makeDb();
    await db.user.tryCreate({ data: { email: "dup@example.com" } });
    await expect(db.user.tryCreate({ data: { email: "dup@example.com" } })).toBeErrTagged(
      "UniqueConstraintViolation",
      expect.objectContaining({ fields: ["email"] }),
    );
  });

  it("maps a dangling relation to ForeignKeyViolation (P2003)", async () => {
    const db = await makeDb();
    await expect(db.post.tryCreate({ data: { title: "orphan", authorId: 999 } })).toBeErrTagged(
      "ForeignKeyViolation",
    );
  });

  it("maps a missing row to RecordNotFound (P2025) on findUniqueOrThrow, update, and delete", async () => {
    const db = await makeDb();
    await expect(db.user.tryFindUniqueOrThrow({ where: { id: 999 } })).toBeErrTagged(
      "RecordNotFound",
    );
    await expect(db.user.tryUpdate({ where: { id: 999 }, data: { name: "x" } })).toBeErrTagged(
      "RecordNotFound",
    );
    await expect(db.user.tryDelete({ where: { id: 999 } })).toBeErrTagged("RecordNotFound");
  });

  it("updates, deletes, and counts through the bridge", async () => {
    const db = await makeDb();
    await db.user.tryCreate({ data: { email: "ada@example.com" } });
    await expect(
      db.user.tryUpdate({ where: { email: "ada@example.com" }, data: { name: "Countess" } }),
    ).toBeOkWith(expect.objectContaining({ name: "Countess" }));
    await expect(db.user.tryDelete({ where: { email: "ada@example.com" } })).toBeOkWith(
      expect.objectContaining({ email: "ada@example.com" }),
    );
    await expect(db.user.tryCount()).toBeOkWith(0);
  });
});

describe("$tryTransaction", () => {
  it("commits when the callback returns Ok", async () => {
    const db = await makeDb();
    await expect(
      db.$tryTransaction((tx) => tx.user.tryCreate({ data: { email: "tx@example.com" } })),
    ).toBeOkWith(expect.objectContaining({ email: "tx@example.com" }));
    await expect(db.user.tryCount()).toBeOkWith(1);
  });

  it("rolls back on Err and re-surfaces the callback's typed error", async () => {
    class Nope extends TaggedError("Nope") {}
    const db = await makeDb();
    await expect(
      db.$tryTransaction((tx) =>
        tx.user.tryCreate({ data: { email: "gone@example.com" } }).flatMap(() => Err(new Nope())),
      ),
    ).toBeErrTagged("Nope");
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("rolls back on a defect and the defect stays a defect", async () => {
    const db = await makeDb();
    await expect(
      db.$tryTransaction((tx) =>
        tx.user.tryCreate({ data: { email: "boom@example.com" } }).map(() => {
          throw new Error("boom");
        }),
      ),
    ).toBeDefect();
    await expect(db.user.tryCount()).toBeOkWith(0);
  });

  it("surfaces a query failure inside the transaction as its tagged error", async () => {
    const db = await makeDb();
    await db.user.tryCreate({ data: { email: "dup@example.com" } });
    await expect(
      db.$tryTransaction((tx) => tx.user.tryCreate({ data: { email: "dup@example.com" } })),
    ).toBeErrTagged("UniqueConstraintViolation");
  });

  it("qualifies a transaction-level failure (commit after timeout) as DriverError", async () => {
    const db = await makeDb();
    // The callback outlives the transaction timeout WITHOUT touching `tx`, so the
    // rejection comes from Prisma's commit — not through the sentinel.
    await expect(
      db.$tryTransaction(
        () => fromSafePromise(new Promise((resolve) => setTimeout(resolve, 100))).map(() => "ok"),
        { timeout: 10 },
      ),
    ).toBeErrTagged("DriverError");
  });
});

describe("qualifyPrismaError", () => {
  const known = (code: string, meta?: Record<string, unknown>) =>
    new PrismaClientKnownRequestError("boom", {
      code,
      clientVersion: "7.0.0",
      ...(meta ? { meta } : {}),
    });

  it("maps P2002 to UniqueConstraintViolation with the offending fields", () => {
    const cause = known("P2002", { target: ["email"] });
    expect(qualifyPrismaError(cause)).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: ["email"], cause }),
    );
  });

  it("maps P2002 in the driver-adapter shape (fields nested under driverAdapterError)", () => {
    const cause = known("P2002", {
      driverAdapterError: { cause: { constraint: { fields: ["email"] } } },
    });
    expect(qualifyPrismaError(cause)).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: ["email"], cause }),
    );
  });

  it("maps P2002 without a target to an empty field list", () => {
    expect(qualifyPrismaError(known("P2002"))).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: [] }),
    );
  });

  it.each([
    { driverAdapterError: "junk" },
    { driverAdapterError: { cause: "junk" } },
    { driverAdapterError: { cause: { constraint: "junk" } } },
    { driverAdapterError: { cause: { constraint: { fields: "email" } } } },
  ])("maps P2002 with a malformed meta (%j) to an empty field list", (meta) => {
    expect(qualifyPrismaError(known("P2002", meta))).toEqual(
      expect.objectContaining({ _tag: "UniqueConstraintViolation", fields: [] }),
    );
  });

  it("maps P2003 to ForeignKeyViolation", () => {
    const cause = known("P2003");
    expect(qualifyPrismaError(cause)).toEqual(
      expect.objectContaining({ _tag: "ForeignKeyViolation", cause }),
    );
  });

  it("maps P2025 to RecordNotFound", () => {
    const cause = known("P2025");
    expect(qualifyPrismaError(cause)).toEqual(
      expect.objectContaining({ _tag: "RecordNotFound", cause }),
    );
  });

  it("maps an unhandled P-code to DriverError", () => {
    const cause = known("P2024");
    expect(qualifyPrismaError(cause)).toEqual(
      expect.objectContaining({ _tag: "DriverError", cause }),
    );
  });

  it("maps a non-Prisma rejection to DriverError, preserving the cause", () => {
    const cause = new Error("socket hang up");
    expect(qualifyPrismaError(cause)).toEqual(
      expect.objectContaining({ _tag: "DriverError", cause }),
    );
  });
});
