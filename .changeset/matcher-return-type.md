---
"unthrown": minor
---

Add `returnType<R>()` to the built-in matcher — declare a match's output type
once, and every branch is checked against it.

Called before any arm has produced an output — in practice directly after the
matcher is handed to you — it pins the result: the match evaluates to `R`
instead of the union of the branch returns, a branch that drifts off-spec fails
**on that branch** rather than downstream, and branch returns get a contextual
type. It reaches every surface that hands out a matcher — the five `*ErrCases`
combinators (sync and async), `match`'s `errCases` handler, and standalone
`match(value)`.

```ts
const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
  result.mapErrCases((matcher) =>
    matcher.returnType<ApiError>().with(P._, (error) => new ApiError({ status: 500, error })),
  );
```

The motivating case is code whose output type is decided by a signature rather
than by the branches — a typed HTTP layer folding its error channel into a
route's declared response union, or any helper generic in `E`. The injected
`defect` helper stays legal under a pin, and exhaustiveness is unaffected.
Restores the one ts-pattern feature worth keeping after the built-in matcher
replaced that dependency; the runtime is a no-op, as it was there.

A pin is also the only way to write a `defect(…)` branch in `flatTapErrCases`
(unpinned, that combinator's constraint rejects the marker). Such a branch now
behaves like the `throw` it is the expression-position form of: the resulting
`Defect` carries an `AggregateError` of `[the branch's cause, the observed
error]`, so observing a failure still never destroys it.

`tapErrCases` is fixed to match, and that one is a behaviour change **outside**
any pin: a `defect(…)` branch there always compiled and was then silently
thrown away, so the pipeline carried on with the original `Err` while a `throw`
in the very same branch produced a `Defect`. It now takes the throw route too —
the same `AggregateError` of `[the branch's cause, the observed error]`.
Ordinary branch values are still discarded; the marker never was one. Across
all five `*ErrCases` combinators, `defect(…)` is now uniformly the
expression-position form of a `throw`.

Closes #152.
