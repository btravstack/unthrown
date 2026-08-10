# No-arg `Ok()` / `OkAsync()` — construct a `void` success without `Ok(undefined)`

**Date:** 2026-07-23
**Status:** Approved
**Package:** `unthrown` (core) — minor release

## Motivation

`discard()` (PR #100) closed the `undefined`-vs-`void` gap on the pipeline
side. At the **origin** the boilerplate remains: functions whose synchronous
branch succeeds with nothing write `Ok(undefined)` — which also types the
success channel `undefined`, so a `Result<void, E>` signature leans on
`undefined → void` assignability instead of saying `void`.

A no-arg overload keeps this the **same concept at a different arity** — not a
second name — so it respects "one concept = one name". Direct precedent:
neverthrow's `ok()` carries this exact overload.

## Public surface (`packages/core/src/constructors.ts`)

```ts
export function Ok(): Result<void, never>;
export function Ok<T>(value: T): Result<T, never>;
export function Ok<T>(value?: T): Result<T, never> {
  return okRes(value as T);
}

export function OkAsync(): AsyncResult<void, never>;
export function OkAsync<T>(value: T): AsyncResult<T, never>;
export function OkAsync<T>(value?: T): AsyncResult<T, never> {
  return Ok(value as T).toAsync();
}
```

- The `value as T` in each implementation signature is a new, deliberate cast:
  invisible to callers and sound, because the only way in with no argument is
  the no-arg overload, which fixes the result type to void — exactly what the
  omitted undefined inhabits. Carries a one-line comment (the project documents
  its few deliberate casts).
- No behavior change for existing 1-arg callers; the runtime path is
  unchanged.
- The companions (`Result.Ok`, `AsyncResult.Ok`) alias these functions in
  `facade.ts`, so they pick up the overload with **no facade change**.
- `Err` / `ErrAsync` get **nothing** — a void error has no use case (YAGNI).
- No new exports; `index.ts` untouched.

## Tests

- Runtime (`result.spec.ts` / `async-result.spec.ts`): `Ok().get()` is
  `undefined`; `(await OkAsync()).get()` is `undefined` — covers the
  defaulted-parameter path.
- Type-level (`types.test-d.ts`):
  - `Ok()` is `Result<void, never>`; `OkAsync()` is `AsyncResult<void, never>`.
  - 1-arg inference unchanged: `Ok(1)` still `Result<number, never>` (the
    existing `_ok` assertion already pins this — verify it still holds rather
    than duplicating it).
- Core's 100% line/function coverage threshold must stay green.

## Docs

- TSDoc on `Ok` and `OkAsync` gains the no-arg case and an `@example` showing
  `Ok()` for a `Result<void, E>`-returning function.
- CLAUDE.md's Public surface **constructors** bullet gets a clause noting the
  no-arg overload (`Ok()` / `OkAsync()` → `void` success).
- Grep `docs/guide/` (and package READMEs) for `Ok(undefined)` /
  `OkAsync(undefined)`: update any occurrence to the no-arg form. This grep is
  mandatory — the discard branch's final review caught exactly this class of
  stale-enumeration omission.
- Changeset: **minor** on `unthrown`.

## Branch/base note

Independent of the `discard()` branch (touches `constructors.ts`, not the
method surfaces): branch from `main`. If PR #100 merges first, rebase is
trivial; the only shared file is CLAUDE.md (different bullets) and possibly a
changeset directory neighbor.

## Explicitly out of scope

- `OkVoid` / `Result.void`-style dedicated exports.
- An `Err()` / `ErrAsync()` no-arg overload.
- Satellite-package changes (matchers, pattern, interop bridges — all operate
  on variants/types, not constructor arity).
