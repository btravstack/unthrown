---
"@unthrown/oxlint": minor
---

`unthrown/prefer-pre-lifted`: ban `.toAsync()` on a freshly constructed
`Ok(...)` / `Err(...)`.

```ts
Ok(value).toAsync(); // → OkAsync(value)
Err(error).toAsync(); // → ErrAsync(error)
Ok().toAsync(); // → OkAsync()
Ok(undefined).toAsync(); // → OkAsync()
```

**The receiver is the whole test**, which is what makes this rule safe where
`prefer-ensure` was not. `prefer-ensure` had to decide whether an `Ok(x)` inside
a callback carried the same `x` the callback was handed — an identity judgement
across a scope, and the source of its false positives. Here the question is
syntactic: a call to the imported `Ok` or `Err`, immediately followed by
`.toAsync()`. So `.toAsync()` on a `Result` that already exists — a variable, a
call's return, a ternary, `fromNullable(...)` — is the combinator doing its
actual job and is never reported.

Autofixable for the same reason: the pre-lifted name with the arguments
untouched, `Ok()` and `Ok(undefined)` both collapsing to `OkAsync()`, and the
specifier added to the existing `unthrown` import when the name is free.

**Opt-in**, beside `no-throw` and `no-get-or-throw` — a spelling preference, not
a thesis about correctness. It is a rule rather than a convention because that
is the profile only a linter holds: `btravstack/btravstack` documented this
convention, asserted one violation, and a sweep found thirty-three. It
type-checks, tests stay green, and it is invisible in review.

This repository now enables it too, and the autofix cleaned 21 sites across
`packages/boxed`, `packages/effect` and four examples.

Closes #260.
