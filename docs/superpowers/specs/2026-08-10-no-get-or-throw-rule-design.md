# `unthrown/no-get-or-throw` — design

**Date:** 2026-08-10
**Status:** approved, ready for implementation

## Problem

`getOrThrow()` is unthrown's one sanctioned escape off errors-as-values: it
extracts `T` and **throws the modeled error as-is** on `Err`. That is exactly
what makes it dangerous in production code — the error stops being a value at
the last step, and every caller upstream loses the exhaustive handling the
library exists to enforce.

It remains genuinely useful in **tests and scripts**, where "this `Result` had
better be `Ok`" is the assertion and a throw is the correct failure mode.

So: ban it in production code, keep it available in tests.

## The rule

### Detection

Report a `CallExpression` whose callee is a **non-computed `MemberExpression`**
with property name `getOrThrow`, **and which has zero arguments**.

The zero-argument condition is the load-bearing discriminator. Effect ships
`Option.getOrThrow(self)` and `Either.getOrThrow(self)` — both data-first,
single-argument, namespace-qualified — so an `@unthrown/effect` consumer using
both libraries gets no false positive. unthrown's is the only zero-argument
spelling of the name.

No receiver typing. `getOrThrow` on a zero-arg method call is unthrown's own
coinage, the same stance `no-unused-matcher` takes with the `…Cases` names.
`AsyncResult.getOrThrow()` is covered for free (same name, same arity) — where
it is arguably worse, since it hands back a rejecting `Promise`.

### Documented misses

Consistent with the rest of the plugin, and asserted as _valid_ cases in the
rule's tests so the limit is pinned rather than incidental:

- a computed access — `r["getOrThrow"]()`;
- a detached reference — `const f = r.getOrThrow; f()`.

Both are deliberate evasions. The targeted `oxlint-disable` comment is the
sanctioned escape, not a computed member access.

### No autofix

The replacement requires enumerating every error case by hand. There is no
mechanical rewrite.

### Message

```
Unexpected `getOrThrow()`. It throws the modeled error, abandoning
errors-as-values at the last step. Fold the error channel instead —
`.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"), (e) => defect(e)))`
empties `E`, so `.get()` compiles and an unmodeled case panics with its
original cause. `getOrThrow()` belongs in tests; exempt them with an
`overrides` entry for your test glob.
```

Both replacement shapes were verified to typecheck against core: the all-`defect`
form (`E` collapses to `never`, `.get()` compiles, an unmodeled case panics with
its original cause) and the mixed form where some cases recover to a real value.

### Metadata and placement

- `meta.type: "suggestion"` — it bans a spelling rather than flagging a latent
  fault, matching `no-throw`.
- `meta.docs.recommended: false` — **opt-in**, not in the `recommended` preset.

The preset stays at five rules. Opt-in grows to three: `no-throw`,
`no-get-or-throw`, `prefer-ensure`.

Rationale for opt-in: it is a whole-codebase commitment, and — uniquely among
the plugin's rules — it needs a per-file `overrides` entry before an existing
test suite passes. A preset rule that breaks every consumer's tests on upgrade
is a poor default. It also pairs with `no-throw`, which is opt-in for the same
class of reason.

## Test exemption

The rule is **option-free**. It always reports, and consumers exempt their tests
with oxlint's own `overrides` mechanism:

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

This was verified empirically against the real oxlint binary with a JS-plugin
rule: the override turns the rule off in the matching file and leaves it on
elsewhere.

Rejected alternatives:

- **an `allow: string[]` rule option** — duplicates the host's own mechanism and
  makes this the only path-aware rule in the plugin;
- **hardcoded test-file globs** — invisible from the config file, and wrong for
  any codebase that names its tests differently.

## The `no-throw` reframe

`no-throw`'s message currently _recommends_ `getOrThrow()` as "the sanctioned,
lint-clean escape hatch", and `getOrThrow`'s own TSDoc says its purpose is "to
move a literal `throw` behind a method, so a `no-throw` lint rule can ban raw
throws while this one sanctioned extraction remains".

Under this design that reasoning is circular — both spellings are banned — so
it is withdrawn rather than left to contradict itself.

### `no-throw`'s new message

```
Unexpected `throw`. Return `Err(...)` for a modeled failure. When the failure
is genuinely unmodeled here, route it to the defect channel in expression
position — `.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"),
(e) => defect(e))).get()`. A known-technical precondition throw belongs in a
plain helper wrapped once with `fromSafeThrowable`; a genuinely deliberate
`throw` carries a targeted `oxlint-disable` with a reason.
```

### `getOrThrow`'s new rationale

`getOrThrow` stays fully in the public API, unchanged at runtime — this is a
documentation and lint change only, with no deprecation.

Its documented purpose changes from "the production escape that makes a
`no-throw` rule viable" to "a **test-and-script convenience** — an assertion
that a `Result` is `Ok`, where a throw is the correct failure mode". In
production, the `recoverErrCases` + `get` fold is the form, enforceable with
`no-get-or-throw`.

Everything below that paragraph in the TSDoc — the `get` / `getOrThrow`
type-gate partition by the error channel's state — is unaffected and stays
verbatim.

### The two rules stack

The Linting guide documents them as a pair rather than two unrelated opt-ins:

|                           | `no-throw` off  | `no-throw` on                                     |
| ------------------------- | --------------- | ------------------------------------------------- |
| **`no-get-or-throw` off** | escapes: both   | escape: `getOrThrow()`                            |
| **`no-get-or-throw` on**  | escape: `throw` | **no escape — fold with `recoverErrCases`+`get`** |

## Tests

`packages/oxlint/src/rules/no-get-or-throw.test.ts`, using the shared oxlint
`RuleTester` (`../tester.js`).

**invalid**

- bare — `r.getOrThrow()`
- mid-chain — `r.map(f).getOrThrow()`
- async surface — `await r.getOrThrow()`
- optional chain — `r?.getOrThrow()`
- nested in an expression — `send(r.getOrThrow())`

**valid**

- `Option.getOrThrow(o)` and `Either.getOrThrow(e)` — the Effect-interop guard;
  the arity check is what saves them, so these are the load-bearing cases
- the rest of the extractor family — `r.get()`, `r.getOr(0)`, `r.getOrElse(f)`,
  `r.getOrNull()`
- the sanctioned replacement — `r.recoverErrCases(…).get()`
- a bare identifier call — `getOrThrow()`
- a declaration, not a call — `class C { getOrThrow() {} }`
- the two documented misses — `r["getOrThrow"]()` and `const f = r.getOrThrow`

## Files

### New

- `packages/oxlint/src/rules/no-get-or-throw.ts`
- `packages/oxlint/src/rules/no-get-or-throw.test.ts`
- `.changeset/<name>.md` — **minor** for `@unthrown/oxlint` (a new rule),
  **patch** for `unthrown` (TSDoc only)

### Plugin

- `packages/oxlint/src/index.ts` — import and register the rule; header comment
  "Seven rules" → "Eight rules" with the new entry; extend the opt-out
  rationale block with the stacking argument
- `packages/oxlint/src/index.test.ts` — the sorted rule inventory, the "all
  seven rules" test title, and a new opt-out assertion mirroring `no-throw`'s
- `packages/oxlint/src/rules/no-throw.ts` — message and TSDoc reword
- `packages/oxlint/src/rules/no-throw.test.ts` — one stale comment. The
  `getOrThrow()` case itself **stays valid**: it is not a `throw` statement, so
  `no-throw` correctly does not report it; the new rule is what catches it.
- `packages/oxlint/README.md` — rule table row and the opt-in prose

### Core

- `packages/core/src/types.ts` — the `getOrThrow` rationale on **both** the sync
  (`ResultMethods`) and async (`AsyncResultMethods`) method surfaces

### Docs

- `docs/how-to/lint-your-codebase.md` — a new `### unthrown/no-get-or-throw`
  section, the opt-in list, the config sample, and the line that currently
  recommends `getOrThrow` as the `no-throw` escape
- `docs/reference/combinators.md` — the `getOrThrow` bullet's framing

### Skill

- `skills/unthrown/references/ecosystem.md` — "Seven rules" → "Eight rules", a
  bullet under the **Opt-in** heading, and the reworded `no-throw` bullet
- `skills/unthrown/SKILL.md` — three sites referencing `getOrThrow` as the
  sanctioned escape

`packages/oxlint/src/skill.test.ts` needs **no edit**: it derives the expected
inventory, count and headings from the plugin, so it fails until the skill
markdown catches up. That is its job.

### Spec

- `CLAUDE.md` — the `packages/oxlint` bullet (rule count and the new rule's
  description) and the `getOrThrow` bullet's rationale

## Not changed

The repo's own `.oxlintrc.json`. It dogfoods the five **recommended** rules
only — `no-throw` is not enabled either — and core's specs legitimately call
`getOrThrow()` in order to test it.

## Gate

`pnpm format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`,
`pnpm build` must all stay green.
