---
"unthrown": minor
---

Add the `getOrThrow()` eliminator on `Result` / `AsyncResult`. It completes the
`getOr…` family (`getOrNull` / `getOrUndefined` / `getOrThrow`): it extracts `T`
from any `Result<T, E>` — not type-gated like `unwrap()` — and **throws the
modeled error as-is** on `Err` (panicking on a `Defect`, like the rest of the
family). On `AsyncResult` it returns a `Promise<T>` that rejects the same way.

This is a deliberate escape hatch off the errors-as-values model: its purpose is
to move a literal `throw` behind a method, so a `no-throw` lint rule can ban raw
throws while this one sanctioned extraction remains — the faithful, lint-clean
form of `.orElse((e) => { throw e }).unwrap()`. Prefer `match` / `recover` /
`orElse` whenever the error can stay a value.
