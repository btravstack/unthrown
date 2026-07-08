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

### Pre-releases (beta)

When a change is breaking, or a batch of changes needs to be validated in a real
consumer before it becomes a stable major, publish it as a **beta** first instead
of cutting the major straight to `latest`. This uses [changesets pre
mode](https://github.com/changesets/changesets/blob/main/docs/prereleases.md); all
eight packages are `fixed`, so they move together to the same beta version.

The release pipeline needs **no changes** — while a `.changeset/pre.json` is
present, `changeset publish` (run by `release.yml`) publishes under the `beta`
dist-tag instead of `latest` automatically. Because every package already has a
stable release on npm, none of them fall back to `latest`.

```sh
# 1. Enter pre mode (once, from a clean main). Commit the .changeset/pre.json it
#    writes and merge it — from here every release is a beta.
pnpm changeset pre enter beta

# 2. Iterate. Add changesets as usual; each merged "Version Packages" PR ships the
#    next x.y.z-beta.N to the `beta` tag. Do NOT delete accumulated changesets —
#    they are all consumed to build the final changelog at exit.

# 3. Graduate. The next "Version Packages" PR after this cuts the stable version to
#    `latest`.
pnpm changeset pre exit
```

Consume a beta from a downstream project with:

```sh
pnpm add unthrown@beta
```

> **Note:** while in pre mode on `main` you cannot ship a stable patch to `latest`
> until `pre exit` — every release is a beta. That is the intended trade for
> batching breaking changes toward a major. If `main` must keep shipping stable
> patches in parallel, run pre mode on a dedicated `next` branch instead (and set
> `branch: next` on the changesets action) rather than on `main`.

## Pull requests

- Keep PRs focused — one concern each.
- Make sure the full gate passes locally before pushing.
- Reference the issue you're addressing, if any.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
