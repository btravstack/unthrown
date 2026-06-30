---
"unthrown": minor
---

`UnwrapError` now exposes the offending value on the standard `Error.cause` in
addition to its typed `.error` property. When `unwrap()`/`unwrapErr()` throw on a
modeled `Result`, an `Error`-typed `E` (e.g. a `TaggedError`) chains its original
stack under "caused by"; other payloads surface under `[cause]`. `.error` is
unchanged, and the `Defect` panic path still rethrows the raw cause.
