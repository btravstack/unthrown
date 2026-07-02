# Contributing to unthrown

Thanks for your interest in improving `unthrown`. This is a small, focused
library — the guiding principle is **one concept = one name**, and the surface is
meant to stay small enough that the library can be "done". Contributions that
sharpen the existing design are more welcome than ones that grow it.

## Prerequisites

- **Node** `>=22.19`
- **pnpm** `11.7.0` (pinned via `packageManager`; run `corepack enable` to get it)

## Getting started

```sh
git clone https://github.com/btravstack/unthrown.git
cd unthrown
pnpm install
```

## The gate

Every change must keep all of these green (CI runs the same set):

```sh
pnpm format --check   # oxfmt
pnpm lint             # oxlint
pnpm typecheck        # tsc (incl. type-level tests)
pnpm knip             # dead code / unused deps
pnpm test             # vitest (+ v8 coverage)
pnpm build            # tsdown dual CJS/ESM + d.ts
```

Run `pnpm format` (no `--check`) to auto-fix formatting.

### Coverage and invariants

The core package holds **100% line/function coverage**, enforced by thresholds in
its `vitest.config.ts`. Every load-bearing runtime invariant (see `CLAUDE.md`) is
guarded 1:1 in `packages/core/src/invariants.spec.ts`, and type-level behaviour is
asserted in `packages/core/src/types.test-d.ts`. If you change behaviour, update
or add the matching guard.

## Design rules (binding)

`CLAUDE.md` is the authoritative spec — the rules **and** the reasoning. Read it
before proposing a change. In particular:

- **oxlint rules are binding:** no `interface` (use `type`), no `any` (use
  `unknown`). Genuine exceptions carry a targeted `oxlint-disable` with a reason.
- **Core has no runtime dependencies.** This is a feature — protect it. Never pull
  `ts-pattern`, `vitest`, or any interop peer into core.
- **One name per concept.** Resist convenience aliases.
- Public API carries full **TSDoc**; `pnpm --filter <pkg> build:docs` must stay
  warning-free.

If your change contradicts something in `CLAUDE.md`, either the change or the spec
is wrong — resolve that in the PR discussion, and keep `CLAUDE.md` in sync (it
describes what _is_, not what was planned).

## Commit convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are
checked by **commitlint** via a **lefthook** `commit-msg` hook. Examples:

```
feat(core): add flatTapErr combinator
fix(interop): let a Defect dominate in allFromDictAsync
docs: clarify the qualify boundary
chore(deps): bump vitest
```

## Changesets

User-facing changes need a changeset so the release notes and version bumps are
generated correctly:

```sh
pnpm changeset
```

Pick the affected packages and a semver bump, and describe the change in one line.
Purely internal changes (tests, CI, refactors with no API/behaviour impact) don't
need one.

## Pull requests

- Keep PRs focused — one concern each.
- Make sure the full gate passes locally before pushing.
- Reference the issue you're addressing, if any.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
