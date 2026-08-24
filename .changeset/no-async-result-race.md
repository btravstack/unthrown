---
"@unthrown/oxlint": minor
---

`no-async-result-race`, in the recommended preset

An `AsyncResult` is eager — constructing it starts the work — so the readable
spelling of a sequence, each step in its own `const` and chained afterwards,
is a race, and a silent one: it type-checks, returns a `Result`, and runs the
steps concurrently. The new rule flags the later construction while an earlier
sibling binding in the same statement list is still unconsumed:

```ts
const a = stepA();
const b = stepB(); // ✗ starts concurrently with `a`
return a.flatMap(() => b);
```

Chaining in one statement, consuming the earlier binding first, and the
explicit join (`allAsync([a, b])`) are exempt. Manual start-both-await-both is
reported — its sanctioned spelling is `allAsync([…])` in one statement — and a
site that wants the manual form carries a targeted `oxlint-disable` with a
reason.

Purely syntactic, like its siblings: recognised constructions are unthrown's
async producers, the `AsyncResult` companion, chains rooted in either, local
functions whose return annotation is unthrown's `AsyncResult`, and declarators
annotated with it — the annotation being the opt-in that catches a service
method call the syntax alone cannot resolve.
