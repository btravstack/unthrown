# Workspace Scaffold — Design

**Date:** 2026-06-25
**Status:** Approved
**Roadmap item:** Step 1 — "Scaffold the workspace"

## 1. Goal

Stand up the monorepo tooling for `unthrown` so the existing
`packages/core/src/result.ts` can be typechecked, linted, formatted, tested,
and built/published — and so the util packages (`@unthrown/pattern`,
`@unthrown/vitest`) have a home from day one.

The toolchain is **deliberately copied from the sibling projects
`amqp-contract` and `temporal-contract`** (same author) so the three repos stay
operationally identical. Where this spec says "matching the sibling projects",
it means byte-for-byte-equivalent config adapted only for names and unthrown's
narrower scope.

This pass ends with `pnpm install && pnpm typecheck && pnpm lint && pnpm test &&
pnpm build` all green. It does **not** include porting the full invariant test
suite (that is the next roadmap task) or publishing to npm (a manual step).

## 2. Toolchain (matching the sibling projects)

| Concern            | Choice                                               |
| ------------------ | ---------------------------------------------------- |
| Package manager    | pnpm `11.7.0`, workspaces + **catalog**              |
| Task runner        | **turbo** (`turbo.json`)                             |
| Build              | **tsdown** — dual CJS + ESM + `.d.ts`                |
| Typecheck          | `tsc --noEmit` per package, shared base config       |
| Lint               | **oxlint** (`.oxlintrc.json`)                        |
| Format             | **oxfmt** (`.oxfmtrc.json`)                          |
| Dead-code/deps     | **knip** (`knip.json`)                               |
| Git hooks          | **lefthook** (`lefthook.yml`)                        |
| Commit lint        | **commitlint** conventional (`commitlint.config.js`) |
| Versioning/release | **changesets** (`.changeset/config.json`)            |
| Tests              | **vitest** per package, v8 coverage, `*.spec.ts`     |
| API docs config    | **typedoc** shared config (site deferred — see §7)   |
| CI                 | GitHub Actions, composite setup action               |
| Node               | `.node-version` `24.16.0`; `engines.node >=22.19`    |

## 3. Repository layout

```
unthrown/
├── package.json                  # private root: @unthrown/root, turbo scripts
├── pnpm-workspace.yaml           # workspaces + catalog + pnpm settings
├── pnpm-lock.yaml                # generated
├── turbo.json
├── .oxlintrc.json
├── .oxfmtrc.json
├── knip.json
├── lefthook.yml
├── commitlint.config.js
├── .changeset/config.json
├── .node-version                 # 24.16.0
├── .gitignore                    # mirrors sibling projects
├── CLAUDE.md                     # existing
├── docs/
│   └── design-memory.md          # existing
│   └── superpowers/specs/...     # this spec
├── tools/
│   ├── tsconfig/                 # @unthrown/tsconfig (private): base.json
│   └── typedoc/                  # @unthrown/typedoc (private): base.json
├── packages/
│   ├── core/                     # → unthrown (unscoped)
│   │   ├── package.json
│   │   ├── tsconfig.json         # extends @unthrown/tsconfig/base.json
│   │   ├── tsdown.config.ts
│   │   ├── vitest.config.ts
│   │   ├── typedoc.json
│   │   └── src/
│   │       ├── result.ts         # existing (adapted for lint — §6)
│   │       ├── index.ts          # curated public surface re-exports
│   │       └── result.spec.ts    # one smoke test this pass
│   ├── pattern/                  # → @unthrown/pattern (placeholder)
│   │   ├── package.json          # peerDep ts-pattern, dep unthrown workspace:*
│   │   ├── tsconfig.json
│   │   ├── tsdown.config.ts
│   │   ├── typedoc.json
│   │   └── src/index.ts          # placeholder export
│   └── vitest/                   # → @unthrown/vitest (placeholder)
│       ├── package.json          # peerDep vitest, dep unthrown workspace:*
│       ├── tsconfig.json
│       ├── tsdown.config.ts
│       ├── typedoc.json
│       └── src/index.ts          # placeholder export
└── .github/
    ├── actions/setup/action.yml  # composite: pnpm + node + turbo cache + install
    └── workflows/
        ├── ci.yml
        └── release.yml
```

`pnpm-workspace.yaml` `packages:` globs: `packages/*`, `tools/*`.

## 4. Package wiring

- **`packages/core`** → name **`unthrown`** (unscoped), zero `dependencies`.
  `src/index.ts` is the single curated re-export of the public surface from
  `result.ts` (the named exports listed in `CLAUDE.md`). devDeps: `tsdown`,
  `typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`,
  `@unthrown/tsconfig`, `@unthrown/typedoc`, `typedoc` (all `catalog:` /
  `workspace:*`).
- **`packages/pattern`** → **`@unthrown/pattern`**:
  `peerDependencies: { "ts-pattern": "*" }`,
  `dependencies: { "unthrown": "workspace:*" }`. Placeholder `src/index.ts` so it
  builds and the scope name is claimed.
- **`packages/vitest`** → **`@unthrown/vitest`**:
  `peerDependencies: { "vitest": "*" }`,
  `dependencies: { "unthrown": "workspace:*" }`. Placeholder `src/index.ts`.

`ts-pattern` and `vitest` appear only as peerDeps/devDeps of their own package —
never reachable from core (protects core's zero-runtime-dep invariant).

Per-package `package.json` mirrors the sibling-project shape: `type: module`,
`main`/`module`/`types` + `exports` map
(`import`→`{types: ./dist/index.d.mts, default: ./dist/index.mjs}`,
`require`→`{types: ./dist/index.d.cts, default: ./dist/index.cjs}`,
`./package.json`), `files: ["dist", "docs"]`, scripts
`build`/`build:docs`/`dev`/`test`/`typecheck`, repository pointing at
`github.com/btravers/unthrown` with `directory`.

## 5. Build & TypeScript

- **`tools/tsconfig/base.json`** = the sibling projects' base verbatim:
  `module`/`moduleResolution` `NodeNext`, `target` `ES2022`, `lib` `["ES2023"]`,
  `types` `["node"]`, `noEmit: true`, `declaration: true`,
  `declarationMap: true`, full strictness incl. `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
  `noPropertyAccessFromIndexSignature`, `noImplicitOverride`,
  `noImplicitReturns`, `isolatedModules`, `skipLibCheck`. Published as private
  `@unthrown/tsconfig`.
- Each package `tsconfig.json`: `{ extends, compilerOptions: { outDir: "./dist",
rootDir: "./src" }, include: ["src/**/*"] }`.
- **tsdown** builds the actual dist (`tsdown src/index.ts --format cjs,esm --dts
--clean`); `tsc --noEmit` is typecheck-only. A `tsdown.config.ts` per package
  (minimal; core needs no `external` since it has no runtime deps).
- Under `NodeNext`, relative imports in source use explicit `.js` extensions
  (e.g. `export * from "./result.js"`).

## 6. `result.ts` adaptation

To satisfy `consistent-type-definitions: ["error", "type"]`, convert the three
`interface` declarations (`Result`, `AsyncResult`, `Defect`) to `type` aliases.
`AsyncResult` becomes `type AsyncResult<T, E> = PromiseLike<Result<T, E>> & {
... }`. These are behavior-identical. `OkView`/`ErrView`/`PanicView` are already
type aliases. `UnwrapError` is a class (unaffected). oxfmt will reformat the file
(import sorting / style). No `any` is used (code already uses `unknown`), so
`no-explicit-any` passes. Final gate: the file typechecks clean under the shared
base and passes oxlint + oxfmt.

## 7. Deviations from the sibling projects (approved)

1. **No integration tests.** unthrown is pure — no external services. Drop the
   `test:integration` turbo task and the `test-integration` CI job. All other CI
   jobs (format, lint, typecheck, knip, test+coverage, build, security-audit,
   bundle-size) are kept.
2. **Docs site deferred.** Include `@unthrown/typedoc` shared config +
   per-package `typedoc.json` + `build:docs` scripts, but defer the full VitePress
   `docs/` site package and `deploy-docs.yml` workflow to a later pass.
3. **Core package is unscoped (`unthrown`).** Sibling cores are scoped; here the
   primary published package is the unscoped `unthrown`, with util packages under
   the `@unthrown/*` scope.

## 8. Release & publishing (out of scope for this pass)

`release.yml` is set up matching the sibling projects: changesets action with npm
**Trusted Publishing** (OIDC via `id-token: write`) and a `RELEASE_PAT` secret.
The following remain **manual** and are NOT done in this pass:

- Creating the `RELEASE_PAT` repo secret.
- Configuring a Trusted Publisher on npmjs.com for each package.
- Actually publishing the `unthrown` / `@unthrown/*` placeholders to claim names.

## 9. Acceptance criteria

- `pnpm install` succeeds (frozen-lockfile-compatible) under pnpm `11.7.0`.
- `pnpm typecheck` — clean across all packages.
- `pnpm lint` (oxlint) and `pnpm format --check` (oxfmt) — clean.
- `pnpm knip` — clean.
- `pnpm test` — the one core smoke test passes with coverage.
- `pnpm build` — every package emits dual CJS + ESM + `.d.ts` to `dist/`.
- `lefthook install` wired via the `prepare` script.
- CI (`ci.yml`) + composite setup action present and consistent with the sibling
  projects (minus the integration job).

## 10. Out of scope (explicitly)

- Porting the 13 smoke checks into the full invariant suite (next roadmap task).
- `tagged.ts`, real `@unthrown/pattern` / `@unthrown/vitest` implementations.
- VitePress docs site + `deploy-docs.yml`.
- npm publishing and release-secret/Trusted-Publisher setup.
