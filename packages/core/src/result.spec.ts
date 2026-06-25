import { describe, expect, it } from "vitest";

import { isDefect, ok, Result } from "./index.js";

describe("unthrown core smoke", () => {
  it("maps an Ok value through the success channel", () => {
    expect(
      ok(2)
        .map((n) => n + 1)
        .unwrap(),
    ).toBe(3);
  });

  it("converts a throw inside map() into a Defect (load-bearing invariant)", () => {
    const result = ok(1).map(() => {
      throw new Error("boom");
    });

    expect(result.isDefect()).toBe(true);
    expect(isDefect(result)).toBe(true);
  });
});

describe("Result facade", () => {
  it("Result.ok/err build the same states as the free functions", () => {
    expect(Result.ok(5).unwrap()).toBe(5);
    expect(Result.err("nope").unwrapErr()).toBe("nope");
  });

  it("Result.isOk/isErr/isDefect mirror the free guards", () => {
    expect(Result.isOk(Result.ok(1))).toBe(true);
    expect(Result.isErr(Result.err("e"))).toBe(true);

    const d = Result.ok(1).map(() => {
      throw new Error("boom");
    });
    expect(Result.isDefect(d)).toBe(true);
  });
});
