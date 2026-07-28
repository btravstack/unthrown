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

  it("ships a `recommended` preset that enables exactly the recommended rules as errors", () => {
    // `toEqual`, not `toMatchObject`: the preset's membership is the contract —
    // a rule silently added to (or dropped from) it must fail this test.
    expect(plugin.recommended.rules).toEqual({
      "unthrown/no-ambiguous-error-type": "error",
      "unthrown/no-catch-all-pattern": "error",
      "unthrown/no-unhandled-result": "error",
      "unthrown/prefer-async-result": "error",
    });
    expect(plugin.recommended.jsPlugins).toEqual([
      { name: "unthrown", specifier: "@unthrown/oxlint" },
    ]);
  });

  it("enables `no-catch-all-pattern` in `recommended` — enumeration is the default", () => {
    expect(plugin.recommended.rules).toHaveProperty("unthrown/no-catch-all-pattern", "error");
    // …and the rule's own metadata agrees with the preset.
    expect(plugin.rules["no-catch-all-pattern"]?.meta?.docs?.recommended).toBe(true);
  });

  it("keeps `no-throw` out of the `recommended` preset — the one explicit opt-in", () => {
    expect(plugin.recommended.rules).not.toHaveProperty("unthrown/no-throw");
    expect(plugin.rules["no-throw"]?.meta?.docs?.recommended).toBe(false);
  });

  it("keeps every preset rule pointing at a rule the plugin actually defines", () => {
    for (const name of Object.keys(plugin.recommended.rules ?? {}))
      expect(plugin.rules).toHaveProperty(name.replace(/^unthrown\//, ""));
  });
});
