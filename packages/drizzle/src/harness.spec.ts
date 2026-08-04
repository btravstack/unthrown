import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { collectErrors, type PgFixture, startPg } from "./test-harness.js";

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

describe("collectErrors", () => {
  // Unit-level coverage of the collect-and-continue discipline `stop()` and
  // `startPg`'s partial-startup failure paths both rely on (test-harness.ts
  // review finding: a failing release step must never mask or skip another
  // one). Exercised directly against the real exported function with
  // deliberately failing steps — no PGlite/pg mocking required, since the
  // behaviour under test lives entirely in `collectErrors` itself.

  it("runs every step and returns an empty array when all succeed", async () => {
    const calls: number[] = [];
    const errors = await collectErrors([
      async () => {
        calls.push(1);
      },
      async () => {
        calls.push(2);
      },
    ]);

    expect(errors).toEqual([]);
    expect(calls).toEqual([1, 2]);
  });

  it("continues past a failing step instead of skipping the rest", async () => {
    const calls: number[] = [];
    const boom = new Error("step 2 failed");

    const errors = await collectErrors([
      async () => {
        calls.push(1);
      },
      async () => {
        calls.push(2);
        throw boom;
      },
      async () => {
        calls.push(3);
      },
    ]);

    // The critical assertion: step 3 still ran even though step 2 threw —
    // this is exactly the leak the review finding was about (a failing
    // `server.stop()` must not skip `db.close()`).
    expect(calls).toEqual([1, 2, 3]);
    expect(errors).toEqual([boom]);
  });

  it("collects every failure, in order, rather than only the first", async () => {
    const first = new Error("first failed");
    const second = new Error("second failed");

    const errors = await collectErrors([
      async () => {
        throw first;
      },
      async () => undefined,
      async () => {
        throw second;
      },
    ]);

    expect(errors).toEqual([first, second]);
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
