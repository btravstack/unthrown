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

// after — exhaustive; the defect branch leaves the outgoing E
result.mapErr({
  RecordNotFound: () => new NotFoundException(id),
  DriverError: (e, defect) => defect(e.cause),
});
```

- Each branch receives its **narrowed** variant **and the injected `defect`
  helper** (the same second argument `qualify` gets) — the sanctioned,
  lint-clean `Err`→`Defect` form. The outgoing types are the union of the
  branch returns with the `Defect` arm subtracted (`Exclude<R, Defect>`, the
  boundary inference); a throwing branch still defects too (the safety net).
- **`mergeTags(fn)`** is the explicit, greppable opt-out of exhaustiveness — a
  wrapper, not a fallthrough branch inside the object (there is none). It is
  also the only form for an **untagged or mixed** `E`, and the one-line
  migration of every old callback call site: `mapErr(f)` → `mapErr(mergeTags(f))`.
- The error **observers** (`tapErr`, `flatTapErr`) take the **partial** triage
  form: same object shape, every branch optional — an unobserved tag flows
  through, so `tapErr({ Conflict: alert })` needs no manual narrowing, and
  uniform observation is `tapErr(mergeTags((e) => log(e)))`. A bare callback
  is rejected (wrap it in `mergeTags`); a `Defect`-producing merged observer
  is rejected too (observation never consumes). `tapDefect` / `tapFailure`
  keep single callbacks — their payloads carry no tags.
- At runtime, an error whose tag has no transforming branch (only reachable
  outside the typed contract) becomes a `Defect` carrying it, mirroring
  `matchTags`.

**Also breaking:** the deprecated error-channel aliases `orElse` and `recover`
are removed (their signatures broke anyway); the deprecated extractor aliases
(`unwrap`, `unwrapErr`, `unwrapOr`, `unwrapOrElse`) remain. `AsyncOkOf` /
`AsyncErrOf` now infer through the awaitable channel only (same results for
ordinary `AsyncResult` types).
