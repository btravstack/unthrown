# @unthrown/orpc

## 0.2.0

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

## 0.1.2

### Patch Changes

- 625f985: Adopt a discarded thenable so its rejection can't float, and stop
  `createResultClient`'s proxy from ever exposing a callable `then`.

  **Core: the observers now adopt-and-silence a smuggled thenable.** `tap`,
  `tapErrCases`, `tapDefect` and `tapFailure` throw their callback's return value
  away, and the `Result`-returning combinators (`flatMap`, `flatTap`, `bind`,
  `flatMapErrCases`, `flatTapErrCases`, `recoverDefect`) reject a non-`Result`
  one. Either way a thenable that slipped past `NotThenable` — via a cast or a
  raw-JS caller — was dropped mid-flight, so a later rejection floated unhandled
  and took the process down on Node by default. Worse for an observer: its whole
  job is to make a failure visible, and this was the one path where the failure
  was invisible.

  The boundaries already did exactly this for a thenable `qualify` and a thenable
  `fn`; this is the same net on the combinator side. The observed result still
  passes through unchanged — silencing does not change any outcome.

  **`@unthrown/orpc`: `createResultClient` now answers `then` with `undefined`.**
  The proxy's `get` trap wraps every object/function property, so on a client
  whose own proxy answers _any_ key with a nested procedure, `rc.then` would be
  callable and `await rc` would invoke it. oRPC's client proxy happens to guard
  `then` today, but that is its invariant to change, not ours to depend on.

- Updated dependencies [625f985]
- Updated dependencies [1af785f]
- Updated dependencies [5ead919]
  - unthrown@5.1.0

## 0.1.1

### Patch Changes

- 3b06099: Adopt @btravstack/tsconfig@0.2.0 (verbatimModuleSyntax), @btravstack/oxlint@0.2.1 (consistent-type-imports), and @btravstack/lefthook.
- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- 445041a: `createResultClient`: a procedure (or custom link) that throws synchronously
  now lands in the `Defect` channel instead of escaping as a raw throw — the
  wrapped call runs inside the `fromPromise` boundary via its thunk form.
- 4096713: Remove the local `tools/tsconfig` / `tools/typedoc` packages and consume the published `@btravstack/tsconfig` / `@btravstack/typedoc` config directly (every package now extends `@btravstack/*` and takes it from the catalog).
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

## 0.1.1-beta.2

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- Updated dependencies [92c848b]
  - unthrown@5.0.0-beta.10

## 0.1.1-beta.1

### Patch Changes

- 445041a: `createResultClient`: a procedure (or custom link) that throws synchronously
  now lands in the `Defect` channel instead of escaping as a raw throw — the
  wrapped call runs inside the `fromPromise` boundary via its thunk form.
- Updated dependencies [2297633]
- Updated dependencies [2297633]
- Updated dependencies [2297633]
  - unthrown@5.0.0-beta.1

## 0.1.1-beta.0

### Patch Changes

- 3b06099: Adopt @btravstack/tsconfig@0.2.0 (verbatimModuleSyntax), @btravstack/oxlint@0.2.1 (consistent-type-imports), and @btravstack/lefthook.
- 4096713: Remove the local `tools/tsconfig` / `tools/typedoc` packages and consume the published `@btravstack/tsconfig` / `@btravstack/typedoc` config directly (every package now extends `@btravstack/*` and takes it from the catalog).
- Updated dependencies [3b06099]
- Updated dependencies [284b7be]
- Updated dependencies [4096713]
- Updated dependencies [a1f68d5]
  - unthrown@5.0.0-beta.0

## 0.1.0

### Minor Changes

- 75c34bd: Initial release of **@unthrown/orpc** — a two-way bridge between oRPC v2 and
  unthrown, built on v2's returned-`ORPCError` end-to-end inference.

  **Server** (`@unthrown/orpc/server`): `handlerResult(fn)` adapts a
  `Result`-returning procedure handler — `Ok` becomes the output; `Err`
  (constrained to `ORPCError`) is returned as a value, which oRPC marks
  _inferable_ so the client sees it fully typed; a `Defect` rethrows its cause
  and collapses to `INTERNAL_SERVER_ERROR`. The opt-in
  `@unthrown/orpc/extensions/result` subpath patches a `.result()` method onto
  every builder state and contract-first implementers (the package's one
  side-effectful entry point).

  **Client** (`@unthrown/orpc/client`): `createResultClient(client)` wraps a
  whole router so every call returns `AsyncResult<Output, InferableErrors>`;
  `fromCall(promise)` is the one-shot form (also lifts the server-side
  `call(...)`). The error channel is the raw inferable `ORPCError` union,
  discriminated by `code`; everything non-inferable is a `Defect`.

  Peer deps `@orpc/client` / `@orpc/server` at `^2.0.0-beta`; versioned outside
  the unthrown fixed group — majors track oRPC's cadence. Event-iterator
  (streaming) procedures are out of scope.

### Patch Changes

- Updated dependencies [09806e1]
- Updated dependencies [596a62d]
- Updated dependencies [63e9b88]
- Updated dependencies [d13ad64]
  - unthrown@4.1.0
