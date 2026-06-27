# @unthrown/boxed

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
