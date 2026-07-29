# @unthrown/orpc

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
