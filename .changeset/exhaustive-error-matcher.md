---
"unthrown": major
---

**The error channel is now matched exhaustively with ts-pattern** (Thesis #5).
The error combinators — `mapErrCases`, `flatMapErrCases`, `recoverErrCases`, `tapErrCases`,
`flatTapErrCases` — no longer take a plain callback. Their callback receives a
ts-pattern match builder over the error (`match(error)`) plus the injected
`defect` helper, and **returns the un-terminated builder** — the combinator
calls `.exhaustive()` for you:

```ts
import { P } from "unthrown";

// before
result.mapErr((error) => {
  if (error._tag === "RecordNotFound") return new NotFoundException(id);
  throw error.cause; // silent fallthrough — a future tag lands here unnoticed
});

// after — exhaustive; the type checker forces every case to be handled
result.mapErrCases((matcher, defect) =>
  matcher
    .with(P.tag("RecordNotFound"), () => new NotFoundException(id))
    .with(P.tag("DriverError"), (e) => defect(e.cause)),
);
```

The matcher callback parameter is named `matcher` (not `m`).

**Every error is handled explicitly, and enriching the error channel is a
compile error at every consuming site** until each new case is handled. Because
the combinator runs `.exhaustive()`, a missing case does not compile — there is
no `.exhaustive()` to forget and no `.otherwise()` to smuggle in a fallback.

- **Match on anything ts-pattern supports** — `_tag`, a `code`-discriminated
  union (the oRPC shape), structural shapes, guards, and grouped patterns
  (`.with(a, b, handler)` — one strategy for several cases). `P.tag("X")` is sugar
  for the `{ _tag: "X" }` pattern.
- **Name the cases; group the ones that share a handler** — `.with(a, b, handler)`
  writes the handler once and still spells every case out, which is what keeps a
  new case a compile error. `P._` remains available as an **escape hatch**
  (principally a helper generic in `E`, where no arm list can prove coverage),
  not as a drop-in for the old single callback.
- Each branch receives the narrowed variant **and the injected `defect` helper**
  (`.with(P.tag("X"), (e) => defect(e.cause))`); its `Defect` arm is subtracted
  from the outgoing `E` (`Exclude<O, Defect>`, the boundary inference). A
  throwing branch also becomes a `Defect` (the safety net).
- **Observers match exhaustively too** (`tapErrCases`/`flatTapErrCases`, with the
  same named arms); the error is observed and flows through unchanged.

**Core now depends on `ts-pattern`** (a small, types-heavy, dual-copy-safe
library), and re-exports `match` and `P` — so the matcher, and matching a whole
`Result` (`match(r).with(P.Ok(), …)`), are first-class in one import. **The
`@unthrown/pattern` package is removed** — its `tag` helper is now core's
`P.tag(t)` pattern constructor; the `P.Ok`/`P.Err`/`P.Defect` sugar is dropped
(match the union structurally instead).

**`match` now matches the error channel exhaustively too, and `matchTags` is
removed.** `match`'s error handler no longer takes a blanket `(error) => R`
callback — it receives the same ts-pattern matcher and returns the un-terminated
builder (no `defect` helper: `match` folds to a value, with no `Defect` output
channel). It is also **renamed `err` → `errCases`** to match the combinators and
to make the change loud (a leftover 4.x `err:` handler is now an
excess-property compile error). This subsumes the old `matchTags` fold — a per-tag fold over a tagged
union is now `match` with the matcher and `P.tag(t)`, and it generalises to any
discriminant, not only `_tag`:

```ts
import { P } from "unthrown";

// before
matchTags(result, {
  Ok: (n) => `got ${n}`,
  Defect: (cause) => `bug: ${String(cause)}`,
  NotFound: () => "404",
  Forbidden: (e) => `403 for ${e.user}`,
});

// after
result.match({
  ok: (n) => `got ${n}`,
  defect: (cause) => `bug: ${String(cause)}`,
  errCases: (matcher) =>
    matcher
      .with(P.tag("NotFound"), () => "404")
      .with(P.tag("Forbidden"), (e) => `403 for ${e.user}`),
});
```

Name every case here too, grouping the ones that share a handler; `.with(P._, …)`
stays an escape hatch, not the shape to reach for first. `matchTags` and its
`TagHandlers` type are gone; `TaggedError` is unchanged. **Library code generic
in the error type `E`** (which ts-pattern can't prove exhaustive over an
unresolved type parameter) should fold with the `isOk` / `isErr` / `isDefect`
guards instead of `match`.

**Also breaking:** the deprecated error-channel aliases `orElse` and `recover`
are removed; the extractor aliases (`unwrap`, `unwrapErr`, `unwrapOr`,
`unwrapOrElse`) remain. `AsyncOkOf` / `AsyncErrOf` now infer through the
awaitable channel only (same results for ordinary `AsyncResult` types).
