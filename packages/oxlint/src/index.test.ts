import { describe, expect, it } from "vitest";

import plugin from "./index.js";

describe("@unthrown/oxlint plugin", () => {
  it("exposes all five rules under the `unthrown` plugin name", () => {
    expect(plugin.meta?.name).toBe("unthrown");
    expect(Object.keys(plugin.rules).sort()).toEqual([
      "no-ambiguous-error-type",
      "no-catch-all-pattern",
      "no-throw",
      "no-unhandled-result",
      "prefer-async-result",
    ]);
  });

  it("ships a `recommended` preset that enables the recommended rules as errors", () => {
    expect(plugin.recommended.rules).toMatchObject({
      "unthrown/no-ambiguous-error-type": "error",
      "unthrown/no-unhandled-result": "error",
      "unthrown/prefer-async-result": "error",
    });
  });

  it("keeps `no-throw` out of the `recommended` preset — it is an explicit opt-in", () => {
    expect(plugin.recommended.rules).not.toHaveProperty("unthrown/no-throw");
  });

  it("keeps `no-catch-all-pattern` out of the `recommended` preset — it is an explicit opt-in", () => {
    expect(plugin.recommended.rules).not.toHaveProperty("unthrown/no-catch-all-pattern");
  });
});
