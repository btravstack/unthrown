---
"@unthrown/oxlint": minor
---

Add a sixth rule, `unthrown/prefer-ensure` — flags a `flatMap` whose success
branch returns its own parameter untouched (`flatMap((x) => c ? Ok(x) : Err(e))`),
a predicate wearing a bind costume. `ensure` names the intent and passes the
_same_ `Ok` through where the `flatMap` form allocates a fresh one on every
success (#166).

Anchored on the constructors rather than the method name: the `Ok(...)` /
`Err(...)` calls must resolve to `unthrown` imports (`OkAsync` / `ErrAsync` and
the facade members `Result.Ok(...)` / `AsyncResult.Err(...)` included). It reads
the callback's **return positions** and requires every one of them to be a
constructor call, so a wrapped branch (`return wrap(c ? Ok(x) : Err(e))`) or a
fall-through (`if (!x.ok) return Err(e); return refresh(x)`) is left alone. It
stays quiet on a success branch that builds a new value, a destructured
parameter, a body with no failure branch, a constructor nested in another
callback, and a **reassigned** parameter — the one real false positive the shape
admits, since the value reaching `Ok` is then not the one `ensure` would pass
through.

Report-only, and **opt-in** (not in the `recommended` preset). No autofix: a
reversed ternary needs its condition negated, and `ensure`'s boolean form
requires a `boolean` predicate where a truthiness guard is a perfectly good
`flatMap` condition. And unlike every preset rule, the shape it flags violates no
thesis — it is correct code with a better name available.
