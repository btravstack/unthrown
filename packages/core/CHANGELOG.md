# unthrown

## 5.0.0-beta.5

### Major Changes

- 5364caa: **`ts-pattern` is now a `peerDependency` (`^5`), not a plain dependency.** Core
  re-exports `match` / `P` / `tag` and its error matchers speak ts-pattern's
  builder type. When ts-pattern was a nested, exact-pinned dependency, a consumer
  who already used ts-pattern at another version ended up with two copies whose
  declarations don't unify — feeding a `P.union(...)` built by one copy into an
  unthrown matcher failed five layers deep in a conditional type.

  Declaring it as a peer guarantees a single copy the consumer owns, so
  `import { P } from "ts-pattern"` composes with unthrown's matchers as expected.

  **Action required:** add `ts-pattern` (`^5`) to your own dependencies if you
  don't already depend on it. Most package managers surface this as a missing-peer
  warning on install.

### Patch Changes

- 5364caa: **`getOrThrow()`'s never-channel gate now explains itself.** When the error
  channel is already empty (`E = never`) `getOrThrow()` is unnecessary — there is
  nothing to throw, so `get()` is the tool. The gate previously surfaced as an
  opaque `The 'this' context of type '…' is not assignable to method's 'this' of
type 'never'`. The `never` receiver now carries a message, so the diagnostic
  reads:

  > unthrown: getOrThrow is unnecessary here — the Err channel is empty (E =
  > never), so there is nothing to throw. Use get() instead.

  Behaviour is unchanged; only the compile-time message improves.

## 5.0.0-beta.4

### Major Changes

- fe3840a: **The error-matcher combinators are renamed with a `*Cases` suffix.** `mapErr`,
  `flatMapErr`, `recoverErr`, `tapErr`, and `flatTapErr` become `mapErrCases`,
  `flatMapErrCases`, `recoverErrCases`, `tapErrCases`, and `flatTapErrCases`.

  Each takes a ts-pattern matcher over the error's _cases_, not the error value —
  so the suffix names that protocol and keeps it distinct from the value-taking
  success surface (`map` / `tap`). A bare `mapErr((e) => …)` would promise a
  functor-style callback the combinators never accept; there is deliberately no
  such variant.

  Migration is a rename at every call site:

  ```diff
  - result.mapErr((m) => m.with(P._, wrap))
  + result.mapErrCases((m) => m.with(P._, wrap))
  ```

  `match`'s `err` handler and the `getErr` extractor are unchanged — they are not
  matcher combinators.

## 5.0.0-beta.3

### Patch Changes

- a52eabe: **Fix: two v5 inference regressions — generic-union error widening, and
  `fromPromise` with an inline `.then` chain.** No runtime change; no consumer
  workarounds needed anymore.

  - **A concrete `Err`/`Ok` again widens into a generic error union.** In generic
    code, `return Err(concreteError)` where the declared error is an unresolved
    union (`G | RuntimeError`, a conditional, …) failed to compile on v5 — the
    variant views and `AsyncResult` were intersection aliases, whose variance TS
    measures structurally (where the exhaustive matcher makes `E` invariant),
    silently losing the declared `out` covariance. They are now
    `interface … extends` types carrying **verified** `out T, out E` annotations,
    restoring the v4 behavior (`Err<TheUnion>(x)` workarounds can be removed).
  - **`fromPromise(Promise.resolve().then(() => x), qualify)` again infers `T`.**
    The async-qualify ban's `R & NotThenable<R>` on qualify's return made TS defer
    inference and collapse `T` to `unknown` for an inline `.then` chain argument.
    The ban is now a phantom rest-tuple guard — an async qualify still fails to
    compile (with the message), an always-throwing qualify stays legal, and `T`
    infers normally.

  Both guarded by new `types.test-d.ts` regression assertions.

## 5.0.0-beta.2

### Patch Changes

- f027af4: **Fix: async `flatMap` / `flatTap` / `bind` no longer collapse the callback's
  types to `unknown`.**

  When an `AsyncResult` combinator's callback returned a value typed as the opaque
  `AsyncResult<U, E2>` alias — e.g. `client.start(...).flatMap((h) => h.result())`,
  where `h.result()` is `AsyncResult<Out, Err>` — the success type `U` (and, for
  `flatTap`, the threaded error `E2`) inferred as `unknown` instead of being
  preserved. The signatures destructured `U`/`E2` through the `AsyncResult<U, E2>`
  union member, doing structural inference over the whole async method surface,
  which yields junk candidates.

  The async branch of those callbacks is now typed
  `Awaitable<Result<U, E2>> & { flatMap: unknown }`: inference goes through the
  `Awaitable` then-channel (junk-free, so `U`/`E2` stay precise), while the
  `{ flatMap: unknown }` marker keeps a bare `Promise<Result>` out — a raw
  rejection still can't bypass qualification. Freshly-minted results (`Ok`,
  `fromPromise`, `OkAsync`, …) were unaffected and still infer as before.

  Guarded by new `types.test-d.ts` regression assertions.

## 5.0.0-beta.1

### Major Changes

- 2297633: **`qualify` is now synchronous, and `tapErr` bans async branches** — two
  qualification-bypass holes closed at the type level.

  - `fromThrowable` / `fromPromise` now intersect `qualify`'s return with
    `NotThenable`, so an `async` qualify no longer compiles. It used to compile
    and silently defeat the triage: the returned promise landed in `E` as
    `Err(Promise<…>)` (the `Defect` subtraction cannot see through a promise),
    and a throwing async qualify escaped as an unhandled rejection. At runtime a
    thenable slipped past the types now becomes a `Defect` (never `Err(Promise)`),
    and the orphaned thenable is adopted so its later rejection cannot float.
  - `tapErr`'s matcher-builder output is now `NotThenable`-constrained on both
    surfaces. It was the one observer whose branch results are discarded, so an
    `async` branch's rejection floated invisibly — `tap`, `tapDefect`, and
    `tapFailure` already banned thenable callbacks. The non-awaiting
    transformers `mapErr` / `recoverErr` still accept an async branch (its
    promise is a visible value in the output type, not a rejection bypass).

  Migration: make the qualify (or `tapErr` branch) synchronous — do the async
  work first, or re-enter through `fromPromise` and compose with `flatMap`.

### Minor Changes

- 2297633: **New: `ensure` and `DoAsync` / `AsyncResult.Do`.**

  - `ensure(predicate, onFail)` — validate a success or fail it into the modeled
    channel: `Ok` + passing predicate flows through unchanged; a failing one
    becomes `Err(onFail(value))` (`E` widens to `E | E2`). A type-guard predicate
    narrows the success type (`Result<U, E | E2>`). `Err` / `Defect` pass
    through untouched; a throw in either callback becomes a `Defect` as usual.
    Available on both `Result` and `AsyncResult`.
  - `DoAsync()` — the pre-lifted async do-notation entry (`Do().toAsync()`
    without the boilerplate), aliased as `AsyncResult.Do` (suffix dropped in the
    namespace, like `AsyncResult.Ok`).

### Patch Changes

- 2297633: **Runtime hardening** — none of these change well-typed behavior:

  - Every combinator whose callback must return a `Result` (`flatMap`,
    `flatTap`, `bind`, `flatMapErr`, `flatTapErr`, `recoverDefect` — both
    surfaces) now turns an out-of-contract non-`Result` return (untyped or cast
    callers) into a `TypeError`-caused `Defect` instead of letting a poison
    value throw a raw `TypeError` further down the pipeline — the same policy
    the aggregates already apply.
  - `Res.prototype` / `AsyncRes.prototype` are frozen, the `AsyncResult`
    internal promise is a native `#private` field, and the qualify-time `defect`
    marker is frozen — the never-rejects and no-forgery invariants are now
    tamper-resistant.
  - `isResult` recognises a `Result` built by another copy of unthrown (dual
    CJS/ESM require/import, cross-realm) via a `Symbol.for("unthrown.Result")`
    prototype brand; a structural look-alike still fails.
  - `TaggedError` now reserves `stack` off the payload alongside `name` and
    `message` (an untyped payload can no longer clobber the real trace);
    `cause` stays a legitimate typed payload field.

## 5.0.0-beta.0

### Major Changes

- 284b7be: **The error channel is now matched exhaustively with ts-pattern** (Thesis #5).
  The error combinators — `mapErr`, `flatMapErr`, `recoverErr`, `tapErr`,
  `flatTapErr` — no longer take a plain callback. Their callback receives a
  ts-pattern match builder over the error (`match(error)`) plus the injected
  `defect` helper, and **returns the un-terminated builder** — the combinator
  calls `.exhaustive()` for you:

  ```ts
  import { P, tag } from "unthrown";

  // before
  result.mapErr((error) => {
    if (error._tag === "RecordNotFound") return new NotFoundException(id);
    throw error.cause; // silent fallthrough — a future tag lands here unnoticed
  });

  // after — exhaustive; the type checker forces every case to be handled
  result.mapErr((matcher, defect) =>
    matcher
      .with(tag("RecordNotFound"), () => new NotFoundException(id))
      .with(tag("DriverError"), (e) => defect(e.cause)),
  );
  ```

  The matcher callback parameter is named `matcher` (not `m`).

  **Every error is handled explicitly, and enriching the error channel is a
  compile error at every consuming site** until each new case is handled. Because
  the combinator runs `.exhaustive()`, a missing case does not compile — there is
  no `.exhaustive()` to forget and no `.otherwise()` to smuggle in a fallback.

  - **Match on anything ts-pattern supports** — `_tag`, a `code`-discriminated
    union (the oRPC shape), structural shapes, guards, and grouped patterns
    (`.with(a, b, handler)` — one strategy for several cases). `tag("X")` is sugar
    for the `{ _tag: "X" }` pattern.
  - **`P._` is the deliberate catch-all** — the uniform "handle everything else"
    branch that replaces the old single callback, made explicit and greppable.
  - Each branch receives the narrowed variant **and the injected `defect` helper**
    (`.with(tag("X"), (e) => defect(e.cause))`); its `Defect` arm is subtracted
    from the outgoing `E` (`Exclude<O, Defect>`, the boundary inference). A
    throwing branch also becomes a `Defect` (the safety net).
  - **Observers match exhaustively too** (`tapErr`/`flatTapErr`, use `P._` for a
    catch-all); the error is observed and flows through unchanged.

  **Core now depends on `ts-pattern`** (a small, types-heavy, dual-copy-safe
  library), and re-exports `match` and `P`, plus `tag` — so the matcher, and
  matching a whole `Result` (`match(r).with(P.Ok(), …)`), are first-class in one
  import. **The `@unthrown/pattern` package is removed** — its `tag` helper moved
  into core; the `P.Ok`/`P.Err`/`P.Defect` sugar is dropped (match the union
  structurally instead).

  **`match` now matches the error channel exhaustively too, and `matchTags` is
  removed.** `match`'s `err` handler no longer takes a blanket `(error) => R`
  callback — it receives the same ts-pattern matcher and returns the un-terminated
  builder (no `defect` helper: `match` folds to a value, with no `Defect` output
  channel). This subsumes the old `matchTags` fold — a per-tag fold over a tagged
  union is now `match` with the matcher and `tag(t)`, and it generalises to any
  discriminant, not only `_tag`:

  ```ts
  import { P, tag } from "unthrown";

  // before
  matchTags(result, {
    Ok: (n) => `got ${n}`,
    Defect: (cause) => `bug: ${String(cause)}`,
    NotFound: () => "404",
    Forbidden: (e) => `403 for ${e.user}`,
  });

  // after
  result.match({
    ok: (n) => `got ${n}`,
    defect: (cause) => `bug: ${String(cause)}`,
    err: (matcher) =>
      matcher.with(tag("NotFound"), () => "404").with(tag("Forbidden"), (e) => `403 for ${e.user}`),
  });
  ```

  Use `.with(P._, …)` for a uniform catch-all. `matchTags` and its `TagHandlers`
  type are gone; `TaggedError` and `tag` are unchanged. **Library code generic in
  the error type `E`** (which ts-pattern can't prove exhaustive over an unresolved
  type parameter) should fold with the `isOk` / `isErr` / `isDefect` guards
  instead of `match`.

  **Also breaking:** the deprecated error-channel aliases `orElse` and `recover`
  are removed; the extractor aliases (`unwrap`, `unwrapErr`, `unwrapOr`,
  `unwrapOrElse`) remain. `AsyncOkOf` / `AsyncErrOf` now infer through the
  awaitable channel only (same results for ordinary `AsyncResult` types).

- a1f68d5: **The extractor family is spelled only `get…`, and `getOrThrow` is now gated.**

  The deprecated `unwrap*` aliases are **removed** — `unwrap`, `unwrapErr`,
  `unwrapOr`, `unwrapOrElse` (they were runtime-identical delegates). Rename to
  their replacements:

  ```ts
  result.unwrap(); // → result.get()
  result.unwrapErr(); // → result.getErr()
  result.unwrapOr(v); // → result.getOr(v)
  result.unwrapOrElse(f); // → result.getOrElse(f)
  ```

  **`getOrThrow` is now type-gated as the complement of `get`.** It compiles only
  when the error channel is **non-empty** (`E` is not `never`) — there must be a
  modeled error for it to throw. On a `Result<T, never>` there is nothing to
  throw, so use `get()` (which gates the other way). Together they partition
  extraction by the error channel's state:

  ```ts
  declare const fallible: Result<number, "e">;
  declare const total: Result<number, never>;

  fallible.getOrThrow(); // ok — throws "e" on Err
  fallible.get(); // ✗ compile error — error channel not empty
  total.get(); // ok
  total.getOrThrow(); // ✗ compile error — nothing to throw; use get()
  ```

  **`UnwrapError` is renamed to `GetError`** — it is what the `get…` extractors
  throw on a wrong-variant access, so it now lives in the `get` register (its
  message no longer says "unwrap" either). It is unreachable through well-typed
  code (only a cast or JS caller reaches it), so most callers never name it; those
  that `instanceof`/`catch` it do a one-line rename.

  Also: the aggregates are hardened against out-of-contract input (only reachable
  via untyped/cast code). `allAsync` / `allFromDictAsync` adopt each input
  defensively (a rejecting thenable becomes a `Defect` instead of rejecting the
  internal promise), and all four aggregates now surface a non-`Result` element (a
  hole/`undefined`) as a `Defect` rather than throwing on `.tag` (sync) or
  rejecting (async) — upholding "an `AsyncResult`'s internal promise never rejects"
  for every input.

### Patch Changes

- 3b06099: Adopt @btravstack/tsconfig@0.2.0 (verbatimModuleSyntax), @btravstack/oxlint@0.2.1 (consistent-type-imports), and @btravstack/lefthook.
- 4096713: Remove the local `tools/tsconfig` / `tools/typedoc` packages and consume the published `@btravstack/tsconfig` / `@btravstack/typedoc` config directly (every package now extends `@btravstack/*` and takes it from the catalog).

## 4.3.0

### Minor Changes

- af0235a: Add `tapFailure` — the one cross-channel observer: it runs a side effect on either failure (`Err` **or** `Defect`) and passes the `Result` through unchanged, for the shared "it went KO" concern (logging, metrics, rollback) that would otherwise be duplicated across `tapErr` + `tapDefect`. The callback receives the new exported `FailureView<E, T>` type (`ErrView | DefectView` — the discriminated variant, so `E` stays typed and the callback narrows on `tag`). Available on both `Result` and `AsyncResult`; a throwing observer preserves the original failure in an `AggregateError` defect, like the other failure observers.

## 4.2.0

### Minor Changes

- 7c5a426: Add `discard()` to `Result` and `AsyncResult` — drops the `Ok` value and
  collapses the success type to `void`. The named form of `map(() => undefined)`:
  unlike `as(undefined)`, which produces `Result<undefined, E>`, `discard()`
  produces `Result<void, E>`. `Err` and `Defect` pass through untouched.
- bfdc68e: Add no-arg overloads `Ok()` and `OkAsync()` — construct a `void` success
  (`Result<void, never>` / `AsyncResult<void, never>`) without writing
  `Ok(undefined)`, and with the success channel typed `void`, not `undefined`.
  The 1-arg forms are unchanged. The companions pick the overload up unchanged
  (`Result.Ok()` / `AsyncResult.Ok()`).

## 4.1.0

### Minor Changes

- 09806e1: Add `fromSafeThrowable` — the synchronous counterpart to `fromSafePromise`:
  wrap a throwing function asserted not to fail in any modeled way, so every
  throw becomes a `Defect` and the error channel is `never`, with no `qualify`
  callback. The explicit, named form of the
  `fromThrowable(fn, (cause, defect) => defect(cause))` boilerplate. Also
  exposed as `Result.fromSafeThrowable` on the companion object.
- 596a62d: Add the `getOrThrow()` eliminator on `Result` / `AsyncResult`. It completes the
  `getOr…` family (`getOrNull` / `getOrUndefined` / `getOrThrow`): it extracts `T`
  from any `Result<T, E>` — not type-gated like `get()` — and **throws the
  modeled error as-is** on `Err` (panicking on a `Defect`, like the rest of the
  family). On `AsyncResult` it returns a `Promise<T>` that rejects the same way.

  This is a deliberate escape hatch off the errors-as-values model: its purpose is
  to move a literal `throw` behind a method, so a `no-throw` lint rule can ban raw
  throws while this one sanctioned extraction remains — the faithful, lint-clean
  form of `.flatMapErr((e) => { throw e }).get()`. Prefer `match` / `recoverErr` /
  `flatMapErr` whenever the error can stay a value.

- 63e9b88: Add pre-lifted async constructors `OkAsync` / `ErrAsync` (and the companion
  aliases `AsyncResult.Ok` / `AsyncResult.Err`) for building an `AsyncResult`
  directly from a value or error — sparing the repeated `Ok(value).toAsync()` /
  `Err(error).toAsync()` on the synchronous branch of an `AsyncResult`-returning
  function. They carry the `Async` suffix the other async free functions use
  (`allAsync`), which the companion drops (`AsyncResult.Ok`). Closes #75.
- d13ad64: Rename several operators for channel-suffix consistency, keeping the old names as
  **deprecated, runtime-identical aliases** (no breaking change; the aliases are
  slated for removal in a future major):

  - `orElse` → **`flatMapErr`** — it is `flatMap` on the error channel, so it now
    follows the `…Err` convention (like `mapErr` / `flatTapErr`).
  - `recover` → **`recoverErr`** — pairs with `recoverDefect`.
  - The extractor family unifies under `get…`: `unwrap` → **`get`**, `unwrapErr` →
    **`getErr`**, `unwrapOr` → **`getOr`**, `unwrapOrElse` → **`getOrElse`** (joining
    the existing `getOrNull` / `getOrUndefined` / `getOrThrow`).

  Both `Result` and `AsyncResult` gain the new names; each deprecated alias just
  delegates to its replacement (the gated `unwrap`/`unwrapErr` keep their `this`
  type-gate). Editors will surface the old names with a deprecation strike-through
  and point at the replacement.

## 4.0.0

### Major Changes

- 8ab4fcb: **Breaking:** `unwrap()` and `unwrapErr()` are now type-gated. `unwrap()` compiles
  only on a `Result` / `AsyncResult` whose error channel is empty (`E = never`), and
  `unwrapErr()` only when the success channel is empty (`T = never`). Calling `.unwrap()`
  on a fallible `Result<T, E>` is now a **compile error** instead of a runtime
  `UnwrapError` — eliminate the error channel first with `match` / `recover` / `orElse`,
  or use the `unwrapOr` / `unwrapOrElse` / `getOrNull` / `getOrUndefined` family (which
  recover an `Err`). `Ok(x).unwrap()` and error-free results are unaffected. The runtime
  is unchanged and `UnwrapError` is retained as a defensive guard.

  Also adds `toBeErrWith` to `@unthrown/vitest` for asserting a plain error value.

- bbe2e70: `TaggedError` now reserves `message` in the payload, alongside `name`. A payload
  field named `message` is rejected at compile time (`message?: never`), and the
  base constructor no longer forwards a payload `message` to `Error`. Define an
  error's message once per subclass the standard way — `override message = "…"`
  (it may interpolate the payload via `this`, since the base populates the fields
  before the subclass field initialiser runs) — so the payload carries only
  structured domain fields, never the human string.

  **Breaking:** an error declaring `<{ message: string; … }>` and constructed with
  `new E({ message, … })` no longer type-checks, and the message is no longer taken
  from the payload at runtime. Move the message to an `override message` field and
  drop it from the payload:

  ```ts
  // before
  class TicketNotFound extends TaggedError("TICKET_NOT_FOUND")<{
    message: string;
    ticketId: string;
  }> {}
  new TicketNotFound({ message: "Ticket not found", ticketId });

  // after
  class TicketNotFound extends TaggedError("TICKET_NOT_FOUND")<{
    ticketId: string;
  }> {
    override message = "Ticket not found";
  }
  new TicketNotFound({ ticketId });
  ```

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
