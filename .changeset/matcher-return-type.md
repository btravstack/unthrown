---
"unthrown": minor
---

Add `returnType<R>()` to the built-in matcher — declare a match's output type once, and every branch is checked against it.

Called directly after the matcher is handed to you, it pins the result: the match evaluates to `R` instead of the union of the branch returns, a branch that drifts off-spec fails **on that branch** rather than downstream, and branch returns get a contextual type. It reaches every surface that hands out a matcher — the five `*ErrCases` combinators (sync and async), `match`'s `errCases` handler, and standalone `match(value)`.

```ts
const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
  result.mapErrCases((matcher) =>
    matcher.returnType<ApiError>().with(P._, (error) => new ApiError({ status: 500, error })),
  );
```

The motivating case is code whose output type is decided by a signature rather than by the branches — a typed HTTP layer folding its error channel into a route's declared response union, or any helper generic in `E`. The injected `defect` helper stays legal under a pin, and exhaustiveness is unaffected. Restores the one ts-pattern feature worth keeping after the built-in matcher replaced that dependency; the runtime is a no-op, as it was there.

Closes #152.
