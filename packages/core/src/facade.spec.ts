import { describe, expect, it } from "vitest";

import { all, err, fromNullable, isDefect, isErr, isOk, ok, Result } from "./index.js";

const boom = new Error("boom");

describe("Result facade mirrors the free functions", () => {
  it("exposes the same constructors", () => {
    expect(Result.ok(5).unwrap()).toBe(5);
    expect(Result.err("e").unwrapErr()).toBe("e");
    expect(Result.ok).toBe(ok);
    expect(Result.err).toBe(err);
  });

  it("exposes the same guards", () => {
    expect(Result.isOk).toBe(isOk);
    expect(Result.isErr).toBe(isErr);
    expect(Result.isDefect).toBe(isDefect);

    const d = Result.ok(1).map(() => {
      throw boom;
    });
    expect(Result.isOk(Result.ok(1))).toBe(true);
    expect(Result.isErr(Result.err("e"))).toBe(true);
    expect(Result.isDefect(d)).toBe(true);
  });

  it("exposes the same interop and aggregate entry points", () => {
    expect(Result.fromNullable).toBe(fromNullable);
    expect(Result.all).toBe(all);
    expect(Result.fromNullable(null, () => "absent").unwrapErr()).toBe("absent");
    expect(Result.all([Result.ok(1), Result.ok(2)]).unwrap()).toEqual([1, 2]);
  });
});
