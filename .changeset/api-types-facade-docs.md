---
"unthrown": patch
---

Polish the generated API reference (comment-only): give the `Types`-section
aliases practical framing and examples (`OkView`/`ErrView`/`DefectView` note what
each guard narrows to; `OkOf`/`ErrOf`/`AsyncOkOf`/`AsyncErrOf` show a type-extraction
example), and group the `Result`/`AsyncResult` **type** aliases under the `Facade`
category alongside their companion objects, cross-linked so the value+type pairing
is clear.
