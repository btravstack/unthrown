---
"unthrown": patch
"@unthrown/vitest": patch
"@unthrown/effect": patch
"@unthrown/neverthrow": patch
"@unthrown/boxed": patch
---

Internal cleanup, no behaviour or API change.

`unthrown`: `AsyncRes` now delegates each of its eleven non-awaiting combinators
(`map`, `tap`, `let`, `as`, `discard`, `ensure`, `mapErrCases`,
`recoverErrCases`, `tapErrCases`, `tapDefect`, `tapFailure`) to the sync `Res`
method through one private `#lift` helper, instead of restating the same tag
check, try/catch and throw→defect net inside a `.then`. The six that genuinely
differ — `flatMap`, `flatTap`, `bind`, `flatMapErrCases`, `flatTapErrCases`,
`recoverDefect`, each awaiting a callback result that may be an `AsyncResult` —
are unchanged. `allFromDict` / `allFromDictAsync` fold through the positional
`foldArray` and pair keys back on with `Object.fromEntries`, whose
CreateDataProperty semantics give the same `"__proto__"` guarantee the explicit
`Object.defineProperty` loop bought by hand.

`@unthrown/vitest`: the seven matchers are built from one shared definition
rather than seven copies of the same twelve lines; assertion messages are
byte-identical. `render`'s unreachable fallthrough is gone — after the `Ok` and
`Err` returns the remaining variant is the `Defect`, so the third guard could
never be false.

`@unthrown/effect`, `@unthrown/neverthrow`, `@unthrown/boxed`: each package's
local `settle` helper is replaced by `Promise.resolve`, which performs the same
thenable adoption.
