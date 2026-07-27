# @unthrown/vitest

## 5.0.0-beta.4

## 5.0.0-beta.3

## 5.0.0-beta.2

## 5.0.0-beta.1

### Minor Changes

- 5426c56: **A forgotten `await` on an `AsyncResult` matcher is now loud.** The matchers
  track in-flight assertions, and an `afterEach` hook (registered at module load,
  alongside `expect.extend`) fails the test at its end naming the matchers still
  pending — previously a forgotten `await` passed the test silently, at best
  surfacing as a mis-attributed file-level unhandled rejection, at worst not at
  all. The abandoned assertion is reported exactly once and can never late-fire
  as an unhandled rejection. Also: a rejecting non-`AsyncResult` thenable now
  produces the friendly "expected an unthrown Result" failure instead of
  surfacing the raw rejection cause.

## 5.0.0-beta.0

### Patch Changes

- Updated dependencies [3b06099]
- Updated dependencies [284b7be]
- Updated dependencies [4096713]
- Updated dependencies [a1f68d5]
  - unthrown@5.0.0-beta.0

## 4.3.0

## 4.2.0

## 4.1.0

## 4.0.0

### Patch Changes

- Updated dependencies [8ab4fcb]
- Updated dependencies [bbe2e70]
  - unthrown@4.0.0

## 3.1.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [d5f4256]
- Updated dependencies [b6cc550]
  - unthrown@1.0.0

## 0.3.0

### Patch Changes

- Updated dependencies [db16017]
- Updated dependencies [bc8cd57]
  - unthrown@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [6d7eb66]
- Updated dependencies [fad3984]
  - unthrown@0.2.0

## 0.1.0

### Minor Changes

- initialization

### Patch Changes

- Updated dependencies
  - unthrown@0.1.0
