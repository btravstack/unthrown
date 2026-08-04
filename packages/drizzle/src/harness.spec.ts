import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type PgFixture, startPg } from "./test-harness.js";

describe("test harness", () => {
  let fixture: PgFixture;

  beforeAll(async () => {
    fixture = await startPg();
  });
  afterAll(async () => {
    await fixture.stop();
  });

  it("serves a real Postgres over the wire protocol", async () => {
    const r = await fixture.pool.query<{ n: number }>("SELECT 1 AS n");
    expect(r.rows[0]?.n).toBe(1);
  });

  it("reports real SQLSTATE codes with locale-independent fields", async () => {
    await fixture.pool.query(`CREATE TABLE h (id int primary key, email text UNIQUE)`);
    await fixture.pool.query(`INSERT INTO h VALUES (1, 'a@b.c')`);

    const err = await fixture.pool.query(`INSERT INTO h VALUES (2, 'a@b.c')`).then(
      () => undefined,
      (e: unknown) => e as Record<string, unknown>,
    );

    expect(err?.["code"]).toBe("23505");
    expect(err?.["constraint"]).toBe("h_email_key");
    expect(err?.["table"]).toBe("h");
  });
});

describe("test harness isolation", () => {
  it("does not let two concurrent fixtures see each other's tables", async () => {
    // Booting two PGlite (WASM) instances concurrently reliably exceeds
    // vitest's 5s default test timeout on a loaded machine, even though
    // neither fixture is hung — confirmed by running this with a 30s
    // timeout and observing ~8-9s total. Widened rather than optimised
    // away: startup cost is inherent to two independent WASM instances.
    const [a, b] = await Promise.all([startPg(), startPg()]);

    try {
      await a.pool.query("CREATE TABLE iso_only_in_a (id int primary key)");

      await expect(a.pool.query("SELECT * FROM iso_only_in_a")).resolves.toBeDefined();
      await expect(b.pool.query("SELECT * FROM iso_only_in_a")).rejects.toMatchObject({
        code: "42P01", // undefined_table
      });
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
  }, 30_000);
});
