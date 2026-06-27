---
"unthrown": minor
---

Add **do-notation**: `Do()` plus the `bind` / `let` methods on `Result` and
`AsyncResult`, for sequencing dependent steps into a named scope without nested
`flatMap` closures.

```ts
Do()
  .bind("user", () => findUser(id)) // Result<User, NotFound>
  .bind("org", ({ user }) => findOrg(user.orgId)) // Result<Org, NotFound>
  .let("label", ({ user, org }) => `${user.name} @ ${org.name}`)
  .map(({ user, org, label }) => render(user, org, label));
// Result<View, NotFound>
```

`bind(name, f)` sequences a `Result`-returning step and binds its value under
`name` in an accumulating **readonly** object scope (error types union); `let`
binds a pure value. On `AsyncResult`, `bind` accepts a `Result` or an
`AsyncResult`. A throw in either becomes a `Defect`, and `Err`/`Defect`
short-circuits — same guarantees as every other combinator. (`Do` is capitalised
because `do` is reserved; lift a sync chain with `toAsync()` to go async.)

This is the fluent do-notation only; generator (`gen`/`safeTry`) style remains
out of scope.
