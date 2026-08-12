# @unthrown/neverthrow

## 5.4.0

### Patch Changes

- d892c07: Internal cleanup, no behaviour or API change.

  `unthrown`: `AsyncRes` now delegates each of its eleven non-awaiting combinators
  (`map`, `tap`, `let`, `as`, `discard`, `ensure`, `mapErrCases`,
  `recoverErrCases`, `tapErrCases`, `tapDefect`, `tapFailure`) to the sync `Res`
  method through one private `#lift` helper, instead of restating the same tag
  check, try/catch and throw→defect net inside a `.then`. The six that genuinely
  differ — `flatMap`, `flatTap`, `bind`, `flatMapErrCases`, `flatTapErrCases`,
  `recoverDefect`, each awaiting a callback result that may be an `AsyncResult` —
  are unchanged. `allFromDict` / `allFromDictAsync` fold through the positional
  `foldArray` and pair keys back on with `Object.fromEntries`, whose
  CreateDataProperty semantics give the same `"__proto__"` guarantee the explicit
  `Object.defineProperty` loop bought by hand.

  `@unthrown/vitest`: the seven matchers are built from one shared definition
  rather than seven copies of the same twelve lines; assertion messages are
  byte-identical. `render`'s unreachable fallthrough is gone — after the `Ok` and
  `Err` returns the remaining variant is the `Defect`, so the third guard could
  never be false.

  `@unthrown/effect`, `@unthrown/neverthrow`, `@unthrown/boxed`: each package's
  local `settle` helper is replaced by `Promise.resolve`, which performs the same
  thenable adoption.

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

### Minor Changes

- 959bc68: Add three interop packages bridging `Result`/`AsyncResult` with neighbouring
  errors-as-values libraries:

  - **`@unthrown/effect`** — `toExit`/`fromExit` (a bijection, since Effect's
    `Cause` has a defect channel), `toEither`/`fromEither`, and
    `toEffect`/`fromEffect` (including `AsyncResult ↔ Effect`).
  - **`@unthrown/neverthrow`** — `toNeverthrow`/`fromNeverthrow` and the async
    `toNeverthrowAsync`/`fromNeverthrowAsync`.
  - **`@unthrown/boxed`** — `toBoxed`/`fromBoxed` and `toBoxedFuture`/
    `fromBoxedFuture` (peer-dep on Boxed's maintained `@bloodyowl/boxed` scope).

  Converting a `Result` into a two-channel type (neverthrow, Boxed, or Effect's
  `Either`) requires a mandatory `onDefect` handler — a `Defect` is never silently
  folded into the domain error type.

### Patch Changes

- Updated dependencies [6d7eb66]
- Updated dependencies [fad3984]
  - unthrown@0.2.0
