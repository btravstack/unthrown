---
"unthrown": patch
---

**Runtime hardening** — none of these change well-typed behavior:

- Every combinator whose callback must return a `Result` (`flatMap`,
  `flatTap`, `bind`, `flatMapErr`, `flatTapErr`, `recoverDefect` — both
  surfaces) now turns an out-of-contract non-`Result` return (untyped or cast
  callers) into a `TypeError`-caused `Defect` instead of letting a poison
  value throw a raw `TypeError` further down the pipeline — the same policy
  the aggregates already apply.
- `Res.prototype` / `AsyncRes.prototype` are frozen, the `AsyncResult`
  internal promise is a native `#private` field, and the qualify-time `defect`
  marker is frozen — the never-rejects and no-forgery invariants are now
  tamper-resistant.
- `isResult` recognises a `Result` built by another copy of unthrown (dual
  CJS/ESM require/import, cross-realm) via a `Symbol.for("unthrown.Result")`
  prototype brand; a structural look-alike still fails.
- `TaggedError` now reserves `stack` off the payload alongside `name` and
  `message` (an untyped payload can no longer clobber the real trace);
  `cause` stays a legitimate typed payload field.
