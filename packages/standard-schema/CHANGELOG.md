# @unthrown/standard-schema

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
