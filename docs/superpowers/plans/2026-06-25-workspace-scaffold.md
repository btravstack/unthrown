# Workspace Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `unthrown` monorepo toolchain (pnpm + turbo + tsdown + oxlint/oxfmt + vitest + knip + lefthook + changesets + CI) so `result.ts` can be typechecked, linted, tested, and built, and the util packages have a home — all consistent with the sibling projects `amqp-contract` / `temporal-contract`.

**Architecture:** A pnpm-workspace monorepo orchestrated by turbo. `packages/core` (published unscoped as `unthrown`, zero runtime deps) holds the existing `result.ts`; `packages/pattern` and `packages/vitest` are buildable placeholders under the `@unthrown/*` scope. Shared TS/TypeDoc config live in private packages under `tools/`. Build is dual CJS+ESM+`.d.ts` via tsdown.

**Tech Stack:** pnpm 11.7.0, turbo, tsdown, TypeScript 6 (NodeNext), oxlint, oxfmt, vitest (+ v8 coverage), knip, lefthook, commitlint, changesets, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-25-workspace-scaffold-design.md`

## Global Constraints

- **pnpm** `11.7.0` (`packageManager` field); **Node** `.node-version` = `24.16.0`, `engines.node` = `>=22.19`.
- **Catalog versions** (all dependency versions come from the `pnpm-workspace.yaml` catalog; packages reference `catalog:`):
  `@changesets/cli` 2.31.0 · `@commitlint/cli` 21.0.2 · `@commitlint/config-conventional` 21.0.2 · `@types/node` 24.13.2 · `@vitest/coverage-v8` 4.1.8 · `knip` 6.16.1 · `lefthook` 2.1.9 · `oxfmt` 0.54.0 · `oxlint` 1.69.0 · `ts-pattern` 5.9.0 · `tsdown` 0.22.2 · `turbo` 2.9.18 · `typedoc` 0.28.19 · `typedoc-plugin-markdown` 4.12.0 · `typescript` 6.0.3 · `vitest` 4.1.8
- **Package names:** core = `unthrown` (unscoped); util = `@unthrown/pattern`, `@unthrown/vitest`; shared config = private `@unthrown/tsconfig`, `@unthrown/typedoc`.
- **Author string** (matches sibling repos): `Benoit TRAVERS <benoit.travers.fr@gmail.com>`. **Repo URL:** `https://github.com/btravers/unthrown`.
- **TypeScript** `moduleResolution: NodeNext` ⇒ every relative import in source uses an explicit `.js` extension (e.g. `export * from "./result.js"`).
- **Lint rules** (`.oxlintrc.json`): `@typescript-eslint/no-explicit-any: error`, `typescript/consistent-type-definitions: ["error", "type"]` — no `interface`, use `type`.
- **Core has zero runtime `dependencies`.** Never add `ts-pattern`/`vitest` to core.
- **Test files** are named `*.spec.ts`.
- **Commits:** conventional-commit messages (enforced by commitlint). Commit after every task.

---

### Task 1: Root workspace, catalog, and shared config packages

Establishes the workspace so `pnpm install` resolves. No package code yet.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.node-version`
- Create: `.gitignore`
- Create: `commitlint.config.js`
- Create: `lefthook.yml`
- Create: `tools/tsconfig/package.json`
- Create: `tools/tsconfig/base.json`
- Create: `tools/typedoc/package.json`
- Create: `tools/typedoc/base.json`

**Interfaces:**
- Produces: workspace catalog (all `catalog:` references resolve), private packages `@unthrown/tsconfig` (exports `./base.json`) and `@unthrown/typedoc` (exports `./base.json`), and root scripts `build`/`lint`/`format`/`typecheck`/`test`/`knip`/`changeset`/`version`/`release`/`dev`/`prepare`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@unthrown/root",
  "private": true,
  "description": "Explicit errors as values, with a separate defect (panic) channel",
  "license": "MIT",
  "author": "Benoit TRAVERS <benoit.travers.fr@gmail.com>",
  "type": "module",
  "scripts": {
    "build": "turbo run build",
    "changeset": "changeset",
    "dev": "turbo run dev",
    "format": "oxfmt .",
    "knip": "knip",
    "lint": "oxlint .",
    "prepare": "lefthook install",
    "release": "pnpm build && changeset publish",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "version": "changeset version"
  },
  "devDependencies": {
    "@changesets/cli": "catalog:",
    "@commitlint/cli": "catalog:",
    "@commitlint/config-conventional": "catalog:",
    "knip": "catalog:",
    "lefthook": "catalog:",
    "oxfmt": "catalog:",
    "oxlint": "catalog:",
    "turbo": "catalog:"
  },
  "engines": {
    "node": ">=22.19"
  },
  "packageManager": "pnpm@11.7.0"
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
autoInstallPeers: false
dedupePeerDependents: true
engineStrict: true
saveExact: true
strictPeerDependencies: true

packages:
  - packages/*
  - tools/*

catalog:
  "@changesets/cli": 2.31.0
  "@commitlint/cli": 21.0.2
  "@commitlint/config-conventional": 21.0.2
  "@types/node": 24.13.2
  "@vitest/coverage-v8": 4.1.8
  knip: 6.16.1
  lefthook: 2.1.9
  oxfmt: 0.54.0
  oxlint: 1.69.0
  ts-pattern: 5.9.0
  tsdown: 0.22.2
  turbo: 2.9.18
  typedoc: 0.28.19
  typedoc-plugin-markdown: 4.12.0
  typescript: 6.0.3
  vitest: 4.1.8

allowBuilds:
  esbuild: true
  lefthook: true
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "lint": {
      "dependsOn": ["^build"]
    },
    "format": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "dev": {
      "dependsOn": ["^build"],
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "build:docs": {
      "dependsOn": ["^build"],
      "outputs": ["docs/**"]
    }
  }
}
```

- [ ] **Step 4: Create `.node-version`**

```
24.16.0
```

- [ ] **Step 5: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/

# Build output
**/dist/
*.tsbuildinfo

# Test coverage
coverage/
*.lcov

# Turbo
.turbo/

# TypeDoc generated API docs
packages/*/docs/

# Logs
*.log

# Env files
.env
.env.*
!.env.example

# Editors
.vscode/
.idea/

# macOS
.DS_Store
```

- [ ] **Step 6: Create `commitlint.config.js`**

```js
export default { extends: ["@commitlint/config-conventional"] };
```

- [ ] **Step 7: Create `lefthook.yml`**

```yaml
pre-commit:
  parallel: true
  commands:
    format:
      glob: "**/*.{ts,tsx,js,jsx,json,yaml,yml,md}"
      exclude: "pnpm-lock.yaml"
      run: pnpm oxfmt {staged_files}
      stage_fixed: true
    lint:
      glob: "**/*.{ts,tsx,js,jsx}"
      run: pnpm oxlint {staged_files}

commit-msg:
  commands:
    commitlint:
      run: pnpm exec commitlint --edit {1}
```

- [ ] **Step 8: Create `tools/tsconfig/package.json`**

```json
{
  "name": "@unthrown/tsconfig",
  "version": "0.0.0",
  "private": true,
  "description": "Shared TypeScript configuration for unthrown packages",
  "license": "MIT",
  "author": "Benoit TRAVERS <benoit.travers.fr@gmail.com>",
  "type": "module",
  "files": [
    "base.json"
  ],
  "exports": {
    "./base.json": "./base.json"
  }
}
```

- [ ] **Step 9: Create `tools/tsconfig/base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "target": "ES2022",
    "lib": ["ES2023"],
    "types": ["node"],

    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 10: Create `tools/typedoc/package.json`**

```json
{
  "name": "@unthrown/typedoc",
  "version": "0.0.0",
  "private": true,
  "description": "Shared TypeDoc configuration for unthrown packages",
  "license": "MIT",
  "author": "Benoit TRAVERS <benoit.travers.fr@gmail.com>",
  "type": "module",
  "files": [
    "base.json"
  ],
  "exports": {
    "./base.json": "./base.json"
  }
}
```

- [ ] **Step 11: Create `tools/typedoc/base.json`**

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "plugin": ["typedoc-plugin-markdown"],
  "outputFileStrategy": "modules",
  "flattenOutputFiles": true,
  "entryFileName": "index.md",
  "hideGenerator": true,
  "excludePrivate": true,
  "excludeProtected": true,
  "excludeInternal": true,
  "readme": "none",
  "githubPages": false,
  "useCodeBlocks": true,
  "useHTMLEncodedBrackets": true,
  "sanitizeComments": true,
  "parametersFormat": "table",
  "propertiesFormat": "table",
  "enumMembersFormat": "table",
  "typeDeclarationFormat": "table",
  "skipErrorChecking": true
}
```

- [ ] **Step 12: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: completes without error; creates `pnpm-lock.yaml` and `node_modules`; the `prepare` script runs `lefthook install` (prints a lefthook install confirmation). `pnpm exec turbo --version` prints `2.9.18`.

- [ ] **Step 13: Verify lint/format tooling runs on an empty repo**

Run: `pnpm format --check`
Expected: exits 0 (no files need formatting, or only the files just written — if it reports changes, run `pnpm format` then re-run `--check` to confirm 0).

Run: `pnpm lint`
Expected: exits 0 with no lint errors.

- [ ] **Step 14: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .node-version .gitignore commitlint.config.js lefthook.yml tools/
git commit -m "chore: scaffold pnpm/turbo workspace and shared config"
```

---

### Task 2: Core package (`unthrown`) + build + smoke test

Wires `packages/core`, adapts `result.ts` to the lint rules, curates the public surface, and proves typecheck/test/build all run green.

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsdown.config.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/typedoc.json`
- Create: `packages/core/src/index.ts`
- Modify: `packages/core/src/result.ts` (interface → type)
- Test: `packages/core/src/result.spec.ts`

**Interfaces:**
- Consumes: `@unthrown/tsconfig/base.json`, `@unthrown/typedoc/base.json` (Task 1).
- Produces: package `unthrown` whose public entry `src/index.ts` re-exports values `ok`, `err`, `defect`, `panic`, `isOk`, `isErr`, `isPanic`, `fromNullable`, `fromThrowable`, `fromPromise`, `fromSafePromise`, `all`, `UnwrapError`; and types `Result`, `AsyncResult`, `Defect`, `OkView`, `ErrView`, `PanicView`, `OkOf`, `ErrOf`. Built dist at `dist/index.{mjs,cjs,d.mts,d.cts}`.

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "unthrown",
  "version": "0.0.0",
  "description": "Explicit errors as values, with a separate defect (panic) channel",
  "keywords": [
    "defect",
    "either",
    "error-handling",
    "errors-as-values",
    "esm",
    "panic",
    "result",
    "type-safe",
    "typescript"
  ],
  "homepage": "https://github.com/btravers/unthrown#readme",
  "bugs": {
    "url": "https://github.com/btravers/unthrown/issues"
  },
  "license": "MIT",
  "author": "Benoit TRAVERS <benoit.travers.fr@gmail.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/btravers/unthrown.git",
    "directory": "packages/core"
  },
  "files": [
    "dist",
    "docs"
  ],
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsdown src/index.ts --format cjs,esm --dts --clean",
    "build:docs": "typedoc",
    "dev": "tsdown src/index.ts --format cjs,esm --dts --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@unthrown/tsconfig": "workspace:*",
    "@unthrown/typedoc": "workspace:*",
    "@vitest/coverage-v8": "catalog:",
    "tsdown": "catalog:",
    "typedoc": "catalog:",
    "typedoc-plugin-markdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "engines": {
    "node": ">=22.19"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "@unthrown/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/core/tsdown.config.ts`**

```ts
import { defineConfig } from "tsdown";

// Core has zero runtime dependencies, so nothing needs to be externalized.
// Entry and formats are passed via the build script's CLI flags.
export default defineConfig({});
```

- [ ] **Step 4: Create `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
```

- [ ] **Step 5: Create `packages/core/typedoc.json`**

```json
{
  "extends": "@unthrown/typedoc/base.json",
  "entryPoints": ["src/index.ts"],
  "out": "docs"
}
```

- [ ] **Step 6: Adapt `result.ts` — convert the `Defect` interface to a type**

In `packages/core/src/result.ts`, replace:

```ts
export interface Defect {
  readonly [DEFECT]: true;
  readonly cause: unknown;
}
```

with:

```ts
export type Defect = {
  readonly [DEFECT]: true;
  readonly cause: unknown;
};
```

- [ ] **Step 7: Adapt `result.ts` — convert the `Result` interface to a type**

Replace the line:

```ts
export interface Result<T, E> {
```

with:

```ts
export type Result<T, E> = {
```

Then replace its closing block (the `toAsync` line is unique to `Result`):

```ts
  toAsync(): AsyncResult<T, E>;
}
```

with:

```ts
  toAsync(): AsyncResult<T, E>;
};
```

- [ ] **Step 8: Adapt `result.ts` — convert the `AsyncResult` interface to a type**

Replace the line:

```ts
export interface AsyncResult<T, E> extends PromiseLike<Result<T, E>> {
```

with:

```ts
export type AsyncResult<T, E> = PromiseLike<Result<T, E>> & {
```

Then replace its closing block (this `getOrUndefined` signature returns a `Promise` — unique to `AsyncResult`):

```ts
  getOrUndefined(): Promise<T | undefined>;
}
```

with:

```ts
  getOrUndefined(): Promise<T | undefined>;
};
```

- [ ] **Step 9: Create `packages/core/src/index.ts` (curated public surface)**

```ts
export {
  all,
  defect,
  err,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
  isErr,
  isOk,
  isPanic,
  ok,
  panic,
  UnwrapError,
} from "./result.js";

export type {
  AsyncResult,
  Defect,
  ErrOf,
  ErrView,
  OkOf,
  OkView,
  PanicView,
  Result,
} from "./result.js";
```

- [ ] **Step 10: Write the failing smoke test `packages/core/src/result.spec.ts`**

```ts
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
```

- [ ] **Step 11: Install the new package into the workspace**

Run: `pnpm install`
Expected: links `unthrown` and its dev dependencies; exits 0.

- [ ] **Step 12: Run the smoke test (now passing)**

Run: `pnpm --filter unthrown test`
Expected: vitest runs `src/result.spec.ts`, **2 passed**.

> Note: if vitest cannot resolve `./index.js`, confirm `index.ts` and `result.ts` sit side-by-side in `src/` and the import uses the `.js` extension (NodeNext convention).

- [ ] **Step 13: Typecheck the package**

Run: `pnpm --filter unthrown typecheck`
Expected: `tsc --noEmit` exits 0 (no errors). This confirms the `interface → type` conversion compiles under the strict shared base.

- [ ] **Step 14: Build the package (dual CJS+ESM+dts)**

Run: `pnpm --filter unthrown build`
Expected: tsdown emits `packages/core/dist/index.mjs`, `index.cjs`, `index.d.mts`, `index.d.cts`; exits 0.

Run: `ls packages/core/dist`
Expected: lists `index.cjs index.d.cts index.d.mts index.mjs` (plus source maps).

- [ ] **Step 15: Lint and format the new/changed files**

Run: `pnpm format`
Expected: oxfmt rewrites `result.ts` / new files to canonical style (import sorting etc.); exits 0.

Run: `pnpm lint`
Expected: oxlint exits 0 — no `interface` violations remain, no `no-explicit-any` violations.

- [ ] **Step 16: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): wire unthrown package, build, and smoke test"
```

---

### Task 3: Placeholder packages `@unthrown/pattern` and `@unthrown/vitest`

Buildable placeholders that claim the `@unthrown/*` scope names and establish the peer-dependency wiring (`ts-pattern`, `vitest`) without pulling them into core.

**Files:**
- Create: `packages/pattern/package.json`
- Create: `packages/pattern/tsconfig.json`
- Create: `packages/pattern/tsdown.config.ts`
- Create: `packages/pattern/typedoc.json`
- Create: `packages/pattern/src/index.ts`
- Create: `packages/vitest/package.json`
- Create: `packages/vitest/tsconfig.json`
- Create: `packages/vitest/tsdown.config.ts`
- Create: `packages/vitest/typedoc.json`
- Create: `packages/vitest/src/index.ts`

**Interfaces:**
- Consumes: `unthrown` (workspace), `@unthrown/tsconfig`, `@unthrown/typedoc` (Tasks 1–2).
- Produces: published packages `@unthrown/pattern` (peer `ts-pattern`) and `@unthrown/vitest` (peer `vitest`), each exporting a single internal placeholder const so the dist builds. No public API yet.

- [ ] **Step 1: Create `packages/pattern/package.json`**

```json
{
  "name": "@unthrown/pattern",
  "version": "0.0.0",
  "description": "ts-pattern integration for unthrown",
  "keywords": [
    "errors-as-values",
    "pattern-matching",
    "result",
    "ts-pattern",
    "typescript",
    "unthrown"
  ],
  "homepage": "https://github.com/btravers/unthrown#readme",
  "bugs": {
    "url": "https://github.com/btravers/unthrown/issues"
  },
  "license": "MIT",
  "author": "Benoit TRAVERS <benoit.travers.fr@gmail.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/btravers/unthrown.git",
    "directory": "packages/pattern"
  },
  "files": [
    "dist",
    "docs"
  ],
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsdown src/index.ts --format cjs,esm --dts --clean",
    "build:docs": "typedoc",
    "dev": "tsdown src/index.ts --format cjs,esm --dts --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "unthrown": "workspace:*"
  },
  "peerDependencies": {
    "ts-pattern": "^5"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@unthrown/tsconfig": "workspace:*",
    "@unthrown/typedoc": "workspace:*",
    "ts-pattern": "catalog:",
    "tsdown": "catalog:",
    "typedoc": "catalog:",
    "typedoc-plugin-markdown": "catalog:",
    "typescript": "catalog:"
  },
  "engines": {
    "node": ">=22.19"
  }
}
```

- [ ] **Step 2: Create `packages/pattern/tsconfig.json`**

```json
{
  "extends": "@unthrown/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/pattern/tsdown.config.ts`**

```ts
import { defineConfig } from "tsdown";

// Keep peer/workspace deps out of the bundle and out of the declaration files
// so their types are referenced, not inlined.
export default defineConfig({
  external: ["unthrown", "ts-pattern"],
});
```

- [ ] **Step 4: Create `packages/pattern/typedoc.json`**

```json
{
  "extends": "@unthrown/typedoc/base.json",
  "entryPoints": ["src/index.ts"],
  "out": "docs"
}
```

- [ ] **Step 5: Create `packages/pattern/src/index.ts`**

```ts
import { match } from "ts-pattern";

import { ok } from "unthrown";

/**
 * Placeholder export. The `@unthrown/pattern` ts-pattern integration
 * (`P.tag` sugar + ok/err/defect adapter) is not implemented yet — see the
 * roadmap in CLAUDE.md. This exists so the package builds and the
 * `@unthrown` scope name is claimed.
 *
 * @internal
 */
export const __placeholder = { match, ok } as const;
```

- [ ] **Step 6: Create `packages/vitest/package.json`**

```json
{
  "name": "@unthrown/vitest",
  "version": "0.0.0",
  "description": "Vitest matchers for unthrown",
  "keywords": [
    "errors-as-values",
    "matchers",
    "result",
    "testing",
    "typescript",
    "unthrown",
    "vitest"
  ],
  "homepage": "https://github.com/btravers/unthrown#readme",
  "bugs": {
    "url": "https://github.com/btravers/unthrown/issues"
  },
  "license": "MIT",
  "author": "Benoit TRAVERS <benoit.travers.fr@gmail.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/btravers/unthrown.git",
    "directory": "packages/vitest"
  },
  "files": [
    "dist",
    "docs"
  ],
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsdown src/index.ts --format cjs,esm --dts --clean",
    "build:docs": "typedoc",
    "dev": "tsdown src/index.ts --format cjs,esm --dts --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "unthrown": "workspace:*"
  },
  "peerDependencies": {
    "vitest": "^4"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@unthrown/tsconfig": "workspace:*",
    "@unthrown/typedoc": "workspace:*",
    "tsdown": "catalog:",
    "typedoc": "catalog:",
    "typedoc-plugin-markdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "engines": {
    "node": ">=22.19"
  }
}
```

- [ ] **Step 7: Create `packages/vitest/tsconfig.json`**

```json
{
  "extends": "@unthrown/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 8: Create `packages/vitest/tsdown.config.ts`**

```ts
import { defineConfig } from "tsdown";

// Keep peer/workspace deps out of the bundle and out of the declaration files
// so their types are referenced, not inlined.
export default defineConfig({
  external: ["unthrown", "vitest"],
});
```

- [ ] **Step 9: Create `packages/vitest/typedoc.json`**

```json
{
  "extends": "@unthrown/typedoc/base.json",
  "entryPoints": ["src/index.ts"],
  "out": "docs"
}
```

- [ ] **Step 10: Create `packages/vitest/src/index.ts`**

```ts
import { expect } from "vitest";

import { ok } from "unthrown";

/**
 * Placeholder export. The `@unthrown/vitest` custom matchers (`toBeOk`,
 * `toBeOkWith`, `toBeErr`, `toBeErrTagged`, `toBeDefect`) are not implemented
 * yet — see the roadmap in CLAUDE.md. This exists so the package builds and the
 * `@unthrown` scope name is claimed.
 *
 * @internal
 */
export const __placeholder = { expect, ok } as const;
```

- [ ] **Step 11: Install the new packages**

Run: `pnpm install`
Expected: links `@unthrown/pattern` and `@unthrown/vitest` with their peer/dev deps; `strictPeerDependencies` is satisfied (each peer is present as a devDep); exits 0.

- [ ] **Step 12: Typecheck the whole workspace (turbo orders builds first)**

Run: `pnpm typecheck`
Expected: turbo builds `unthrown` first (so `@unthrown/*` can resolve its types from `dist`), then runs `tsc --noEmit` for every package; all exit 0.

> Note: the `@unthrown/*` packages import `unthrown`, which resolves through its `exports` map to the built `dist/*.d.mts`. The `^build` dependency in `turbo.json` guarantees `unthrown` is built before they typecheck.

- [ ] **Step 13: Build the whole workspace**

Run: `pnpm build`
Expected: all three packages emit dual CJS+ESM+`.d.ts`; exits 0.

Run: `ls packages/pattern/dist packages/vitest/dist`
Expected: each lists `index.cjs index.d.cts index.d.mts index.mjs`.

- [ ] **Step 14: Format and lint**

Run: `pnpm format`
Expected: exits 0 (formats the new files).

Run: `pnpm lint`
Expected: oxlint exits 0.

- [ ] **Step 15: Commit**

```bash
git add packages/pattern packages/vitest pnpm-lock.yaml
git commit -m "feat: add @unthrown/pattern and @unthrown/vitest placeholders"
```

---

### Task 4: Quality gates — knip and changesets

Adds dead-code/dependency checking and the release configuration, completing the local quality gate set (`format`, `lint`, `typecheck`, `test`, `build`, `knip`).

**Files:**
- Create: `knip.json`
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`

**Interfaces:**
- Consumes: the workspace and all three packages (Tasks 1–3).
- Produces: a passing `pnpm knip`, and a changesets setup whose `fixed` group versions the three publishable packages together.

- [ ] **Step 1: Create `knip.json`**

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "ignoreExportsUsedInFile": true,
  "workspaces": {
    "packages/*": {
      "project": ["src/**/*.ts"]
    }
  },
  "ignoreDependencies": [
    "typedoc-plugin-markdown",
    "@unthrown/typedoc",
    "@unthrown/tsconfig"
  ]
}
```

> Why these ignores: `typedoc-plugin-markdown` is referenced only inside `tools/typedoc/base.json` (a JSON `plugin` list knip can't trace); `@unthrown/typedoc` and `@unthrown/tsconfig` are referenced only via `extends` in JSON config. All three are real, used config dependencies that knip cannot see through JSON.

- [ ] **Step 2: Create `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.3/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [
    [
      "unthrown",
      "@unthrown/pattern",
      "@unthrown/vitest"
    ]
  ],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

- [ ] **Step 3: Create `.changeset/README.md`**

```md
# Changesets

Hello and welcome! This folder has been automatically generated by
`@changesets/cli`, a build tool that works with multi-package repos, or
single-package repos to help you version and publish your code. You can find the
full documentation for it
[in our repository](https://github.com/changesets/changesets)

We have a quick list of common questions to get you started engaging with this
project in
[our documentation](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
```

- [ ] **Step 4: Run knip**

Run: `pnpm knip`
Expected: exits 0 — no unused files, dependencies, or exports reported. The placeholder packages each `import` their peer dep and `unthrown`, and export their entry const, so nothing is flagged.

> If knip flags a placeholder's `__placeholder` export as unused, confirm the package's `exports`/`main` resolve back to `src/index.ts` as the entry. If it flags `typedoc`/`@vitest/coverage-v8`, confirm they are still referenced by a script / vitest config respectively.

- [ ] **Step 5: Verify changesets is wired**

Run: `pnpm exec changeset status --since=HEAD`
Expected: runs without configuration error (it may report "No changesets present" — that is success; it confirms `config.json` is valid).

- [ ] **Step 6: Commit**

```bash
git add knip.json .changeset/
git commit -m "chore: add knip and changesets configuration"
```

---

### Task 5: CI and release workflows

Adds the GitHub Actions composite setup action and the CI + release pipelines, consistent with the sibling projects (minus the integration-test job).

**Files:**
- Create: `.github/actions/setup/action.yml`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: root scripts `format`/`lint`/`typecheck`/`knip`/`test`/`build` and the changesets `version`/`release` scripts (Tasks 1–4).
- Produces: CI on push/PR to `main` (format, lint, typecheck, knip, test+coverage, build, security-audit, bundle-size) and a changesets-driven release workflow using npm Trusted Publishing.

- [ ] **Step 1: Create `.github/actions/setup/action.yml`**

```yaml
name: "Setup Node.js and pnpm"
description: "Setup Node.js and pnpm, install dependencies"

runs:
  using: "composite"
  steps:
    - name: Setup pnpm
      uses: pnpm/action-setup@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version-file: .node-version
        cache: pnpm

    - name: Setup Turbo Cache
      uses: actions/cache@v4
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: |
          ${{ runner.os }}-turbo-

    - name: Install dependencies
      shell: bash
      run: pnpm install --frozen-lockfile
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI
permissions:
  contents: read

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

jobs:
  format:
    name: Format
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Check formatting
        run: pnpm format --check

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run linter
        run: pnpm lint

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run type check
        run: pnpm typecheck

  knip:
    name: Knip
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run knip
        run: pnpm exec knip --reporter github-actions

  test:
    name: Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run tests
        run: pnpm test -- --coverage --reporter=default --reporter=github-actions

      - name: Upload Coverage Report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: coverage-report
          path: ./**/coverage/
          retention-days: 30

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run build
        run: pnpm build

  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run security audit
        run: pnpm audit --audit-level=high

  bundle-size:
    name: Bundle Size
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup
        uses: ./.github/actions/setup

      - name: Build packages
        run: pnpm build

      - name: Report bundle sizes
        run: |
          echo "## Bundle Sizes" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Package | Size |" >> $GITHUB_STEP_SUMMARY
          echo "|---------|------|" >> $GITHUB_STEP_SUMMARY
          for pkg in packages/*/dist; do
            if [ -d "$pkg" ]; then
              size=$(du -sh "$pkg" 2>/dev/null | cut -f1)
              name=$(basename $(dirname "$pkg"))
              echo "| $name | $size |" >> $GITHUB_STEP_SUMMARY
            fi
          done
```

- [ ] **Step 3: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  workflow_run:
    workflows: ["CI"]
    types:
      - completed
    branches:
      - main

concurrency: ${{ github.workflow }}-${{ github.ref }}

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    permissions:
      contents: write
      pull-requests: write
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          # PAT so the git remote is configured with PAT credentials; the bare
          # GITHUB_TOKEN push checkout normally sets up is treated as a bot
          # event and would not fire `pull_request` workflows on the resulting
          # branch — defeating the point of a PAT release.
          token: ${{ secrets.RELEASE_PAT }}

      - name: Setup
        uses: ./.github/actions/setup

      - name: Build
        run: pnpm build

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@v1
        with:
          # Use `pnpm run …` so we invoke the package.json scripts. Bare
          # `pnpm version` collides with pnpm's built-in `version` command and
          # silently prints `process.versions` instead of running the changeset
          # version script.
          version: pnpm run version
          publish: pnpm run release
          commit: "chore: release packages"
          title: "chore: release packages"
        env:
          # PAT rather than GITHUB_TOKEN: events triggered by GITHUB_TOKEN do
          # not start new workflow runs (anti-recursion safeguard), so the
          # "Version Packages" PR would otherwise skip CI. Required repo secret:
          # RELEASE_PAT (classic PAT with `repo`, or fine-grained with
          # Contents + Pull requests read/write on this repo).
          GITHUB_TOKEN: ${{ secrets.RELEASE_PAT }}
          # NPM_TOKEN intentionally absent — npm Trusted Publishing uses the
          # OIDC token minted via `id-token: write`. Each package must have a
          # Trusted Publisher configured on npmjs.com pointing at this repo +
          # workflow file (.github/workflows/release.yml).
```

- [ ] **Step 4: Validate the workflow YAML parses**

Run: `pnpm exec knip --reporter symbols >/dev/null 2>&1; node -e "const y=require('node:fs').readFileSync('.github/workflows/ci.yml','utf8'); require('node:assert').ok(y.includes('name: CI')); console.log('ci.yml present')"`
Expected: prints `ci.yml present` (a lightweight presence check; full Actions validation happens when GitHub runs the workflow).

> Optional, if `actionlint` is installed locally: `actionlint` → expect no errors. It is not a project dependency, so skip if unavailable.

- [ ] **Step 5: Run the full local gate one final time**

Run: `pnpm install --frozen-lockfile && pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build`
Expected: every command exits 0 — this mirrors the CI jobs (minus the GitHub-only audit/bundle-size reporting) and is the acceptance gate for the whole scaffold.

- [ ] **Step 6: Commit**

```bash
git add .github/
git commit -m "ci: add CI and release workflows"
```

---

## Manual follow-ups (NOT part of this plan)

These remain for the maintainer to do by hand (per spec §8):

- Create the `RELEASE_PAT` repository secret.
- Configure an npm **Trusted Publisher** for `unthrown`, `@unthrown/pattern`, `@unthrown/vitest` pointing at `.github/workflows/release.yml`.
- Publish the initial placeholder versions / claim the `@unthrown` scope on npm.
- Next roadmap tasks: port the 13 smoke checks into the full invariant suite; implement `tagged.ts`; implement the real `@unthrown/vitest` matchers and `@unthrown/pattern` integration; add the VitePress docs site + `deploy-docs.yml`.

---

## Self-Review

**Spec coverage:**
- §2 toolchain → Tasks 1–5 (pnpm/turbo/tsdown/oxlint/oxfmt/knip/lefthook/commitlint/changesets/vitest/typedoc/CI). ✓
- §3 layout → Tasks 1–5 create every listed file (`.npmrc` correctly omitted per the spec edit). ✓
- §4 package wiring → Tasks 2–3 (exports map, peerDeps, `workspace:*`, zero-dep core). ✓
- §5 build & TS → Task 1 (shared base), Tasks 2–3 (per-package tsconfig + tsdown, `.js` extensions). ✓
- §6 `result.ts` adaptation → Task 2 Steps 6–8 + 15. ✓
- §7 deviations → no integration job (Task 5 ci.yml), typedoc included/docs-site deferred (Tasks 1–3), unscoped core (Task 2). ✓
- §8 release out of scope → Task 5 sets files up; "Manual follow-ups" lists the by-hand steps. ✓
- §9 acceptance criteria → Task 5 Step 5 runs the full gate. ✓
- §10 out of scope → "Manual follow-ups" enumerates them; no task implements them. ✓

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to". Every code step contains full file content; every command step has an expected result. ✓

**Type/name consistency:** `__placeholder` const name identical in both placeholder packages; `unthrown` (unscoped) vs `@unthrown/*` used consistently; `src/index.ts` entry re-exports names that exist in `result.ts` (`ok`/`err`/`defect`/`panic`/`isOk`/`isErr`/`isPanic`/`fromNullable`/`fromThrowable`/`fromPromise`/`fromSafePromise`/`all`/`UnwrapError`/`Result`/`AsyncResult`/`Defect`/`OkView`/`ErrView`/`PanicView`/`OkOf`/`ErrOf` — all verified present in the existing `result.ts`). `isDefect` is intentionally NOT re-exported (kept internal; used in-file so knip stays quiet). ✓
