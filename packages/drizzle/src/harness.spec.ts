import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
  // `startPg`'s partial-startup failure path both rely on (test-harness.ts
  // review finding: a failing release step must never mask or skip another
  // one). Exercised directly against the real exported function with
  // deliberately failing steps — no server/pg mocking required, since the
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
    // Two fixtures at once, which is also the shape the suite itself runs in:
    // every worker creates databases on the one shared server concurrently.
    // The timeout stays generous because the work is a real `CREATE DATABASE`
    // on a server other workers are hammering, not because it is expected to
    // be slow.
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

describe("test harness startup", () => {
  it("still hands back a usable fixture when the admin connection will not close", async () => {
    // The admin helper throws if and only if the STATEMENT failed. A
    // `CREATE DATABASE` that SUCCEEDED on a connection that then refuses to
    // close must not reject startup: the caller would never receive a `stop()`,
    // and the database just created would be orphaned with nothing left holding
    // a handle to drop it. Forced here rather than reasoned about, because
    // `pg.Client#end()` does not fail on its own.
    // Annotated to the promise overload: `end` is overloaded with a callback
    // form, and a bare `realEnd.call(this)` resolves to that one.
    const realEnd: (this: pg.Client) => Promise<void> = pg.Client.prototype.end;
    const end = vi.spyOn(pg.Client.prototype, "end");
    end.mockImplementationOnce(async function endThatFailsAfterClosing(this: pg.Client) {
      // Closed for real first, so the test leaks no connection of its own —
      // only the REPORTING of the close is broken, which is the case under test.
      await realEnd.call(this);
      throw new Error("admin connection refused to close");
    });

    let fixture: PgFixture;
    try {
      fixture = await startPg();
    } finally {
      // Restored before any assertion, so a failure below cannot leave the
      // prototype patched for the rest of the file.
      end.mockRestore();
    }

    try {
      // The database exists and is reachable: the close failure was swallowed,
      // not turned into a startup failure that stranded it.
      const r = await fixture.pool.query<{ n: number }>("SELECT 1 AS n");
      expect(r.rows[0]?.n).toBe(1);
    } finally {
      // And the caller really does hold the handle that drops it.
      await fixture.stop();
    }
  });
});
