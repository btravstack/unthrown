---
"unthrown": patch
---

`NotThenable` now rejects a **sometimes**-async callback, not just an always-async
one.

It was spelled `[R] extends [PromiseLike<unknown>]`, which is false for a partial
union — so a callback that returns a promise on only one branch compiled on every
guarded surface:

```ts
result.tap(() => (flag ? 1 : work())); // used to compile
```

That is still an unawaited effect whose rejection the pipeline never sees, which
is exactly what the ban exists to prevent. Spelling it with `Extract` closes it —
the same reasoning `fromPromise`'s async-qualify guard already used, and which
this type never picked up.

Affects `map`, `tap`, `let`, `tapDefect`, `tapFailure` and `ensure`'s `onFail`. An
always-async callback was already rejected and is unchanged; a purely synchronous
one is unaffected.
