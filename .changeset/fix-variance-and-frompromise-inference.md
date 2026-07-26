---
"unthrown": patch
---

**Fix: two v5 inference regressions — generic-union error widening, and
`fromPromise` with an inline `.then` chain.** No runtime change; no consumer
workarounds needed anymore.

- **A concrete `Err`/`Ok` again widens into a generic error union.** In generic
  code, `return Err(concreteError)` where the declared error is an unresolved
  union (`G | RuntimeError`, a conditional, …) failed to compile on v5 — the
  variant views and `AsyncResult` were intersection aliases, whose variance TS
  measures structurally (where the exhaustive matcher makes `E` invariant),
  silently losing the declared `out` covariance. They are now
  `interface … extends` types carrying **verified** `out T, out E` annotations,
  restoring the v4 behavior (`Err<TheUnion>(x)` workarounds can be removed).
- **`fromPromise(Promise.resolve().then(() => x), qualify)` again infers `T`.**
  The async-qualify ban's `R & NotThenable<R>` on qualify's return made TS defer
  inference and collapse `T` to `unknown` for an inline `.then` chain argument.
  The ban is now a phantom rest-tuple guard — an async qualify still fails to
  compile (with the message), an always-throwing qualify stays legal, and `T`
  infers normally.

Both guarded by new `types.test-d.ts` regression assertions.
