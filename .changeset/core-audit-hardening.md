---
"unthrown": minor
---

Harden the core against a batch of audit findings. **Minor, not patch**: two of the fixes tighten types, so code that relied on the looser signatures stops compiling (it was already wrong at runtime).

**Type tightenings**

- `mapErrCases` / `recoverErrCases` reject an `async` branch (sync and async surfaces). It used to put `Err(<Promise>)` / `Ok(<Promise>)` in the channel — an un-triaged `Promise` in `E` — and let its rejection float. The compile error reads "Arguments for the rest parameter `_asyncBranchBanned_liftWithFromPromiseThenFlatMapErrCases` were not provided". A helper generic in `E` that re-emits the error with `P._` still compiles. A thenable slipped past the types becomes a `Defect`.
- An empty object pattern `{}` in `.with(…)` is a compile error. It matched every object at runtime and removed every case from the exhaustiveness check.

**Fixes**

- Declaration emit: `export const x = OkAsync(1)` (or any inferred `AsyncResult`, or a `match(…)` builder) no longer fails with TS4023 / TS2527 in a consumer compiling with `declaration: true`. The bundled types had renamed `AsyncResult` / `Result` to an unexported `AsyncResult$1` / `Result$1`.
- The thenable safety nets no longer **start** a lazy thenable. `fromSafeThrowable(() => prisma.user.deleteMany())` returned a `Defect` and ran the delete anyway. Only genuine `Promise`s are silenced now; any other thenable is still classified, but its `then` is never called.
- `fromThrowable`: a hostile `then` getter on the return value becomes a `Defect` instead of going through `qualify`.
- `allFromDict` / `allFromDictAsync` / `validateAllFromDict` / `validateAllFromDictAsync` fold symbol keys. A symbol-keyed `Err` used to be dropped. The record type is now `Record<PropertyKey, …>`.
- The aggregates turn an out-of-contract container (`all(undefined)`, `allFromDict(null)`, a throwing getter) into a `Defect` instead of throwing. The async forms no longer throw synchronously.
- `bind` / `let` on a non-plain scope (a class instance) is a `Defect`. The spread used to silently drop its getters.
- `isResult` also requires `tag` and its payload to be own data properties. A forged object with a throwing getter, built on a real `Result` prototype, could make `all` throw or an `AsyncResult` reject.
- `NonExhaustiveError`'s constructor no longer throws on an unprintable value (a circular null-prototype object, a hostile `toString`). `P.tag()` patterns are frozen.

**Diagnostics**

- `get()` / `getErr()` on the wrong channel now print what to do (`recoverErrCases` / `match` / the `getOr…` family) instead of a `DefectView` mismatch.
- An `async` callback in the async `flatMap` / `flatTap` / `bind` / `flatMapErrCases` / `flatTapErrCases` reports "required in type `ReturnAnAsyncResultNotAPromise`" instead of `{ flatMap: unknown }` or 25 missing methods.
- A non-exhaustive match reports `UnhandledCases<…>` (formerly `NonExhaustive<…>`).

**Docs**

- `P.instanceOf` exhaustiveness is structural: two classes with the same shape count as one case. This is documented, with the remedy: a distinguishing `readonly kind` field, or `TaggedError`.
- `match`, `P` and `NonExhaustiveError` now have examples.
