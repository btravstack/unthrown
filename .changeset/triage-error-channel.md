---
"unthrown": major
---

**The error channel is now triaged, never blanket-handled** (Thesis #5). The
error transformers — `mapErr`, `flatMapErr`, `recoverErr` — no longer take a
single callback: they take a **triage object** (`ErrTriage<E, R>`), one branch
per error `_tag`, exhaustive at compile time, with a reserved `Else` branch as
the explicit blanket escape hatch. Adding a tag to `E` now surfaces every call
site that consumes the error channel.

```ts
// before
result.mapErr((e) => {
  if (e._tag === "RecordNotFound") return new NotFoundException(id);
  throw e.cause; // silent fallthrough — a future tag lands here unnoticed
});

// after — exhaustive; a branch that throws leaves the outgoing E
result.mapErr({
  RecordNotFound: () => new NotFoundException(id),
  DriverError: (e) => {
    throw e.cause;
  },
});
```

- Each branch receives its **narrowed** variant; the outgoing types are the
  union of the branch returns — a throwing branch (type `never`) subtracts its
  tag from `E`.
- **`Else`** (reserved key) opts into deliberate partial handling; it receives
  the full union. An **untagged or mixed** `E` must use it — `{ Else: f }` is
  the one-line migration of every old callback call site.
- The **observers** (`tapErr`, `flatTapErr`, `tapDefect`, `tapFailure`) keep
  their single callback: observing a union uniformly can't strand a future tag.
- At runtime, an error whose tag has no branch and no `Else` (only reachable
  outside the typed contract) becomes a `Defect` carrying it, mirroring
  `matchTags`.

**Also breaking:** the deprecated error-channel aliases `orElse` and `recover`
are removed (their signatures broke anyway); the deprecated extractor aliases
(`unwrap`, `unwrapErr`, `unwrapOr`, `unwrapOrElse`) remain. `AsyncOkOf` /
`AsyncErrOf` now infer through the awaitable channel only (same results for
ordinary `AsyncResult` types).
