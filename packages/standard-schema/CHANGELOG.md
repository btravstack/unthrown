# @unthrown/standard-schema

## 5.8.0

## 5.7.0

### Minor Changes

- d6cadc5: `unthrown` is a peerDependency now, not a dependency. As a dependency the
  package manager was free to give each companion its own copy whenever the
  app's copy did not satisfy the subtree — and two copies diverge in both type
  (structurally incompatible `Result`/`AsyncResult` across versions) and
  runtime identity (`isResult` compares across copies). As a peer an
  application installs exactly one `unthrown`, and an unmet range fails loudly
  at install instead of silently forking the tree. npm ≥7 and pnpm
  auto-install peers, so most installs are unchanged; add `unthrown` to your
  dependencies explicitly if your setup does not.

## 5.6.0

### Patch Changes

- unthrown@5.6.0

## 5.5.0

### Patch Changes

- unthrown@5.5.0

## 5.4.0

### Patch Changes

- Updated dependencies [d892c07]
- Updated dependencies [d892c07]
- Updated dependencies [d892c07]
  - unthrown@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies [de9486c]
  - unthrown@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [3eef964]
  - unthrown@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [625f985]
- Updated dependencies [1af785f]
- Updated dependencies [5ead919]
  - unthrown@5.1.0

## 5.0.0

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- 92c848b: Update stale v4 `match({ ok, err, defect })` doc examples to the v5
  `{ ok, errCases, defect }` shape (including `fromSchemaAsync`'s `@example`,
  which renders into the API reference).
- 39db0d9: `fromSchema`: when a sync-declared schema returns a thenable (the documented
  deliberate `TypeError`), the in-flight validation promise is now adopted before
  throwing, so its later rejection can no longer surface as an unhandled
  rejection.
- 92c848b: Publish the `@standard-schema/spec` dependency as `^1.1.0` instead of an exact
  pin, so it can dedupe with a consumer's own copy of the (types-only) spec
  package.
- Updated dependencies [3b06099]
- Updated dependencies [a899858]
- Updated dependencies [92c848b]
- Updated dependencies [2297633]
- Updated dependencies [284b7be]
- Updated dependencies [f027af4]
- Updated dependencies [a52eabe]
- Updated dependencies [5364caa]
- Updated dependencies [e5e5a14]
- Updated dependencies [e43d44e]
- Updated dependencies [4096713]
- Updated dependencies [fe3840a]
- Updated dependencies [2297633]
- Updated dependencies [2297633]
- Updated dependencies [e5e5a14]
- Updated dependencies [5364caa]
- Updated dependencies [a1f68d5]
  - unthrown@5.0.0

## 5.0.0-beta.12

### Patch Changes

- unthrown@5.0.0-beta.12

## 5.0.0-beta.11

### Patch Changes

- unthrown@5.0.0-beta.11

## 5.0.0-beta.10

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- 92c848b: Update stale v4 `match({ ok, err, defect })` doc examples to the v5
  `{ ok, errCases, defect }` shape (including `fromSchemaAsync`'s `@example`,
  which renders into the API reference).
- 92c848b: Publish the `@standard-schema/spec` dependency as `^1.1.0` instead of an exact
  pin, so it can dedupe with a consumer's own copy of the (types-only) spec
  package.
- Updated dependencies [92c848b]
  - unthrown@5.0.0-beta.10

## 5.0.0-beta.9

### Patch Changes

- Updated dependencies [e43d44e]
  - unthrown@5.0.0-beta.9

## 5.0.0-beta.8

### Patch Changes

- unthrown@5.0.0-beta.8

## 5.0.0-beta.7

### Patch Changes

- Updated dependencies [e5e5a14]
- Updated dependencies [e5e5a14]
  - unthrown@5.0.0-beta.7

## 5.0.0-beta.6

### Patch Changes

- Updated dependencies [a899858]
  - unthrown@5.0.0-beta.6

## 5.0.0-beta.5

### Patch Changes

- Updated dependencies [5364caa]
- Updated dependencies [5364caa]
  - unthrown@5.0.0-beta.5

## 5.0.0-beta.4

### Patch Changes

- Updated dependencies [fe3840a]
  - unthrown@5.0.0-beta.4

## 5.0.0-beta.3

### Patch Changes

- Updated dependencies [a52eabe]
  - unthrown@5.0.0-beta.3

## 5.0.0-beta.2

### Patch Changes

- Updated dependencies [f027af4]
  - unthrown@5.0.0-beta.2

## 5.0.0-beta.1

### Patch Changes

- 39db0d9: `fromSchema`: when a sync-declared schema returns a thenable (the documented
  deliberate `TypeError`), the in-flight validation promise is now adopted before
  throwing, so its later rejection can no longer surface as an unhandled
  rejection.
- Updated dependencies [2297633]
- Updated dependencies [2297633]
- Updated dependencies [2297633]
  - unthrown@5.0.0-beta.1

## 5.0.0-beta.0

### Patch Changes

- Updated dependencies [3b06099]
- Updated dependencies [284b7be]
- Updated dependencies [4096713]
- Updated dependencies [a1f68d5]
  - unthrown@5.0.0-beta.0

## 4.3.0

### Patch Changes

- Updated dependencies [af0235a]
  - unthrown@4.3.0

## 4.2.0

### Patch Changes

- Updated dependencies [7c5a426]
- Updated dependencies [bfdc68e]
  - unthrown@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [09806e1]
- Updated dependencies [596a62d]
- Updated dependencies [63e9b88]
- Updated dependencies [d13ad64]
  - unthrown@4.1.0

## 4.0.0

### Patch Changes

- Updated dependencies [8ab4fcb]
- Updated dependencies [bbe2e70]
  - unthrown@4.0.0

## 3.1.0

### Patch Changes

- b8d20d7: - **@unthrown/vitest**: `unthrown` is now a **peerDependency** (the matchers'
  `isResult` is an `instanceof` check — the previous exact-version dependency
  could install a second copy of core and silently reject every genuine
  `Result`). `toBeErrTagged(tag, undefined)` now asserts the payload equals
  `undefined` instead of degrading to a tag-only match.
  - **@unthrown/oxlint**: `prefer-async-result` no longer offers an autofix on an
    `async` function's return annotation (the rewrite could not compile); the
    `oxlint` peer range is now `^1.69.0` (JS plugins require it).
  - **All packages**: core is depended on via `workspace:^` (caret) instead of an
    exact pin, `LICENSE` ships in every tarball, the legacy `types` fallback
    points at the CJS declarations, and `engines.node` relaxes to `>=20`.
- Updated dependencies [199c543]
- Updated dependencies [4b6754a]
- Updated dependencies [3fb471b]
- Updated dependencies [52997b3]
- Updated dependencies [b8d20d7]
  - unthrown@3.1.0

## 3.0.1

### Patch Changes

- Updated dependencies [9812449]
  - unthrown@3.0.1

## 3.0.0

### Patch Changes

- Updated dependencies [2cffaed]
- Updated dependencies [88bb366]
  - unthrown@3.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [c8c928e]
  - unthrown@2.0.0

## 1.1.0

### Patch Changes

- Updated dependencies [6eeb19d]
  - unthrown@1.1.0

## 1.0.0

### Major Changes

- Aligned to the shared `1.0.0` version line: `@unthrown/standard-schema` is now
  part of the fixed version group, so it releases in lockstep with `unthrown`
  and the other `@unthrown/*` packages. No functional changes — this is the
  package's first published version (the earlier `0.2.x` entries were never
  released to npm).

## 0.2.1

### Patch Changes

- d5f4256: **BREAKING:** capitalize the value constructors so they match the
  discriminated-union tags (`"Ok"`/`"Err"`/`"Defect"`) and the capitalized `Do`:

  - `ok` → `Ok`, `err` → `Err`, `defect` → `Defect`
  - facade: `Result.ok`/`err`/`defect` → `Result.Ok`/`Err`/`Defect`
  - `@unthrown/pattern`: `P.ok`/`err`/`defect` → `P.Ok`/`Err`/`Defect`

  Unchanged: the `match` handler keys (`r.match({ ok, err, defect })`), the guards
  (`isOk`/`isErr`/`isDefect`), and the `"defect channel"` terminology. Migration is
  a near-mechanical rename of the constructor call sites (`ok(` → `Ok(`, etc.).
  Note `Err`, not `Error`, to avoid shadowing the global `Error`.

- Updated dependencies [d5f4256]
- Updated dependencies [b6cc550]
  - unthrown@1.0.0

## 0.2.0

### Minor Changes

- 495413c: New interop package: bridge any [Standard
  Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType, …) to a
  `Result`. `fromSchema(schema)` returns a validator
  `(input) => Result<Output, readonly Issue[]>`; `fromSchemaAsync(schema)` returns
  the `AsyncResult` counterpart and accepts sync or async schemas. The schema's
  validation issues are the modeled error `E` (a failed validation is anticipated,
  not a defect); a validator that throws becomes a `Defect`. The only dependency
  is the types-only `@standard-schema/spec`.

### Patch Changes

- Updated dependencies [db16017]
- Updated dependencies [bc8cd57]
  - unthrown@0.3.0
