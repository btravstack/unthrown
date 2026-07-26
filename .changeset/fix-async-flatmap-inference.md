---
"unthrown": patch
---

**Fix: async `flatMap` / `flatTap` / `bind` no longer collapse the callback's
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
