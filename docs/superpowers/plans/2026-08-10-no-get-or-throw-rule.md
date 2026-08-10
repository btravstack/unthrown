# `unthrown/no-get-or-throw` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an opt-in `@unthrown/oxlint` rule that bans `getOrThrow()` in production code, and withdraw the now-circular documentation that presented `getOrThrow` as the escape hatch which makes `no-throw` viable.

**Architecture:** One new purely-syntactic oxlint rule keyed on a zero-argument `.getOrThrow()` member call — no type information, matching the rest of the plugin. It stays out of the `recommended` preset; consumers exempt their tests with oxlint's own `overrides` mechanism rather than a rule option. The rest of the work is documentation: `no-throw`'s message, `getOrThrow`'s TSDoc rationale, the guide, the README, the agent skill and `CLAUDE.md` all currently point at `getOrThrow` as the sanctioned production escape, and must instead point at `recoverErrCases` + `get`.

**Tech Stack:** TypeScript 7, oxlint JS plugins (`@oxlint/plugins`, `defineRule`), oxlint `RuleTester` from `oxlint/plugins-dev`, vitest, pnpm + turbo, changesets.

**Source spec:** `docs/superpowers/specs/2026-08-10-no-get-or-throw-rule-design.md`

## Global Constraints

- **Rule name:** `no-get-or-throw`; exported symbol `noGetOrThrow`; message id `noGetOrThrow`.
- **Opt-in only.** `meta.docs.recommended: false`. The `recommended` preset stays at exactly five rules — do not add it. Opt-in grows to three: `no-throw`, `no-get-or-throw`, `prefer-ensure`.
- **Rule count wording changes from "seven" to "eight"** everywhere it is spelled out (`packages/oxlint/src/index.ts` header, `index.test.ts` title, `skills/unthrown/references/ecosystem.md`, `CLAUDE.md`).
- **No rule options and no autofix.** The `oxlint-disable` comment and the config `overrides` entry are the escape hatches.
- **Do not modify the repo's own `.oxlintrc.json`.** It dogfoods the five recommended rules only; core's specs legitimately call `getOrThrow()` to test it.
- **`getOrThrow` is not deprecated and its runtime is unchanged.** Core changes are TSDoc prose only.
- **Gate (all must stay green at the end):** `pnpm format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build`.
- **Commits are conventional** (commitlint + lefthook run on commit).
- **`docs/superpowers/` is gitignored** — this plan and its spec are not committed. Never `git add -f` them.

### The replacement form (used verbatim in several messages and docs)

```ts
result
  .recoverErrCases((matcher, defect) =>
    matcher
      .with(P.tag("NotFound"), (e) => defect(e))
      .with(P.tag("Denied"), (e) => defect(e)),
  )
  .get();
```

`recoverErrCases` empties `E` (it returns `Result<T | U, never>`), so `.get()` compiles; an all-`defect` match makes `.get()` panic with the original cause. Both this and the mixed form (one arm recovering to a real value) were typechecked against core during design — they compile.

---

### Task 1: The rule and its tests

**Files:**

- Create: `packages/oxlint/src/rules/no-get-or-throw.ts`
- Test: `packages/oxlint/src/rules/no-get-or-throw.test.ts`

**Interfaces:**

- Consumes: `defineRule` from `@oxlint/plugins`; `ruleTester` from `../tester.js` (already configured for `lang: "ts"`).
- Produces: `export const noGetOrThrow` — a `defineRule(...)` value with `meta.messages.noGetOrThrow` and `meta.docs.recommended === false`. Task 2 imports it as `import { noGetOrThrow } from "./rules/no-get-or-throw.js";`.

**Detection contract.** Report a `CallExpression` when **all** hold: zero arguments; callee is a `MemberExpression`; the member access is **not computed**; the property is an `Identifier` named `getOrThrow`.

The zero-argument check is load-bearing: Effect ships `Option.getOrThrow(self)` and `Either.getOrThrow(self)` — data-first, one argument — so an `@unthrown/effect` consumer gets no false positive. unthrown's is the only zero-argument spelling. Optional chaining (`r?.getOrThrow()`) needs no special handling: ESTree wraps it in a `ChainExpression`, but the inner `CallExpression` still visits with a `MemberExpression` callee.

- [ ] **Step 1: Write the failing test**

Create `packages/oxlint/src/rules/no-get-or-throw.test.ts`:

```ts
import { ruleTester } from "../tester.js";
import { noGetOrThrow } from "./no-get-or-throw.js";

ruleTester.run("no-get-or-throw", noGetOrThrow, {
  valid: [
    // Effect's `Option.getOrThrow(o)` / `Either.getOrThrow(e)` are data-first
    // and take one argument. The arity check is what keeps a codebase using
    // both libraries clean — these are the load-bearing valid cases.
    { code: `const a = Option.getOrThrow(o); const b = Either.getOrThrow(e);` },
    // The rest of the extractor family keeps the error a value (or surrenders
    // it deliberately); only `getOrThrow` throws it.
    {
      code: `const a = r.get(); const b = r.getOr(0); const c = r.getOrElse(f); const d = r.getOrNull();`,
    },
    // The sanctioned replacement.
    {
      code: `const a = r.recoverErrCases((m, defect) => m.with(P.tag("X"), (e) => defect(e))).get();`,
    },
    // A bare identifier call is not a member call — some other `getOrThrow`.
    { code: `const a = getOrThrow();` },
    // A declaration is not a call.
    { code: `class C { getOrThrow() {} }` },
    // Documented miss: a computed access. Pinned as valid so the limit is
    // asserted rather than incidental — it is a deliberate evasion, and the
    // `oxlint-disable` comment is the sanctioned escape.
    { code: `const a = r["getOrThrow"]();` },
    // Documented miss: a detached reference, never called here.
    { code: `const f = r.getOrThrow;` },
  ],
  invalid: [
    {
      code: `const a = r.getOrThrow();`,
      errors: [{ messageId: "noGetOrThrow" }],
    },
    {
      code: `const a = r.map(f).getOrThrow();`,
      errors: [{ messageId: "noGetOrThrow" }],
    },
    // The async surface — same name, same arity, and it hands back a
    // *rejecting* promise.
    {
      code: `async function m() { return await r.getOrThrow(); }`,
      errors: [{ messageId: "noGetOrThrow" }],
    },
    // Optional chaining: a ChainExpression wrapping the same CallExpression.
    {
      code: `const a = r?.getOrThrow();`,
      errors: [{ messageId: "noGetOrThrow" }],
    },
    { code: `send(r.getOrThrow());`, errors: [{ messageId: "noGetOrThrow" }] },
  ],
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/rules/no-get-or-throw.test.ts
```

Expected: FAIL — cannot resolve `./no-get-or-throw.js`.

(The package's vitest config enforces coverage thresholds. Running a single test file will also print coverage-threshold errors — those are expected and irrelevant when running one file in isolation. Judge this step on the `Test Files` / `Tests` lines only.)

- [ ] **Step 3: Write the rule**

Create `packages/oxlint/src/rules/no-get-or-throw.ts`:

````ts
import { defineRule } from "@oxlint/plugins";

/**
 * Disallow `getOrThrow()`. It extracts `T` but **throws the modeled error
 * as-is** on `Err` — abandoning errors-as-values at the very last step, and
 * with it every guarantee the exhaustive matcher bought upstream. A caller of
 * the enclosing function sees a throw, not a channel.
 *
 * The replacement folds the error channel instead:
 *
 * ```ts
 * result
 *   .recoverErrCases((matcher, defect) =>
 *     matcher.with(P.tag("NotFound"), (e) => defect(e)),
 *   )
 *   .get();
 * ```
 *
 * `recoverErrCases` empties `E`, so `.get()` compiles; a case routed to
 * `defect(...)` panics with its original cause. Every case must still be
 * named, which is the point — `getOrThrow()` skips that decision entirely.
 *
 * `getOrThrow()` remains legitimate in **tests and scripts**, where "this
 * `Result` had better be `Ok`" is the assertion and a throw is the correct
 * failure mode. The rule is deliberately option-free: exempt those files with
 * oxlint's own `overrides`, which is the host's mechanism for exactly this and
 * works with any test-file convention.
 *
 * ```json
 * {
 *   "rules": { "unthrown/no-get-or-throw": "error" },
 *   "overrides": [
 *     {
 *       "files": ["**\/*.test.ts", "**\/*.spec.ts"],
 *       "rules": { "unthrown/no-get-or-throw": "off" }
 *     }
 *   ]
 * }
 * ```
 *
 * Purely syntactic, like the rest of the plugin: a **zero-argument**
 * `.getOrThrow()` member call, with no receiver typing. The arity is the
 * discriminator that matters — Effect's `Option.getOrThrow(self)` /
 * `Either.getOrThrow(self)` are data-first and take one argument, so a
 * codebase using both libraries stays clean. Two documented misses, both
 * deliberate evasions rather than accidents: a computed access
 * (`r["getOrThrow"]()`) and a detached reference (`const f = r.getOrThrow`).
 *
 * Opt-in (not part of the `recommended` preset): it is a whole-codebase
 * commitment, and — uniquely among the plugin's rules — an existing test suite
 * does not pass until an `overrides` entry is added. It pairs with `no-throw`;
 * with both on there is no escape left, which is the point.
 *
 * No autofix — the replacement requires enumerating every error case by hand.
 */
export const noGetOrThrow = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow `getOrThrow()` — it throws the modeled error, abandoning errors-as-values at the last step; fold the error channel with `recoverErrCases` + `get` instead",
      recommended: false,
    },
    messages: {
      noGetOrThrow:
        'Unexpected `getOrThrow()`. It throws the modeled error, abandoning errors-as-values at the last step. Fold the error channel instead — `.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"), (e) => defect(e)))` empties `E`, so `.get()` compiles and a case routed to `defect(...)` panics with its original cause. `getOrThrow()` belongs in tests; exempt them with an `overrides` entry for your test glob.',
    },
  },
  createOnce: (context) => {
    return {
      CallExpression: (node) => {
        // unthrown's `getOrThrow()` takes no arguments. Effect's
        // `Option.getOrThrow(self)` / `Either.getOrThrow(self)` are data-first
        // and take one — this is what keeps them out of the report.
        if (node.arguments.length > 0) return;

        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          // A computed access is a documented miss, not a target.
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "getOrThrow"
        )
          return;

        context.report({ node, messageId: "noGetOrThrow" });
      },
    };
  },
});
````

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/rules/no-get-or-throw.test.ts
```

Expected: `Test Files 1 passed (1)` / `Tests 12 passed (12)`. (Coverage-threshold errors from the single-file run are expected; ignore them.)

- [ ] **Step 5: Format and lint the new files**

```bash
pnpm format && pnpm lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/oxlint/src/rules/no-get-or-throw.ts packages/oxlint/src/rules/no-get-or-throw.test.ts
git commit -m "feat(oxlint): add the no-get-or-throw rule"
```

---

### Task 2: Register the rule in the plugin, the tests, the README and the agent skill

These move together. `skill.test.ts` derives its expected inventory, spelled-out count and preset/opt-in headings **from the plugin object**, so the moment the rule is registered it fails until the skill markdown catches up. Splitting them would leave a red gate between tasks.

**Files:**

- Modify: `packages/oxlint/src/index.ts` (header comment, import, `rules` map, opt-out rationale block)
- Modify: `packages/oxlint/src/index.test.ts:12-23` (test title and inventory), plus a new opt-out test
- Modify: `packages/oxlint/README.md` (rule table, usage config sample, preset prose)
- Modify: `skills/unthrown/references/ecosystem.md:38` (rule count) and the **Opt-in** section
- Test: `packages/oxlint/src/index.test.ts`, `packages/oxlint/src/skill.test.ts` (the latter is **not edited** — it must go green on its own once the markdown is updated)

**Interfaces:**

- Consumes: `noGetOrThrow` from Task 1.
- Produces: `plugin.rules["no-get-or-throw"]`; `plugin.recommended.rules` **unchanged** (still exactly five entries).

- [ ] **Step 1: Update the inventory test to expect the new rule**

In `packages/oxlint/src/index.test.ts`, change the title on line 12 from `"exposes all seven rules under the \`unthrown\` plugin name"`to`"exposes all eight rules under the \`unthrown\` plugin name"`, and add `"no-get-or-throw"` to the sorted array so it reads:

```ts
expect(Object.keys(plugin.rules).sort()).toEqual([
  "no-ambiguous-error-type",
  "no-catch-all-pattern",
  "no-get-or-throw",
  "no-throw",
  "no-unhandled-result",
  "no-unused-matcher",
  "prefer-async-result",
  "prefer-ensure",
]);
```

Then add a new opt-out test immediately after the existing `no-throw` one (which ends at line 54), mirroring its shape:

```ts
// `getOrThrow()` stays in unthrown's public surface — it is the right tool in
// a test, where "this Result had better be Ok" is the assertion. Banning it
// is a production-code stance, and unlike every preset rule an existing test
// suite does not pass until an `overrides` entry exempts it.
it("keeps `no-get-or-throw` out of the `recommended` preset — tests need an overrides entry first", () => {
  expect(plugin.recommended.rules).not.toHaveProperty(
    "unthrown/no-get-or-throw",
  );
  expect(plugin.rules["no-get-or-throw"]?.meta?.docs?.recommended).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/index.test.ts
```

Expected: FAIL — the inventory array does not match (`no-get-or-throw` missing from `plugin.rules`), and `plugin.rules["no-get-or-throw"]` is `undefined`.

- [ ] **Step 3: Register the rule in the plugin**

In `packages/oxlint/src/index.ts`:

Change the header comment's opening from `// at lint time. Seven rules:` to `// at lint time. Eight rules:`, and insert this entry after the `no-catch-all-pattern` block (keeping the existing alignment):

```ts
//   unthrown/no-get-or-throw          — ban `getOrThrow()`; fold the error channel
//                                        with `recoverErrCases` + `get` instead
//                                        (opt-in; not in `recommended`).
```

Add the import, keeping the list alphabetical (after the `no-catch-all-pattern` import):

```ts
import { noGetOrThrow } from "./rules/no-get-or-throw.js";
```

Add the map entry, keeping the map alphabetical (after `"no-catch-all-pattern"`):

```ts
    "no-get-or-throw": noGetOrThrow,
```

- [ ] **Step 4: Extend the opt-out rationale block**

The comment above `plugin.recommended` opens with `// Two deliberate opt-outs from the preset.` — change it to `// Three deliberate opt-outs from the preset.` and insert this paragraph after the existing `no-throw` paragraph (the one ending "rather than an unthrown convention."):

```ts
// `no-get-or-throw` is the same class of commitment, and it stacks with
// `no-throw`: with `no-throw` alone the escape is `getOrThrow()`, with
// `no-get-or-throw` alone the escape is `throw`, and with both there is none —
// the error channel gets folded with `recoverErrCases` + `get`. It also has a
// property no preset rule has: `getOrThrow()` is the right tool in a test, so
// an existing suite does not pass until an `overrides` entry exempts the test
// glob. A preset rule that breaks every consumer's tests on upgrade is a poor
// default.
```

- [ ] **Step 5: Run the plugin tests to verify they pass**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the skill test to confirm it now fails**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/skill.test.ts
```

Expected: FAIL on all three assertions — the skill documents seven rules under the old inventory, spells "Seven", and lists nothing new under the opt-in heading. This is the drift guard doing its job; Step 7 fixes the markdown.

- [ ] **Step 7: Update the agent skill's rule inventory**

In `skills/unthrown/references/ecosystem.md`, line 38, change `Seven rules;` to `Eight rules;`.

Then, under the `**Opt-in (not in the preset):**` heading, **replace** the existing `no-throw` bullet and add a new one. The bullet format matters — `skill.test.ts` parses `^- \`([a-z-]+)\` —`, so each must start with `` - `name` — ``:

```md
- `no-throw` — reports every `throw`, pointing at `Err(...)` for a modeled
  failure, `recoverErrCases` + `get` for one that belongs to the defect
  channel, and `fromSafeThrowable` for a known-technical precondition.
- `no-get-or-throw` — reports `getOrThrow()` (a zero-argument member call, so
  Effect's one-argument `Option.getOrThrow(o)` is untouched). It throws the
  modeled error, abandoning errors-as-values at the last step; fold with
  `recoverErrCases` + `get`. Legitimate in tests — exempt them with an oxlint
  `overrides` entry, not a rule option.
```

- [ ] **Step 8: Run the skill test to verify it passes**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/skill.test.ts
```

Expected: PASS (all three assertions — inventory, count, headings).

- [ ] **Step 9: Update the package README**

In `packages/oxlint/README.md`, add a row to the rules table immediately after the `unthrown/no-throw` row (the table's last row):

```md
| `unthrown/no-get-or-throw` | **Opt-in** (not in `recommended`): no `getOrThrow()` — it throws the modeled error, abandoning errors-as-values at the last step. Fold the error channel instead: `recoverErrCases((matcher, defect) => …)` empties `E`, so `.get()` compiles. Matched as a **zero-argument** member call, so Effect's one-argument `Option.getOrThrow(o)` is left alone. `getOrThrow()` is right in a **test** — exempt those files with an oxlint `overrides` entry rather than a rule option. Pairs with `no-throw`: with both on, there is no escape left. |
```

In the same file's usage config sample, add `"unthrown/no-get-or-throw": "error"` after the `"unthrown/no-throw": "error"` line, and add an `overrides` block so the test exemption is shown alongside it:

```json
{
  "jsPlugins": [{ "name": "unthrown", "specifier": "@unthrown/oxlint" }],
  "rules": {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-catch-all-pattern": "error",
    "unthrown/no-get-or-throw": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/no-unused-matcher": "error",
    "unthrown/prefer-async-result": "error",
    "unthrown/prefer-ensure": "error",
    "unthrown/no-throw": "error"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.spec.ts"],
      "rules": { "unthrown/no-get-or-throw": "off" }
    }
  ]
}
```

Finally, in the prose below that sample, change `— \`no-throw\` and \`prefer-ensure\` are the two explicit opt-ins) —`to`— \`no-throw\`, \`no-get-or-throw\` and \`prefer-ensure\` are the three explicit opt-ins) —`.

- [ ] **Step 10: Run the full package suite, format and lint**

```bash
pnpm --filter @unthrown/oxlint test && pnpm format && pnpm lint
```

Expected: all tests pass (coverage thresholds included — the new rule is fully covered by Task 1's tests), formatting clean, lint clean.

- [ ] **Step 11: Commit**

```bash
git add packages/oxlint/src/index.ts packages/oxlint/src/index.test.ts packages/oxlint/README.md skills/unthrown/references/ecosystem.md
git commit -m "feat(oxlint): register no-get-or-throw as the third opt-in rule"
```

---

### Task 3: Withdraw the circular `getOrThrow` rationale

`no-throw`'s message currently recommends `getOrThrow()` as "the sanctioned, lint-clean escape hatch", and `getOrThrow`'s own TSDoc says its purpose is to make a `no-throw` rule viable. With both rules shipping, that reasoning is circular. This task replaces it.

**Files:**

- Modify: `packages/oxlint/src/rules/no-throw.ts` (TSDoc bullet list and the `noThrow` message)
- Modify: `packages/oxlint/src/rules/no-throw.test.ts:10-12` (one stale comment)
- Modify: `packages/core/src/types.ts:545-552` (the `getOrThrow` `@remarks` rationale)
- Test: `packages/oxlint/src/rules/no-throw.test.ts`, `packages/core` typecheck

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on. `no-throw`'s `messageId` stays `noThrow`; the `getOrThrow` **signature and runtime are unchanged** — prose only.

- [ ] **Step 1: Reword `no-throw`'s TSDoc and message**

In `packages/oxlint/src/rules/no-throw.ts`, replace the second bullet of the TSDoc list (currently `- extraction that must throw the modeled error → \`getOrThrow()\` (the sanctioned, lint-clean escape hatch);`) with:

```
 * - a failure that is genuinely unmodeled here → route it to the defect
 *   channel in expression position:
 *   `.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"), (e) => defect(e))).get()`;
```

Then replace the `noThrow` message string with:

```ts
      noThrow:
        'Unexpected `throw`. Return `Err(...)` for a modeled failure. When the failure is genuinely unmodeled here, route it to the defect channel in expression position — `.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"), (e) => defect(e))).get()`. A known-technical precondition throw belongs in a plain helper wrapped once with `fromSafeThrowable`; a genuinely deliberate `throw` carries a targeted `oxlint-disable` with a reason.',
```

- [ ] **Step 2: Fix the stale comment in `no-throw`'s test**

In `packages/oxlint/src/rules/no-throw.test.ts`, the valid case at lines 10-12 is currently commented `// The sanctioned extraction escape hatch is a call, not a \`throw\`.`. The **case itself stays valid** — `getOrThrow()`is not a`throw`statement, so`no-throw`correctly ignores it;`no-get-or-throw` is what catches it now. Replace only the comment:

```ts
    // `getOrThrow()` is a call, not a `throw` statement, so this rule is
    // silent on it — `no-get-or-throw` is what reports it.
    { code: `const value = result.getOrThrow();` },
```

- [ ] **Step 3: Run the `no-throw` tests to verify they still pass**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/rules/no-throw.test.ts
```

Expected: PASS. (The tests assert on `messageId`, not message text, so the reword does not break them. Coverage-threshold errors from the single-file run are expected.)

- [ ] **Step 4: Rewrite `getOrThrow`'s rationale in core**

In `packages/core/src/types.ts`, the `getOrThrow` TSDoc `@remarks` currently reads (lines 545-552):

```
   * @remarks
   * A deliberate escape hatch off the errors-as-values model — it **throws the
   * `Err` value as-is** at the call site. Its purpose is to move a literal
   * `throw` behind a method, so a `no-throw` lint rule can ban raw throws while
   * this one sanctioned extraction remains — _not_ to replace principled
   * handling. When you can keep the error a value, prefer
   * {@link ResultMethods.match | match} / {@link ResultMethods.recoverErrCases | recoverErrCases} /
   * {@link ResultMethods.flatMapErrCases | flatMapErrCases}.
```

Replace those eight lines with:

```
   * @remarks
   * A deliberate escape hatch off the errors-as-values model — it **throws the
   * `Err` value as-is** at the call site, so a caller of the enclosing function
   * sees a throw rather than a channel. Its home is **tests and scripts**,
   * where "this `Result` had better be `Ok`" is the assertion and a throw is
   * the correct failure mode.
   *
   * In production code, fold the error channel instead:
   * {@link ResultMethods.recoverErrCases | recoverErrCases} empties `E`, so
   * {@link ResultMethods.get | get} compiles and a case routed to the injected
   * `defect(...)` panics with its original cause — with every case still named.
   * {@link ResultMethods.match | match} and
   * {@link ResultMethods.flatMapErrCases | flatMapErrCases} are the other two
   * ways to keep the error a value. `@unthrown/oxlint`'s opt-in
   * `no-get-or-throw` rule enforces this, exempting test files through an
   * oxlint `overrides` entry.
```

Leave everything below (the `get` / `getOrThrow` type-gate partition paragraph, `@returns`, `@throws`) **exactly as is**. The async twin in `AsyncResultMethods` needs **no change** — it delegates via `{@link ResultMethods.getOrThrow | getOrThrow}` and makes no rationale claim of its own.

- [ ] **Step 5: Typecheck core and rebuild the docs to confirm no TypeDoc warnings**

```bash
pnpm --filter unthrown typecheck && pnpm --filter @unthrown/docs build
```

Expected: both clean. The docs build must stay TypeDoc-warning-free; every `{@link}` used above (`ResultMethods.recoverErrCases`, `ResultMethods.get`, `ResultMethods.match`, `ResultMethods.flatMapErrCases`) already appears elsewhere in this file, so all resolve.

- [ ] **Step 6: Format, lint, commit**

```bash
pnpm format && pnpm lint
git add packages/oxlint/src/rules/no-throw.ts packages/oxlint/src/rules/no-throw.test.ts packages/core/src/types.ts
git commit -m "docs: point the throw escape at recoverErrCases + get, not getOrThrow"
```

---

### Task 4: Docs site, spec file and changeset

**Files:**

- Modify: `docs/how-to/lint-your-codebase.md` (intro line, setup sample, preset prose, the `no-throw` section's escape list, and a new rule section)
- Modify: `docs/reference/combinators.md:324-328` (the `getOrThrow` bullet)
- Modify: `skills/unthrown/SKILL.md` (three sites)
- Modify: `CLAUDE.md` (the `getOrThrow` bullet at 391-403, the `no-throw` rule description at 734-736, and the rule count at 689)
- Create: `.changeset/no-get-or-throw.md`

**Interfaces:**

- Consumes: the rule name `unthrown/no-get-or-throw` and the message wording from Tasks 1-3. No code.
- Produces: nothing.

- [ ] **Step 1: Update the linting guide's setup section**

In `docs/how-to/lint-your-codebase.md`:

In the opening blockquote, change the trailing list `— a lazy \`E\`, a dropped \`Result\`, a blanket \`P._\`, an ignored matcher, a raw \`throw\`.`to`— a lazy \`E\`, a dropped \`Result\`, a blanket \`P._\`, an ignored matcher, a raw \`throw\`, a thrown-away error channel.`

In the setup JSON sample, add `"unthrown/no-get-or-throw": "error",` after the `"unthrown/no-throw": "error",` line, and add an `overrides` block after the `rules` object:

```json
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.spec.ts"],
      "rules": { "unthrown/no-get-or-throw": "off" }
    }
  ]
```

In the prose below it, change `(\`prefer-ensure\` and \`no-throw\` are the two explicit opt-ins)`to`(\`prefer-ensure\`, \`no-throw\` and \`no-get-or-throw\` are the three explicit opt-ins)`.

- [ ] **Step 2: Fix the `no-throw` section's escape list**

In the same file, the `### \`unthrown/no-throw\``section's closing paragraph currently reads`… a modeled failure → \`return Err(...)\`; extraction that must surface the modeled error as a throw → [\`getOrThrow()\`](../reference/combinators#eliminating-a-result); a known-technical precondition throw → …`.

Replace the middle clause so it reads:

```md
Every sanctioned form is a call, not a statement, so the rule stays clean on them: a
modeled failure → `return Err(...)`; a failure that is genuinely unmodeled here →
fold it into the defect channel with
[`recoverErrCases`](../reference/combinators#the-error-channel) +
[`get`](../reference/combinators#eliminating-a-result); a
known-technical precondition throw → keep it in a plain helper wrapped **once** with
[`fromSafeThrowable`](./qualify-a-boundary); a genuinely deliberate remaining
`throw` → a targeted `// oxlint-disable-next-line unthrown/no-throw -- <reason>`
comment. The rule has no options and no autofix — the disable comment is the escape
hatch.
```

Both anchors were verified against `docs/reference/combinators.md`: its headings include `## The error channel` (→ `#the-error-channel`) and `## Eliminating a Result` (→ `#eliminating-a-result`).

- [ ] **Step 3: Add the new rule's guide section**

In the same file, immediately **after** the `### \`unthrown/no-throw\``section and before`### \`unthrown/no-catch-all-pattern\``, insert:

````md
### `unthrown/no-get-or-throw` {#no-get-or-throw}

**An opt-in rule** — the other half of `no-throw`. `getOrThrow()` extracts `T`
but **throws the modeled error as-is** on `Err`, which abandons
errors-as-values at the very last step: a caller of the enclosing function sees
a throw, not a channel, and every guarantee the exhaustive matcher bought
upstream is gone.

```ts
const user = findUser(id).getOrThrow(); // ✗ flagged
```

Fold the error channel instead. `recoverErrCases` empties `E`, so `get()`
compiles, and a case routed to the injected `defect(...)` panics with its
original cause — with every case still named:

```ts
const user = findUser(id)
  .recoverErrCases(
    (matcher, defect) =>
      matcher
        .with(P.tag("NotFound"), () => anonymousUser) // ✓ recovered to a value
        .with(P.tag("Denied"), (e) => defect(e)), //    ✓ genuinely unmodeled here
  )
  .get();
```

The rule matches a **zero-argument** `.getOrThrow()` member call, so Effect's
one-argument `Option.getOrThrow(o)` / `Either.getOrThrow(e)` are left alone. A
computed access (`r["getOrThrow"]()`) and a detached reference
(`const f = r.getOrThrow`) are documented misses — both are deliberate
evasions, and the `oxlint-disable` comment is the sanctioned escape.

#### Keeping it in tests

`getOrThrow()` is the right tool in a test, where "this `Result` had better be
`Ok`" _is_ the assertion and a throw is the correct failure mode. The rule has
no `allow` option on purpose — oxlint's own `overrides` already does this, and
works with whatever glob your tests use:

```json
{
  "rules": { "unthrown/no-get-or-throw": "error" },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.spec.ts"],
      "rules": { "unthrown/no-get-or-throw": "off" }
    }
  ]
}
```

#### Stacking with `no-throw`

The two rules close different doors, and enabling both closes the room:

|                           | `no-throw` off  | `no-throw` on                                     |
| ------------------------- | --------------- | ------------------------------------------------- |
| **`no-get-or-throw` off** | escapes: both   | escape: `getOrThrow()`                            |
| **`no-get-or-throw` on**  | escape: `throw` | **no escape — fold with `recoverErrCases`+`get`** |
````

- [ ] **Step 4: Update the combinators reference**

In `docs/reference/combinators.md`, replace the `getOrThrow` bullet (lines 324-328) with:

```md
- `getOrThrow` — extract `T`, but **throw the modeled error as-is** on `Err`
  (panicking on a defect). A deliberate escape hatch off errors-as-values, at
  home in **tests and scripts** where "this `Result` had better be `Ok`" is the
  assertion. In production, fold the channel instead — `recoverErrCases` empties
  `E`, so `get()` compiles — or use `match` / `flatMapErrCases`. The opt-in
  [`no-get-or-throw`](../how-to/lint-your-codebase#no-get-or-throw) rule enforces
  that, exempting tests through an oxlint `overrides` entry.
```

- [ ] **Step 5: Update the agent skill's prose**

In `skills/unthrown/SKILL.md`:

Line ~9-10, change `only a true defect ever throws (at extraction — \`getOrThrow\` being the one deliberate escape hatch that throws a modeled error).` to:

```md
only a true defect ever throws (at extraction). `getOrThrow` is the one
deliberate escape that throws a _modeled_ error — a test-and-script tool, not a
production one.
```

Lines ~172-173, change `\`getOrThrow()\` throws the modeled error as-is (the sanctioned escape hatch under a \`no-throw\` lint rule); it compiles only when \`E\` is non-empty.` to:

```md
`getOrThrow()` throws the modeled error as-is; it compiles only when `E` is
non-empty. Use it in **tests**, not production — fold with `recoverErrCases` +
`get` there (the opt-in `no-get-or-throw` rule enforces it).
```

Line ~237, in the anti-pattern table, add a row after the `throw` in app code row:

```md
| `getOrThrow()` in production code | Throws the modeled error, ending errors-as-values at the last step. Fold with `recoverErrCases` + `get`. Fine in tests (the opt-in `no-get-or-throw` rule exempts them via oxlint `overrides`). |
```

- [ ] **Step 6: Verify the skill test still passes**

```bash
pnpm --filter @unthrown/oxlint exec vitest run src/skill.test.ts
```

Expected: PASS. The count assertion scans `SKILL.md` **and** `ecosystem.md` for any number-word within 20 characters of "oxlint rules" — none of the edits above introduces one, but run it to be sure.

- [ ] **Step 7: Update `CLAUDE.md`**

Three edits:

**(a)** Line 689: change `ships **seven rules**: \`no-ambiguous-error-type\``to`ships **eight rules**: \`no-ambiguous-error-type\``.

**(b)** Lines 734-736: replace the `no-throw` clause

```
  `no-throw` (**opt-in**, not in the preset — reports every `throw`
  statement, pointing at `Err`/`getOrThrow`/`fromSafeThrowable`; this is the
  `no-throw` rule the `getOrThrow` rationale references); and `prefer-ensure`
```

with

```
  `no-throw` (**opt-in**, not in the preset — reports every `throw`
  statement, pointing at `Err` for a modeled failure, `recoverErrCases` + `get`
  for one that belongs to the defect channel, and `fromSafeThrowable` for a
  known-technical precondition); `no-get-or-throw` (**also opt-in** — reports
  `getOrThrow()`, matched as a **zero-argument** member call so Effect's
  one-argument `Option.getOrThrow(o)` is untouched; a computed access and a
  detached reference are documented misses. It throws the modeled error,
  ending errors-as-values at the last step; the replacement is
  `recoverErrCases` + `get`. Deliberately **option-free**: `getOrThrow()` is
  right in a test, and oxlint's own `overrides` already exempts a test glob —
  which is also why it stays out of the preset, being the one rule an existing
  suite fails until configured. It stacks with `no-throw`: with both on there
  is no escape left); and `prefer-ensure`
```

**(c)** Lines 391-397: replace

```
  `get`/`getErr` won't compile on it. `getOrThrow` completes the `getOr…`
  family with a **deliberate escape hatch** — it **throws the modeled `error`
  as-is** on `Err` (and panics on a `Defect`, like the rest of the family). It
  exists so a `no-throw` lint rule can ban raw `throw` while this one sanctioned
  extraction remains — the faithful, lint-clean form of
  `.flatMapErrCases((matcher) => matcher.with(P._, (e) => { throw e })).get()`; it is
  **off the errors-as-values thesis** by design, so reach for `match` / `recoverErrCases`
  / `flatMapErrCases` whenever the error can stay a value.
```

with

```
  `get`/`getErr` won't compile on it. `getOrThrow` completes the `getOr…`
  family with a **deliberate escape hatch** — it **throws the modeled `error`
  as-is** on `Err` (and panics on a `Defect`, like the rest of the family). Its
  home is **tests and scripts**, where "this `Result` had better be `Ok`" is the
  assertion and a throw is the correct failure mode; it is **off the
  errors-as-values thesis** by design, so production code folds the channel
  instead — `recoverErrCases` empties `E` so `get()` compiles, with `match` /
  `flatMapErrCases` the other two ways to keep the error a value. The opt-in
  `@unthrown/oxlint` rule `no-get-or-throw` enforces that split, exempting test
  files through an oxlint `overrides` entry. (It earlier carried the opposite
  rationale — that it existed so a `no-throw` rule could ban raw `throw` while
  this one extraction remained. That was withdrawn when `no-get-or-throw`
  shipped: with both rules on, the reasoning was circular.)
```

- [ ] **Step 8: Write the changeset**

Create `.changeset/no-get-or-throw.md`:

```md
---
"@unthrown/oxlint": minor
"unthrown": patch
---

Add the opt-in `no-get-or-throw` rule, and withdraw the circular `getOrThrow`
rationale.

`getOrThrow()` extracts `T` but throws the modeled error as-is, abandoning
errors-as-values at the last step — a caller of the enclosing function sees a
throw, not a channel. The new rule reports it, pointing at the fold that keeps
the error a value: `recoverErrCases` empties `E`, so `get()` compiles, and a
case routed to the injected `defect(...)` panics with its original cause.

It matches a **zero-argument** `.getOrThrow()` member call, so Effect's
one-argument `Option.getOrThrow(o)` / `Either.getOrThrow(e)` are untouched. A
computed access and a detached reference are documented misses.

The rule is **opt-in**, not in the `recommended` preset, and deliberately
option-free: `getOrThrow()` is the right tool in a test, and oxlint's own
`overrides` already exempts a test glob. It is also the one rule an existing
test suite fails until configured, which is no way to behave in a preset.

It stacks with `no-throw`: alone, each leaves the other spelling as an escape;
together there is none. That made `no-throw`'s own message — which recommended
`getOrThrow()` as the sanctioned escape — circular, so it now points at
`recoverErrCases` + `get` instead. `getOrThrow`'s TSDoc is reframed the same
way: a test-and-script tool, not the production escape. **`getOrThrow` itself
is unchanged and not deprecated** — the `unthrown` bump is documentation only.
```

- [ ] **Step 9: Run the full gate**

```bash
pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build
```

Expected: all green. If `pnpm format --check` fails, run `pnpm format` and re-run.

Note: `pnpm test` runs `@unthrown/drizzle`'s suite, which **requires a running Docker daemon** (it starts a pinned `postgres:18.4-alpine` via testcontainers). If Docker is unavailable, run `pnpm test --filter '!@unthrown/drizzle'` and say so explicitly when reporting — do not report a full green gate that did not run.

- [ ] **Step 10: Commit**

```bash
git add docs/how-to/lint-your-codebase.md docs/reference/combinators.md skills/unthrown/SKILL.md CLAUDE.md .changeset/no-get-or-throw.md
git commit -m "docs(oxlint): document no-get-or-throw and reframe getOrThrow as a test tool"
```

---

## Verification checklist

Before reporting the work complete:

- [ ] `plugin.recommended.rules` still has **exactly five** entries.
- [ ] `pnpm --filter @unthrown/oxlint test` passes, coverage thresholds included.
- [ ] `pnpm --filter @unthrown/docs build` is TypeDoc-warning-free.
- [ ] No number-word other than "eight" sits within 20 characters of "oxlint rules" in `SKILL.md` or `ecosystem.md` (`skill.test.ts` asserts this).
- [ ] The repo's own `.oxlintrc.json` is **unmodified**.
- [ ] `git status` shows no stray files — in particular no leftover `packages/oxlint/src/rules/no-get-or-throw` probe artifacts outside the two intended files.
- [ ] The full gate ran; if `@unthrown/drizzle` was skipped for want of Docker, that is stated in the report.
