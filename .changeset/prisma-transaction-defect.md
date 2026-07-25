---
"@unthrown/prisma": patch
---

`$tryTransaction` no longer downgrades an out-of-contract callback return to a
modeled `Err(DriverError)`: a callback that resolves to a non-`Result` (untyped
or cast callers) now rolls back and surfaces as a `Defect` with a `TypeError`
cause — the same policy as a throwing callback. A bug stays a defect.
