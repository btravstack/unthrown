import { describe, expect, it } from "vitest";

import { isPanic, ok } from "./index.js";

describe("unthrown core smoke", () => {
  it("maps an Ok value through the success channel", () => {
    expect(
      ok(2)
        .map((n) => n + 1)
        .unwrap(),
    ).toBe(3);
  });

  it("converts a throw inside map() into a Panic (load-bearing invariant)", () => {
    const result = ok(1).map(() => {
      throw new Error("boom");
    });

    expect(result.isPanic()).toBe(true);
    expect(isPanic(result)).toBe(true);
  });
});
