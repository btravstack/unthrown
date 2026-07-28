---
"@unthrown/oxlint": minor
---

**`unthrown/no-ambiguous-error-type` now covers the matcher's
`returnType<R>()` pin.** The rule read type _annotations_ only, so
`mapErrCases((m) => m.returnType<unknown>().with(…))` — a type _argument_ —
declared `E = unknown` with nothing to stop it, the very thing
`Result<T, unknown>` is rejected for.

It fires on a pin in a `mapErrCases` callback and nowhere else, because that is
the only surface whose builder output _becomes_ the error channel. The others
pin something that is not `E`, so an ambiguous pin there is legitimate and is
deliberately left alone: `recoverErrCases` pins the **success** type,
`tapErrCases`'s branch results are **discarded**, and `match`'s `errCases` (like
a standalone `match`) folds to a plain **value**. `flatMapErrCases` /
`flatTapErrCases` need no case of their own either — their output must be a
`Result`, so a bare ambiguous pin does not type-check at all, and an ambiguous
`E2` nested in a `Result<U, E2>` pin was already reported (the rule reads type
arguments wherever they occur).

The same ambiguity table applies (`unknown`, `any`, `Error`, `{}`, `object`,
`void` and the primitives; `never` allowed, one ambiguous union member taints
the whole pin). The pin is recognised on the callback's own matcher parameter
via scope analysis, so a matcher first copied into another variable, or a
callback declared elsewhere and passed by reference, is a documented syntactic
miss — no false positives is the design priority.
