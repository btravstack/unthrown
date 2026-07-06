---
"unthrown": patch
---

Improve the generated API reference so the fluent combinators are discoverable
(comment/config-only — no runtime or type changes). Because `Result` /
`AsyncResult` are discriminated-union aliases, TypeDoc can't list their methods
on the type page; rather than split the surface into a standalone method type,
the `Result` / `AsyncResult` docs now link to the intent-organized "Choosing a
combinator" guide (which already covers both in one table). The core
`typedoc.json` also gets an explicit `categoryOrder` (`Facade` → `Types` →
`Constructors` → … then `Aggregate`, `Errors`) so the core surface leads the
reference instead of the default alphabetical order, which had buried it under
`Aggregate`.
