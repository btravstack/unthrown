---
"unthrown": patch
---

Make the fluent combinators discoverable in the generated API reference. Because
`Result` / `AsyncResult` are discriminated-union aliases, TypeDoc can't list
their methods on the type page. Rather than expose a standalone method-surface
type for that (which would split the docs into two near-duplicate blocks), the
`Result` / `AsyncResult` type docs now link to the intent-organized "Choosing a
combinator" guide, which covers both in one shared table. The core
`typedoc.json` also gets an explicit `categoryOrder` (`Facade` → `Types` →
`Constructors` → … then `Aggregate`, `Errors`) so the core surface leads the
reference instead of the default alphabetical order, which had buried it under
`Aggregate`.

The `ResultMethods` / `AsyncResultMethods` types stay **internal** — not part of
the public API. (An earlier, still-unreleased change briefly exported them; this
removes those exports before any release, so no published type surface changes.)
