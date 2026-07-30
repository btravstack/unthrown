---
"@unthrown/oxlint": minor
---

Add the `no-unused-matcher` rule (#171) — and enable it in the `recommended`
preset.

A `…Cases` callback (the five error combinators, and `match`'s `errCases`
handler) that never uses the matcher it was handed sources its exhaustiveness
from a builder bound to some **other** value. The type checker cannot see it —
the `ExhaustiveMatch` constraint is structural, and `noUnusedParameters` never
fires because the parameter is not unused, it is simply never declared — and
the runtime runs the borrowed builder against whatever value _it_ closed over:
the wrong branch is chosen silently (a plausible wrong value, with the Err
channel typing as fully handled), or nothing matches and the modeled error
becomes a Defect.

The rule reports a callback whose matcher parameter is absent (`() => …`) or
never read, and — separately, to catch a trivial `void matcher` reference
fronting for a foreign builder — any second unthrown / ts-pattern `match(...)`
built in the callback's own body. Branch handlers (nested functions) stay free
to match their payload. There is no escape hatch: a `…Cases` callback that
does not use its matcher is never what you meant.

Enabling the rule in `recommended` can surface new lint errors in an existing
codebase; each one is a real bug of the shape above.
