---
"unthrown": major
---

**The extractor family is spelled only `get…`, and `getOrThrow` is now gated.**

The deprecated `unwrap*` aliases are **removed** — `unwrap`, `unwrapErr`,
`unwrapOr`, `unwrapOrElse` (they were runtime-identical delegates). Rename to
their replacements:

```ts
result.unwrap(); // → result.get()
result.unwrapErr(); // → result.getErr()
result.unwrapOr(v); // → result.getOr(v)
result.unwrapOrElse(f); // → result.getOrElse(f)
```

**`getOrThrow` is now type-gated as the complement of `get`.** It compiles only
when the error channel is **non-empty** (`E` is not `never`) — there must be a
modeled error for it to throw. On a `Result<T, never>` there is nothing to
throw, so use `get()` (which gates the other way). Together they partition
extraction by the error channel's state:

```ts
declare const fallible: Result<number, "e">;
declare const total: Result<number, never>;

fallible.getOrThrow(); // ok — throws "e" on Err
fallible.get(); // ✗ compile error — error channel not empty
total.get(); // ok
total.getOrThrow(); // ✗ compile error — nothing to throw; use get()
```

Also: `allAsync` / `allFromDictAsync` now adopt each input defensively, so a
cast/untyped rejecting thenable becomes a `Defect` rather than rejecting the
internal promise (upholding "an `AsyncResult`'s internal promise never rejects"
even for out-of-contract input). And `UnwrapError`'s message no longer says
"unwrap".
