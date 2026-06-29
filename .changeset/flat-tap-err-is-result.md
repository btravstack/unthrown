---
"unthrown": minor
---

Add two members, closing the only structural gaps surfaced by comparing the
surface against boxed / neverthrow / byethrow:

- **`flatTapErr`** (on `Result` and `AsyncResult`) — the error-channel mirror of
  `flatTap`: runs a `Result`-returning effect on the error, keeps the original
  error on the effect's success, and threads the effect's error otherwise
  (`Result<T, E | E2>`). A throw becomes a `Defect`, like every other combinator.
  Use it for a failable effect _during_ error handling (e.g. writing the error to
  an audit log that may itself fail).
- **`isResult(x)`** — a standalone type guard narrowing an `unknown` to
  `Result<unknown, unknown>` (and `Result.isResult`). It checks the value carries
  the `Result` prototype, so a plain `{ tag: "Ok" }` look-alike is not matched;
  an `AsyncResult` is not a `Result`. For untyped interop boundaries.
