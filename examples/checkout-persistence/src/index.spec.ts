import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterEach, beforeEach, expect, test } from "vitest";
import "@unthrown/vitest";

import { PrismaClient } from "./generated/prisma/client.js";
import { createRepository } from "./index.js";

// The test schema's tables, created by hand (no Migrate): an in-memory
// database is born empty, and DDL-by-hand keeps the suite free of any
// migration engine — the same approach packages/prisma's own suite uses.
const DDL = [
  `CREATE TABLE "Cart" ("id" TEXT PRIMARY KEY)`,
  `CREATE TABLE "CartLine" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "sku" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "unitPrice" INTEGER NOT NULL, "cartId" TEXT NOT NULL)`,
  `CREATE TABLE "Order" ("id" TEXT PRIMARY KEY, "total" INTEGER NOT NULL, "cartId" TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX "Order_cartId_key" ON "Order"("cartId")`,
];

// An in-memory database per test: no file, no server, nothing to clean up
// beyond the client itself — see the `afterEach` below. Copying this fixture
// into a server-backed suite without that teardown would leak a connection
// per test.
const client = () => new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: ":memory:" }) });

let db: PrismaClient;
let repo: ReturnType<typeof createRepository>;

beforeEach(async () => {
  db = client();
  for (const stmt of DDL) await db.$executeRawUnsafe(stmt);
  repo = createRepository(db);
});

afterEach(async () => {
  await db.$disconnect();
});

test("a missing cart is a modelled CartNotFound, not a defect", async () => {
  await expect(repo.findCart("nope")).toBeErrTagged("CartNotFound", { cartId: "nope" });
});

test("a found cart maps every line back, including unitPrice", async () => {
  await db.cart.create({
    data: {
      id: "cart_1",
      lines: {
        create: [
          { sku: "COFFEE-1KG", quantity: 2, unitPrice: 12_00 },
          { sku: "MUG", quantity: 1, unitPrice: 5_00 },
        ],
      },
    },
  });

  await expect(repo.findCart("cart_1")).toBeOkWith({
    id: "cart_1",
    lines: [
      { sku: "COFFEE-1KG", quantity: 2, unitPrice: 12_00 },
      { sku: "MUG", quantity: 1, unitPrice: 5_00 },
    ],
  });
});

test("saving the same cart's order twice is a modelled unique violation", async () => {
  await expect(repo.saveOrder({ id: "o1", total: 100, cartId: "c1" })).toBeOk();
  await expect(repo.saveOrder({ id: "o2", total: 100, cartId: "c1" })).toBeErrTagged(
    "UniqueConstraintViolation",
  );
});
