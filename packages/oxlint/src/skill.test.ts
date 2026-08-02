// The agent skill (`skills/unthrown/`) is a hand-maintained second copy of the
// documentation, shipped for skills.sh distribution. Nothing else gates it: it
// is markdown, so it is not typechecked, and knip does not see it — and it has
// drifted before (it claimed "the six oxlint rules" for two releases after the
// seventh landed, and documented `fromSchema(schema, input)` for a curried API).
//
// This pins the part that is mechanically checkable: the rule inventory. The
// prose still needs a human, but the inventory is where the drift showed up.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import plugin from "./index.js";

const read = (relative: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../skills/unthrown/${relative}`, import.meta.url)),
    "utf8",
  );

const RULE_NAMES = Object.keys(plugin.rules ?? {}).sort();
const RECOMMENDED = Object.keys(plugin.recommended.rules ?? {})
  .map((name) => name.replace(/^unthrown\//, ""))
  .sort();

describe("the agent skill's rule inventory matches the plugin", () => {
  const ecosystem = read("references/ecosystem.md");
  const skill = read("SKILL.md");

  it("documents every rule the plugin ships, and no rule it does not", () => {
    const documented = [...ecosystem.matchAll(/^- `([a-z-]+)` —/gm)]
      .map(([, name]) => name!)
      .filter(
        (name) => RULE_NAMES.includes(name) || name.startsWith("no-") || name.startsWith("prefer-"),
      );
    expect([...new Set(documented)].sort()).toEqual(RULE_NAMES);
  });

  it("states the right rule count", () => {
    const spelled = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
    const expected = spelled[RULE_NAMES.length];
    // Any *other* number-word next to "oxlint rules" is stale.
    const stale = spelled
      .filter((word) => word !== expected)
      .filter((word) =>
        new RegExp(`\\b${word}\\b[\\s\\S]{0,20}oxlint rules`).test(skill + ecosystem),
      );
    expect(stale).toEqual([]);
  });

  it("lists each rule under the right heading — preset vs opt-in", () => {
    // The skill splits its rule list into a "Recommended preset" section and an
    // "Opt-in (not in the preset)" one. A rule under the wrong heading is how an
    // agent ends up enabling `no-throw` believing the preset already did.
    const optInHeading = ecosystem.indexOf("**Opt-in");
    expect(optInHeading, "the skill must keep an opt-in section").toBeGreaterThan(-1);
    const presetSection = ecosystem.slice(0, optInHeading);
    const optInSection = ecosystem.slice(optInHeading);

    const listed = (section: string): string[] =>
      [...section.matchAll(/^- `([a-z-]+)` —/gm)]
        .map(([, name]) => name!)
        .filter((name) => RULE_NAMES.includes(name))
        .sort();

    expect(listed(presetSection)).toEqual(RECOMMENDED);
    expect(listed(optInSection)).toEqual(RULE_NAMES.filter((name) => !RECOMMENDED.includes(name)));
  });
});
