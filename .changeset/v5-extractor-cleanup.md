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

**`UnwrapError` is renamed to `GetError`** — it is what the `get…` extractors
throw on a wrong-variant access, so it now lives in the `get` register (its
message no longer says "unwrap" either). It is unreachable through well-typed
code (only a cast or JS caller reaches it), so most callers never name it; those
that `instanceof`/`catch` it do a one-line rename.

Also: the aggregates are hardened against out-of-contract input (only reachable
via untyped/cast code). `allAsync` / `allFromDictAsync` adopt each input
defensively (a rejecting thenable becomes a `Defect` instead of rejecting the
internal promise), and all four aggregates now surface a non-`Result` element (a
hole/`undefined`) as a `Defect` rather than throwing on `.tag` (sync) or
rejecting (async) — upholding "an `AsyncResult`'s internal promise never rejects"
for every input.
