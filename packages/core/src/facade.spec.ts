import { describe, expect, it } from "vitest";

import { all, Err, fromNullable, isDefect, isErr, isOk, isResult, Ok, Result } from "./index.js";

const boom = new Error("boom");

describe("Result facade mirrors the free functions", () => {
  it("exposes the same constructors", () => {
    expect(Result.Ok(5).unwrap()).toBe(5);
    expect(Result.Err("e").unwrapErr()).toBe("e");
    expect(Result.Ok).toBe(Ok);
    expect(Result.Err).toBe(Err);
  });

  it("exposes the same guards", () => {
    expect(Result.isOk).toBe(isOk);
    expect(Result.isErr).toBe(isErr);
    expect(Result.isDefect).toBe(isDefect);
    expect(Result.isResult).toBe(isResult);

    const d = Result.Ok(1).map(() => {
      throw boom;
    });
    expect(Result.isOk(Result.Ok(1))).toBe(true);
    expect(Result.isErr(Result.Err("e"))).toBe(true);
    expect(Result.isDefect(d)).toBe(true);
    expect(Result.isResult(Result.Ok(1))).toBe(true);
    expect(Result.isResult(42)).toBe(false);
  });

  it("exposes the same interop and aggregate entry points", () => {
    expect(Result.fromNullable).toBe(fromNullable);
    expect(Result.all).toBe(all);
    expect(Result.fromNullable(null, () => "absent").unwrapErr()).toBe("absent");
    expect(Result.all([Result.Ok(1), Result.Ok(2)]).unwrap()).toEqual([1, 2]);
  });
});
