---
"unthrown": major
---

**The error-matcher combinators are renamed with a `*Cases` suffix.** `mapErr`,
`flatMapErr`, `recoverErr`, `tapErr`, and `flatTapErr` become `mapErrCases`,
`flatMapErrCases`, `recoverErrCases`, `tapErrCases`, and `flatTapErrCases`.

Each takes a ts-pattern matcher over the error's _cases_, not the error value —
so the suffix names that protocol and keeps it distinct from the value-taking
success surface (`map` / `tap`). A bare `mapErr((e) => …)` would promise a
functor-style callback the combinators never accept; there is deliberately no
such variant.

Migration is a rename at every call site:

```diff
- result.mapErr((m) => m.with(P._, wrap))
+ result.mapErrCases((m) => m.with(P._, wrap))
```

`match`'s `err` handler and the `getErr` extractor are unchanged — they are not
matcher combinators.
