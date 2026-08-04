import { placeholder, type Query } from "drizzle-orm/sql/sql";
import { isDefect, isErr, isOk } from "unthrown";
import { describe, expect, it } from "vitest";

import { UniqueConstraintViolation } from "../errors.js";
import { UnthrownPgPreparedQuery } from "./session.js";

const noopLogger = { logQuery: () => undefined };
const query: Query = { sql: "select 1", params: [] };

const prepared = (executor: () => Promise<unknown>) =>
  new UnthrownPgPreparedQuery(executor, query, undefined, "raw", noopLogger);

describe("UnthrownPgPreparedQuery", () => {
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
    if (isDefect(r)) expect(r.cause).toBe(cause);
  });

  it("never rejects — the internal promise always resolves to a Result", async () => {
    await expect(prepared(() => Promise.reject(new Error("x"))).execute()).resolves.toBeDefined();
  });

  it("applies the mapper to the rows on success", async () => {
    const p = new UnthrownPgPreparedQuery(
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
    const p = new UnthrownPgPreparedQuery(
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

    await expect(prepared(() => Promise.reject(cause)).runUnqualified()).rejects.toBe(cause);
  });
});
