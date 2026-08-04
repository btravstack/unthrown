import { DrizzleQueryError } from "drizzle-orm/errors";
import { PgDialect } from "drizzle-orm/pg-core/dialect";
import type { PreparedQueryConfig } from "drizzle-orm/pg-core/session";
import { placeholder, type Query, sql } from "drizzle-orm/sql/sql";
import { type AsyncResult, isDefect, isErr, isOk } from "unthrown";
import { describe, expect, it } from "vitest";

import type { PgQueryError } from "../errors.js";
import { UniqueConstraintViolation } from "../errors.js";
import { PgUnthrownPreparedQuery, PgUnthrownSession } from "./session.js";

const noopLogger = { logQuery: () => undefined };
const query: Query = { sql: "select 1", params: [] };

const prepared = (executor: () => Promise<unknown>) =>
  new PgUnthrownPreparedQuery(executor, query, undefined, "raw", noopLogger);

describe("PgUnthrownPreparedQuery", () => {
  it("resolves a successful query to Ok", async () => {
    const r = await prepared(async () => [{ n: 1 }]).execute();

    expect(isOk(r)).toBe(true);
  });

  it("qualifies a constraint violation into the error channel", async () => {
    const cause = Object.assign(new Error("dup"), {
      code: "23505",
      constraint: "c",
      table: "t",
    });

    const r = await prepared(() => Promise.reject(cause)).execute();

    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBeInstanceOf(UniqueConstraintViolation);
  });

  it("routes an infrastructure failure to the defect channel", async () => {
    const cause = Object.assign(new Error("boom"), { code: "40P01" });

    const r = await prepared(() => Promise.reject(cause)).execute();

    expect(isDefect(r)).toBe(true);
    // Wrapped in drizzle's own `DrizzleQueryError`, so the defect a caller logs
    // names the statement — the driver's `DatabaseError` carries `code` and
    // `constraint` but not the SQL. The original is one level down, untouched.
    if (isDefect(r)) {
      expect(r.cause).toBeInstanceOf(DrizzleQueryError);
      expect((r.cause as DrizzleQueryError).cause).toBe(cause);
    }
  });

  it("names the failing statement and its params on the defect it produces", async () => {
    // The regression this guards: without the wrapper a syntax error, a deadlock
    // or a statement timeout reached `match({ defect })` with no indication of
    // WHICH query produced it. Stock drizzle gives you the SQL and the params.
    const p = new PgUnthrownPreparedQuery(
      () => Promise.reject(Object.assign(new Error("boom"), { code: "42601" })),
      { sql: 'select * from "users" where "id" = $1', params: [7] },
      undefined,
      "raw",
      noopLogger,
    );

    const r = await p.execute();

    expect(isDefect(r)).toBe(true);
    if (isDefect(r)) {
      const wrapped = r.cause as DrizzleQueryError;
      expect(wrapped.query).toBe('select * from "users" where "id" = $1');
      expect(wrapped.params).toEqual([7]);
      expect(wrapped.message).toContain('select * from "users" where "id" = $1');
    }
  });

  it("still triages a wrapped constraint violation into the modeled channel", async () => {
    // The wrapper must not cost the triage: `qualifyPgError` reads the SQLSTATE
    // through one `cause` level, which is exactly the shape it now always sees.
    const cause = Object.assign(new Error("dup"), { code: "23505", constraint: "c" });

    const r = await prepared(() => Promise.reject(cause)).execute();

    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBeInstanceOf(UniqueConstraintViolation);
      expect((r.error as UniqueConstraintViolation).constraint).toBe("c");
    }
  });

  it("never rejects — the internal promise always resolves to a Result", async () => {
    await expect(prepared(() => Promise.reject(new Error("x"))).execute()).resolves.toBeDefined();
  });

  it("applies the mapper to the rows on success", async () => {
    const p = new PgUnthrownPreparedQuery(
      async () => [[1], [2]],
      query,
      (rows: unknown[]) => rows.length,
      "arrays",
      noopLogger,
    );

    const r = await p.execute();

    expect(isOk(r) && r.value).toBe(2);
  });

  it("turns a synchronous failure into a Defect rather than a throw", async () => {
    // `fillPlaceholders` throws when a placeholder has no value — a bug, and one
    // raised before the driver is ever reached. `execute` must still return.
    const p = new PgUnthrownPreparedQuery(
      async () => [],
      { sql: "select $1", params: [placeholder("id")] },
      undefined,
      "raw",
      noopLogger,
    );

    const r = await p.execute();

    expect(isDefect(r)).toBe(true);
  });

  it("exposes the raw rejecting promise via runUnqualified", async () => {
    const cause = new Error("raw");

    // Still rejecting — that is what the transaction driver needs — but the
    // rejection now names the statement, with the original one level down.
    const rejection: unknown = await prepared(() => Promise.reject(cause))
      .runUnqualified()
      .then(
        () => expect.fail("expected a rejection"),
        (e: unknown) => e,
      );

    expect(rejection).toBeInstanceOf(DrizzleQueryError);
    expect((rejection as DrizzleQueryError).query).toBe("select 1");
    expect((rejection as DrizzleQueryError).cause).toBe(cause);
  });

  it("keeps a non-Error rejection intact under the wrapper", async () => {
    // `DrizzleQueryError` types its `cause` as `Error`, but a driver may reject
    // with anything; nothing may be discarded on the way through.
    const rejection: unknown = await prepared(() => Promise.reject("nonsense"))
      .runUnqualified()
      .then(
        () => expect.fail("expected a rejection"),
        (e: unknown) => e,
      );

    expect((rejection as DrizzleQueryError).cause).toBe("nonsense");
  });
});

/** The transaction handle the stub session below hands to a callback. */
type StubTx = { readonly kind: "stub" };

/**
 * The smallest real subclass of the abstract session: it records what
 * `prepareQuery` was asked for and answers with a prepared query over a fake
 * executor. That makes the row shape each raw-SQL entry point requests
 * observable — `execute`, `arrays` and `objects` differ by one string literal,
 * so a copy-paste swap is otherwise silent.
 */
class StubSession extends PgUnthrownSession<StubTx> {
  readonly asked: { sql: string; mode: "arrays" | "objects" | "raw" }[] = [];

  constructor(private readonly rows: unknown) {
    super(new PgDialect());
  }

  override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    q: Query,
    mode: "arrays" | "objects" | "raw",
  ): PgUnthrownPreparedQuery<T> {
    this.asked.push({ sql: q.sql, mode });
    return new PgUnthrownPreparedQuery<T>(async () => this.rows, q, undefined, mode, noopLogger);
  }

  override transaction<A, E>(
    fn: (tx: StubTx) => AsyncResult<A, E>,
  ): AsyncResult<A, E | PgQueryError> {
    return fn({ kind: "stub" });
  }
}

describe("PgUnthrownSession", () => {
  it("asks for raw rows in execute, and returns the prepared query's result", async () => {
    const session = new StubSession([{ n: 1 }]);

    const r = await session.execute(sql`select 1`);

    expect(session.asked).toEqual([{ sql: "select 1", mode: "raw" }]);
    expect(isOk(r) && r.value).toEqual([{ n: 1 }]);
  });

  it("asks for array rows in arrays, and returns the prepared query's result", async () => {
    const session = new StubSession([[1]]);

    const r = await session.arrays(sql`select 1`);

    expect(session.asked).toEqual([{ sql: "select 1", mode: "arrays" }]);
    expect(isOk(r) && r.value).toEqual([[1]]);
  });

  it("asks for object rows in objects, and returns the prepared query's result", async () => {
    const session = new StubSession([{ n: 1 }]);

    const r = await session.objects(sql`select 1`);

    expect(session.asked).toEqual([{ sql: "select 1", mode: "objects" }]);
    expect(isOk(r) && r.value).toEqual([{ n: 1 }]);
  });

  // `sqlToQuery` is not bookkeeping: it throws for fragments that are type-legal
  // and entirely reachable. Compiled outside the boundary, that throw escapes
  // synchronously — past a caller who has no `try`/`catch`, because these
  // methods promise a `Result`. Inlining a parameter drizzle has no rendering
  // for is its own deliberate failure there ("Unexpected param value").
  const uncompilable = () => sql`select ${() => 1}`.inlineParams();

  it.each(["execute", "arrays", "objects"] as const)(
    "turns a compilation throw in %s into a Defect rather than a throw",
    async (method) => {
      const session = new StubSession([]);

      const r = await session[method](uncompilable());

      expect(isDefect(r)).toBe(true);
      expect(session.asked).toEqual([]);
    },
  );
});
