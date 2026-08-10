# `discard()` — drop the Ok value, collapse the success type to `void`

**Date:** 2026-07-23
**Status:** Approved
**Package:** `unthrown` (core) — minor release

## Motivation

Consumer code accumulates `.map(() => undefined)` to turn a
`Result<T, E>` / `AsyncResult<T, E>` into a void-success result. The existing
`as(undefined)` covers the runtime but infers `Result<undefined, E>` — reaching
`Result<void, E>` in a signature then leans on `undefined → void` assignability
instead of saying what is meant. `discard()` names the intent (the value's
story ends here) and produces the `void` type directly.

`discard` is **not** an alias of `as`: `as` replaces the value with another
value; `discard` drops it. One concept each — consistent with the
"one concept = one name" rule.

## Public surface

```ts
// ResultMethods (packages/core/src/types.ts) — canonical docs
discard(): Result<void, E>;

// AsyncResultMethods (same file) — links back to the sync doc, states the delta
discard(): AsyncResult<void, E>;
```

No new exports; it is a method on the existing surfaces, so `index.ts` is
untouched. Tree-shaking is unaffected.

## Runtime (`packages/core/src/core.ts`)

Placed next to `as` on `Res`:

```ts
discard(this: Result<T, E>): Result<void, E> {
  if (this.tag !== "Ok") return passThrough(this);
  return okRes(undefined);
}
```

- `Ok(v)` → a fresh frozen `Ok(undefined)` typed `void`.
- `Err` / `Defect` pass through untouched via the existing `passThrough`
  helper — no new cast sites.
- No callback ⇒ no throw→defect path, no thenable concern, no `NotThenable`
  intersection needed. Simplest operator on the surface.
- `AsyncRes` mirrors it the way it mirrors `as`: branch on the awaited
  `Result`'s tag (equivalently, delegate to the sync `discard`).

## Tests

- `result.spec.ts` / `async-result.spec.ts` (mirroring the `as` tests):
  - `Ok(1).discard()` is `Ok` holding `undefined`.
  - `Err("e").discard()` passes the error through untouched.
  - defect `.discard()` stays a defect.
- `types.test-d.ts`: `Expect<Equal<typeof r, Result<void, "e">>>` for the sync
  form and the async mirror — the `void`-not-`undefined` result type is the
  operator's reason to exist, so it gets a type-level assertion.
- `invariants.spec.ts`: add `discard` to the defect-pass-through sweep where
  `as` already appears.
- Core's 100% line/function coverage threshold must stay green.

## Docs

- Full TSDoc on `ResultMethods.discard`; `AsyncResultMethods.discard` links
  back per the async-mirror convention.
- New row in `docs/guide/choosing-a-combinator.md`: "I want to drop the
  success value → `discard`".
- CLAUDE.md public-surface success line becomes `…, as, discard`.
- Changeset: **minor** on `unthrown`.

## Explicitly out of scope

- Deprecating `as` — still the right tool for replacing with a _value_.
- A `discardErr` mirror — dropping an error's identity has no use case (YAGNI).
- Any satellite-package changes — matchers, pattern helpers, and interop
  bridges are unaffected by a new core method.
