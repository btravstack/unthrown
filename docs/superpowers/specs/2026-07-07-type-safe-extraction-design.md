# Design: type-safe value extraction (gate `unwrap` / `unwrapErr`)

**Date:** 2026-07-07
**Status:** approved (design)
**Package:** `unthrown` (`packages/core`), with ripple to docs + interop-package examples
**Breaking:** yes — **major** version bump

## Problem

`unwrap()` compiles on _any_ `Result<T, E>` and throws an `UnwrapError` at runtime
when the value isn't `Ok`. So `result.unwrap()` on a `Result<T, DomainError>`
silently bypasses error handling and blows up at runtime if it turns out to be an
`Err` — the exact footgun a values-not-exceptions library exists to remove.
`unwrapErr()` has the symmetric problem on `Ok`.

## Goal

Make value/error extraction **safe by construction**: you may only `unwrap()` once
the error channel is provably empty (`E = never`), and only `unwrapErr()` once the
success channel is provably empty (`T = never`). Calling them on a genuinely
fallible `Result` becomes a **compile error**, forcing you to eliminate the
opposite channel first (`match` / `recover` / `orElse`).

## Design

### The gate (type-only change)

Add a `this` parameter to the two throwing eliminators on both the sync and async
method surfaces. **No runtime change** — only the receiver types tighten.

```ts
// ResultMethods<T, E>
unwrap(this: Result<T, never>): T;
unwrapErr(this: Result<never, E>): E;

// AsyncResultMethods<T, E>
unwrap(this: AsyncResult<T, never>): Promise<T>;
unwrapErr(this: AsyncResult<never, E>): Promise<E>;
```

Verified mechanics (minimal `tsc` probe): a receiver `Result<T, "odd">` is **not**
assignable to `Result<T, never>` (its `ErrView<"odd">` member has no home in the
`never` union), so `.unwrap()` is a compile error; `Ok(1)` — already
`Result<number, never>` — still compiles. Symmetric for `unwrapErr` on
`Result<never, E>`. TypeScript's `this`-param method gating on a union receiver is
the same mechanism the existing `isOk()`/`isErr()` `this is …` guards rely on.

### What does _not_ change

- **The runtime of `unwrap`/`unwrapErr` is untouched.** `unwrap`: `Ok → value`;
  `Defect → rethrow cause` (panic); `Err → throw UnwrapError(error)`. The `Err`
  arm is now **type-unreachable** (you can't get a typed `Err<never>`), but is
  retained as a defensive guard for unsound runtime misuse (raw JS callers, `as`
  casts). `unwrapErr` symmetric.
- **`UnwrapError` stays** (public export unchanged) — the defensive carrier for
  that unreachable-in-typed-code branch.
- **Names stay** `unwrap` / `unwrapErr` — they just become safe. "Unwrap the
  value" still reads correctly; least churn.
- **The `unwrapOr` / `unwrapOrElse` / `getOrNull` / `getOrUndefined` family is
  unchanged.** It already recovers `Err` safely (never throws `UnwrapError`), only
  panicking on a `Defect`. `unwrapOrElse((e) => { throw … })` remains the explicit,
  sanctioned "assert-Ok-and-panic-with-my-own-error" outlet — no separate escape
  hatch is added.

### No escape hatch

The old "assert `Ok`, throw `UnwrapError` on `Err`" behavior is intentionally
removed from the typed surface. Replacements:

- **Tests** → `@unthrown/vitest` matchers (`toBeOk` / `toBeOkWith` / `toBeErr` /
  `toBeErrTagged` / `toBeDefect`) or the type-narrowing guards
  (`if (r.isOk()) r.value`, `if (r.isErr()) r.error`).
- **Production "can't fail here"** → `match({...})`, `recover`, `orElse`, or
  `unwrapOrElse((e) => { throw … })` — the panic is explicit and self-documented.

## Invariant changes (CLAUDE.md)

The "**`unwrap()` is asymmetric**" load-bearing invariant is reworded:

> `unwrap()` / `unwrapErr()` only **type-check when the opposite channel is
> `never`** (`unwrap` needs `E = never`; `unwrapErr` needs `T = never`). On a
> `Defect` they **rethrow the original cause** (panic). The `UnwrapError`-on-wrong-
> variant branch remains at runtime as a defensive guard but is unreachable through
> well-typed code.

Also update: the Thesis/Public-surface eliminator description, and the
`invariants.spec.ts` guard for it (the "throws `UnwrapError`" test now exercises
the _defensive_ branch via a deliberate `as unknown as Result<T, never>` cast,
labeled as testing unsound-runtime defense).

## Migration (in-repo)

Every typed `.unwrap()` / `.unwrapErr()` on a `Result` whose _opposite_ channel is
inhabited must change. Scope:

- **Core specs** — `interop.spec`, `aggregate.spec`, `do.spec`, `result.spec`,
  `async-result.spec`, `facade.spec`, `invariants.spec`, `tagged.spec`: audit each
  `unwrap()`/`unwrapErr()`; the ones on `Ok(…)` / `fromSafePromise(…)` / all-`Ok`
  aggregates keep compiling (`E = never`), the ones asserting a real `Err`/value
  move to matchers or `isOk()`/`isErr()` guards or `match`.
- **Interop package specs** (`effect`, `neverthrow`, `boxed`, `standard-schema`,
  `pattern`, `vitest`) — same audit.
- **Docs & examples** — root/per-package READMEs, `docs/guide/*`, recipes: any
  snippet that unwraps a fallible result gets updated to the guarded form.
- **`test-d`** — add `@ts-expect-error` cases: `.unwrap()` on a fallible `Result`
  and on a fallible `AsyncResult` must not compile; `unwrapErr` symmetric; and a
  positive case that both compile on the `never`-channel form.

Note a likely ergonomic gap surfaced by migration: there is **no `toBeErrWith`
matcher** for a _plain_ (non-tagged) error value, so asserting `unwrapErr() === x`
becomes `if (r.isErr()) expect(r.error).toBe(x)`. Acceptable and type-safe;
a `toBeErrWith` matcher is noted as a possible **follow-up**, out of scope here.

## Out of scope

- Renaming to `get` / `getErr` (rejected — keep `unwrap`).
- Removing `UnwrapError` (rejected — kept as defensive guard).
- A `toBeErrWith` vitest matcher (possible follow-up).
- An oxlint `no-unsafe-unwrap` rule — the type gate _is_ the enforcement now, so a
  lint rule is redundant.
- Touching the `unwrapOr` / `getOr*` family.

## Verification

- New `test-d` `@ts-expect-error` guards (above) fail to compile pre-change and
  pass post-change; positive `never`-channel cases compile.
- Full gate green: `format`, `lint`, `typecheck` (incl. `test-d`), `knip`, `test`
  (all packages, after migration), `build`, `build:docs` (typedoc-warning-free).
- A **major** changeset (`unthrown`, cascading to the fixed group) describing the
  breaking extraction gate and the migration path.
