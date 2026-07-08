# unthrown

## 3.1.0

### Minor Changes

- b8d20d7: Soundness and hardening fixes from a full review:

  - **Async combinator callbacks are now a compile error** (`NotThenable`): an
    `async` callback passed to `map`/`tap`/`tapErr`/`tapDefect`/`mapErr`/
    `recover`/`let` no longer type-checks. Such code was already broken at
    runtime — its rejection escaped the pipeline as an unhandled rejection
    instead of a `Defect`. Lift async work with `fromPromise` + `flatMap`.
    (`match` handlers may still be async.)
  - **A throw inside `tapErr`/`tapDefect`/`flatTapErr` no longer destroys the
    failure being observed**: the resulting `Defect`'s cause is now an
    `AggregateError([thrown, original])`.
  - **`matchTags`** routes an unhandled `_tag` (possible only outside the typed
    contract) to the `Defect` handler instead of crashing, and rejects the
    reserved tags `"Ok"`/`"Defect"` at compile time.
  - **`unwrapOr` / `unwrapOrElse` widen**: `unwrapOr<U>(fallback: U): T | U` and
    `unwrapOrElse<U>(f: (error: E) => U): T | U`, so `r.unwrapOr(null)` and
    `r.unwrapOrElse(() => null)` now type-check.
  - `fromPromise`/`fromSafePromise` absorb a non-thenable input instead of
    throwing synchronously; `bind`/`let` reject an array scope as misuse
    (Defect) instead of silently index-spreading it; `Result` instances are
    frozen so a variant cannot be forged by mutation.

### Patch Changes

- 199c543: Polish the generated API reference (comment-only): give the `Types`-section
  aliases practical framing and examples (`OkView`/`ErrView`/`DefectView` note what
  each guard narrows to; `OkOf`/`ErrOf`/`AsyncOkOf`/`AsyncErrOf` show a type-extraction
  example), and group the `Result`/`AsyncResult` **type** aliases under the `Facade`
  category alongside their companion objects, cross-linked so the value+type pairing
  is clear.
- 4b6754a: Improve the generated API reference: add `@category` grouping (Constructors,
  Guards, Interop, Aggregate, Tagged errors, Facade, Types, …) to every exported
  symbol, and give the standalone functions richer, convention-following `@example`
  blocks (both Ok and Err branches, `// =>` output comments). Comment-only — no
  runtime or type changes.
- 3fb471b: Document the fluent combinators on the generated API reference. The method
  surface every `Result` / `AsyncResult` carries is now exported as two
  **documentation-only** types — `ResultMethods` (sync) and `AsyncResultMethods`
  (async, with the `AsyncResult`/`Promise`-returning signatures) — categorized
  under `Methods`, so the reference lists every combinator's signature and prose.
  The `Result` / `AsyncResult` aliases and the `OkView`/`ErrView`/`DefectView`
  variants link to them, and the async method docs link to their sync counterparts.
  The "Choosing a combinator" guide stays the "which one do I reach for?"
  cheat-sheet and links to these API sections.
- 52997b3: Fixes from a whole-repo review:

  - **`unthrown`** — `TaggedError` now reserves `name`: a payload field named `name`
    can no longer shadow the display label (it was silently clobbered at runtime
    while the instance type still promised it). `name` is excluded from the payload
    type, consistent with how `_tag` is authoritative.
  - **`@unthrown/vitest`** — the matchers now reject a foreign `Result`-like object
    (e.g. a neverthrow/Boxed result) via core's canonical `isResult` instead of a
    loose `isOk`-duck-type, so such a value fails clearly as "not an unthrown
    Result" rather than being mistaken for an `Err`.
  - **`@unthrown/oxlint`** — `no-ambiguous-error-type` resolves a bare `Error`
    through scope analysis, so a locally-declared `type Error` or a generic
    `<Error>` parameter is no longer a false positive.
  - **`@unthrown/standard-schema`** — async-schema detection uses a structural
    thenable check instead of `instanceof Promise`, so a promise from another realm
    (vm/worker) is correctly caught instead of silently producing `Ok(undefined)`.

## 3.0.1

### Patch Changes

- 9812449: Mark shipped packages as `"sideEffects": false` so bundlers can prune between
  modules (all except `@unthrown/vitest`, whose `expect.extend` registration is a
  genuine import-time effect). Also: `AsyncResult.unwrapOrElse` now delegates to the
  sync eliminator (guarding the "unwrapOr\* throws on a Defect" invariant), `all`
  short-circuits once a Defect is found, and `tapDefect`'s throw-to-Defect behaviour
  is documented.

## 3.0.0

### Major Changes

- 2cffaed: Stop exposing the `Defect` qualify-time marker; inject it into `qualify`
  instead. `fromThrowable` / `fromPromise` now pass a `defect` helper as
  `qualify`'s **second argument**, so domain code never imports it:

  ```ts
  // before
  import { fromPromise, Defect } from "unthrown";
  fromPromise(fetchUser(id), (cause) =>
    cause instanceof NotFoundError ? ("not_found" as const) : Defect(cause),
  );

  // after
  import { fromPromise } from "unthrown";
  fromPromise(fetchUser(id), (cause, defect) =>
    cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
  );
  ```

  `Defect` is no longer exported and `Result.Defect` is removed from the facade —
  the marker was never a `Result` constructor (it returns the opaque qualify-time
  marker), so grouping it with `Ok`/`Err` was misleading. The error-channel
  inference (`Exclude<R, Defect>`) and all runtime behaviour are unchanged; this is
  purely how the marker is obtained.

  **Migration:** add `defect` as `qualify`'s second parameter and call `defect(c)`
  where you previously called `Defect(c)`; drop the `Defect` import. For
  `Result.Defect`, use the injected helper the same way.

### Minor Changes

- 88bb366: `UnwrapError` now exposes the offending value on the standard `Error.cause` in
  addition to its typed `.error` property. When `unwrap()`/`unwrapErr()` throw on a
  modeled `Result`, an `Error`-typed `E` (e.g. a `TaggedError`) chains its original
  stack under "caused by"; other payloads surface under `[cause]`. `.error` is
  unchanged, and the `Defect` panic path still rethrows the raw cause.

## 2.0.0

### Major Changes

- c8c928e: **BREAKING:** add an `AsyncResult` companion object and split the static entry
  points across the two facades **by what they return**, so each static lives in
  exactly one namespace.

  - New `AsyncResult.*` companion (value + type sharing one name, like `Result`):
    `AsyncResult.fromPromise`, `AsyncResult.fromSafePromise`, `AsyncResult.all`,
    `AsyncResult.allFromDict`. The aggregates **drop the `Async` suffix** the free
    functions carry — the namespace already says async (`AsyncResult.all` _is_ the
    free function `allAsync`).
  - The async entry points are **removed from the `Result` facade**:
    `Result.fromPromise`, `Result.fromSafePromise`, `Result.allAsync`, and
    `Result.allFromDictAsync` are gone — use `AsyncResult.fromPromise` etc. (They
    returned an `AsyncResult`, not a `Result`, so they were misplaced.)

  Unaffected: the **free functions** (`fromPromise`, `allAsync`, …) are unchanged
  and remain the primary, tree-shakeable API; the companions are opt-in sugar. The
  `Result` facade keeps every `Result`-producing static
  (`Ok`/`Err`/`Defect`/`Do`/`fromNullable`/`fromThrowable`/`all`/`allFromDict`/`is*`).

## 1.1.0

### Minor Changes

- 6eeb19d: Add two members, closing the only structural gaps surfaced by comparing the
  surface against boxed / neverthrow / byethrow:
  - **`flatTapErr`** (on `Result` and `AsyncResult`) — the error-channel mirror of
    `flatTap`: runs a `Result`-returning effect on the error, keeps the original
    error on the effect's success, and threads the effect's error otherwise
    (`Result<T, E | E2>`). A throw becomes a `Defect`, like every other combinator.
    Use it for a failable effect _during_ error handling (e.g. writing the error to
    an audit log that may itself fail).
  - **`isResult(x)`** — a standalone type guard narrowing an `unknown` to
    `Result<unknown, unknown>` (and `Result.isResult`). It checks the value carries
    the `Result` prototype, so a plain `{ tag: "Ok" }` look-alike is not matched;
    an `AsyncResult` is not a `Result`. For untyped interop boundaries.

## 1.0.0

### Major Changes

- d5f4256: **BREAKING:** capitalize the value constructors so they match the
  discriminated-union tags (`"Ok"`/`"Err"`/`"Defect"`) and the capitalized `Do`:

  - `ok` → `Ok`, `err` → `Err`, `defect` → `Defect`
  - facade: `Result.ok`/`err`/`defect` → `Result.Ok`/`Err`/`Defect`
  - `@unthrown/pattern`: `P.ok`/`err`/`defect` → `P.Ok`/`Err`/`Defect`

  Unchanged: the `match` handler keys (`r.match({ ok, err, defect })`), the guards
  (`isOk`/`isErr`/`isDefect`), and the `"defect channel"` terminology. Migration is
  a near-mechanical rename of the constructor call sites (`ok(` → `Ok(`, etc.).
  Note `Err`, not `Error`, to avoid shadowing the global `Error`.

### Minor Changes

- b6cc550: Add **do-notation**: `Do()` plus the `bind` / `let` methods on `Result` and
  `AsyncResult`, for sequencing dependent steps into a named scope without nested
  `flatMap` closures.

  ```ts
  Do()
    .bind("user", () => findUser(id)) // Result<User, NotFound>
    .bind("org", ({ user }) => findOrg(user.orgId)) // Result<Org, NotFound>
    .let("label", ({ user, org }) => `${user.name} @ ${org.name}`)
    .map(({ user, org, label }) => render(user, org, label));
  // Result<View, NotFound>
  ```

  `bind(name, f)` sequences a `Result`-returning step and binds its value under
  `name` in an accumulating **readonly** object scope (error types union); `let`
  binds a pure value. On `AsyncResult`, `bind` accepts a `Result` or an
  `AsyncResult`. A throw in either becomes a `Defect`, and `Err`/`Defect`
  short-circuits — same guarantees as every other combinator. (`Do` is capitalised
  because `do` is reserved; lift a sync chain with `toAsync()` to go async.)

  This is the fluent do-notation only; generator (`gen`/`safeTry`) style remains
  out of scope.

## 0.3.0

### Minor Changes

- db16017: Add `flatTap` — a **failable** `tap` on the success channel, for both `Result`
  and `AsyncResult`. It runs a `Result`-returning effect on the `Ok` value,
  discards the effect's success value (the original flows through), threads the
  effect's error (`Result<T, E | E2>`), and — like every combinator — turns a
  throw into a `Defect`. It is to `tap` what `flatMap` is to `map`: use it for a
  validation or write whose outcome matters but whose value you don't need.
- bc8cd57: Add `allFromDict` and `allFromDictAsync` — record-shaped aggregators that collect
  a `{ a: Result<A, E>, b: Result<B, E> }` into a `Result<{ a: A; b: B }, E>` (and
  the `AsyncResult` counterpart), for named parallel work without tupling. Kept as
  **separate functions** from the tuple/array-shaped `all` / `allAsync` (positional
  vs named is a distinct concept), which are unchanged. The folding rules are the
  same — first `Err` short-circuits, any `Defect` dominates; this is not error
  accumulation. The record fold writes keys via `Object.defineProperty`, so a
  caller-supplied `"__proto__"` key can't pollute the prototype.

## 0.2.0

### Minor Changes

- 6d7eb66: Stop `fromPromise` / `fromThrowable` from leaking `Defect` into the error
  channel. The modeled error type is now inferred as `Exclude<R, Defect>` (where
  `R` is `qualify`'s return type), so a `qualify` that returns only `defect(cause)`
  yields `AsyncResult<T, never>` / `Result<T, never>` instead of `…<T, Defect>` —
  a defect stays out-of-band and no longer pollutes downstream combinator types.
  Mixed `qualify`s keep exactly their modeled arm (e.g. `"not_found" | Defect` →
  `"not_found"`). Sound because `Defect` is `unique symbol`-branded, so no domain
  error is assignable to it. When every rejection is a defect, `fromSafePromise`
  remains the right primitive.
- fad3984: Sharpen three corners of the core surface:
  - **Narrowing guard methods.** `.isOk()` / `.isErr()` / `.isDefect()` are now
    `this is …` type predicates, so `if (r.isErr()) r.error` compiles — the
    methods narrow exactly like the standalone `isOk` / `isErr` / `isDefect`
    guards. No more boolean-only footgun for code coming from neverthrow.
  - **`allAsync` + tuple-or-array `all`.** New `allAsync` combines `AsyncResult`s
    (resolved concurrently, order preserved; first `Err` wins, any `Defect`
    dominates; never rejects). Both `all` and `allAsync` now accept a **dynamic
    array** — `Result<T, E>[]` / `AsyncResult<T, E>[]` collapses to
    `Result<T[], E>` / `AsyncResult<T[], E>` with no cast — while a fixed tuple
    still keeps its positional types. Adds the `AsyncOkOf` / `AsyncErrOf` type
    helpers.
  - **Decoupled `TaggedError` name.** `TaggedError(tag, { name })` sets
    `Error.name` independently of the `_tag` discriminant, so a tag can be
    namespaced for collision-safety (`"@my-lib/RetryableError"`) without that
    prefix leaking into stack traces. Defaults to `tag`, so existing calls are
    unchanged.

## 0.1.0

### Minor Changes

- initialization
