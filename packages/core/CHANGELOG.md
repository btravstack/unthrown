# unthrown

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
