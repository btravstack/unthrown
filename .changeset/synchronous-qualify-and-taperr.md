---
"unthrown": major
---

**`qualify` is now synchronous, and `tapErr` bans async branches** — two
qualification-bypass holes closed at the type level.

- `fromThrowable` / `fromPromise` now intersect `qualify`'s return with
  `NotThenable`, so an `async` qualify no longer compiles. It used to compile
  and silently defeat the triage: the returned promise landed in `E` as
  `Err(Promise<…>)` (the `Defect` subtraction cannot see through a promise),
  and a throwing async qualify escaped as an unhandled rejection. At runtime a
  thenable slipped past the types now becomes a `Defect` (never `Err(Promise)`),
  and the orphaned thenable is adopted so its later rejection cannot float.
- `tapErr`'s matcher-builder output is now `NotThenable`-constrained on both
  surfaces. It was the one observer whose branch results are discarded, so an
  `async` branch's rejection floated invisibly — `tap`, `tapDefect`, and
  `tapFailure` already banned thenable callbacks. The non-awaiting
  transformers `mapErr` / `recoverErr` still accept an async branch (its
  promise is a visible value in the output type, not a rejection bypass).

Migration: make the qualify (or `tapErr` branch) synchronous — do the async
work first, or re-enter through `fromPromise` and compose with `flatMap`.
