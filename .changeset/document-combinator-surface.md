---
"unthrown": patch
---

Document the fluent combinators on the generated API reference. The method
surface every `Result` / `AsyncResult` carries is now exported as two
**documentation-only** types — `ResultMethods` (sync) and `AsyncResultMethods`
(async, with the `AsyncResult`/`Promise`-returning signatures) — categorized
under `Methods`, so the reference lists every combinator's signature and prose.
The `Result` / `AsyncResult` aliases and the `OkView`/`ErrView`/`DefectView`
variants link to them, and the async method docs link to their sync counterparts.
The "Choosing a combinator" guide stays the "which one do I reach for?"
cheat-sheet and links to these API sections.
