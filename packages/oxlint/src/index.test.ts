import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import plugin from "./index.js";

const manifest: { peerDependencies: Record<string, string> } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

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

  // Regression guard for #163. The `oxlint` peer floor is the oldest *host* the
  // rules were verified to run on — it is NOT the `@oxlint/plugins` version this
  // package happens to build against. Slaving the two (as beta.10 did) ratchets
  // the floor every time a bot bumps the dependency, forcing consumers through a
  // lint + type-check engine upgrade for a packaging-only release. Raise this
  // deliberately, only when a rule starts using a host API that needs it, and say
  // which API in the changeset.
  it("keeps the `oxlint` peer floor decoupled from the `@oxlint/plugins` dependency", () => {
    expect(manifest.peerDependencies["oxlint"]).toBe("^1.69.0");
  });
});
