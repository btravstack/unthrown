---
"@unthrown/oxlint": minor
"unthrown": patch
---

Add the opt-in `no-get-or-throw` rule, and withdraw the circular `getOrThrow`
rationale.

`getOrThrow()` extracts `T` but throws the modeled error as-is, abandoning
errors-as-values at the last step — a caller of the enclosing function sees a
throw, not a channel. The new rule reports it, pointing at the fold that keeps
the error a value: `recoverErrCases` empties `E`, so `get()` compiles, and a
case routed to the injected `defect(...)` panics with its original cause.

It matches a **zero-argument** `.getOrThrow()` member call, so Effect's
one-argument `Option.getOrThrow(o)` / `Either.getOrThrow(e)` are untouched. A
computed access and a detached reference are documented misses.

The rule is **opt-in**, not in the `recommended` preset, and deliberately
option-free: `getOrThrow()` is the right tool in a test, and oxlint's own
`overrides` already exempts a test glob. It is also the one rule an existing
test suite fails until configured, which is no way to behave in a preset.

It stacks with `no-throw`: alone, each leaves the other spelling as an escape;
together there is none. That made `no-throw`'s own message — which recommended
`getOrThrow()` as the sanctioned escape — circular, so it now points at
`recoverErrCases` + `get` instead. `getOrThrow`'s TSDoc is reframed the same
way: a test-and-script tool, not the production escape. **`getOrThrow` itself
is unchanged and not deprecated** — the `unthrown` bump is documentation only.
