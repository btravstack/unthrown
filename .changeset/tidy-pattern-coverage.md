---
"unthrown": minor
---

Fix false exhaustiveness for widened value patterns. A value pattern now discharges a case only when its type is a unit type (a string / number / bigint / boolean literal, `null`, `undefined`, a `unique symbol`) or a plain object of such fields: a widened `string`, a template literal such as `` `E_${string}` ``, a union-typed value, a union of `P.*` patterns, an array or a function still match at runtime but no longer remove every possible value from the remaining cases.

**Breaking for typechecks:** code that relied on a widened pattern to prove exhaustiveness — `const p = { _tag: "A" }`, inferred as `{ _tag: string }` — now fails with `UnhandledCases<…>`. Preserve the literal with `as const`, write the object inline, or use `P.tag` / `P.instanceOf` / `P.when`.
