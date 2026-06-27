# Linting

[`@unthrown/oxlint`](https://github.com/btravstack/unthrown/tree/main/packages/oxlint)
is an [oxlint](https://oxc.rs/docs/guide/usage/linter) plugin that turns two of
unthrown's theses into automated checks. The library can't make the type system
forbid a lazy `E` on its own — a lint rule can.

```sh
pnpm add -D @unthrown/oxlint oxlint
```

## Rules

### `unthrown/no-ambiguous-error-type`

The `E` in `Result<T, E>` / `AsyncResult<T, E>` should name the **anticipated**
domain failures ([Thesis #1](./why-unthrown#the-gap-unexpected-failures)) — not
"anything went wrong". This flags the catch-all error types:

```ts
import type { Result } from "unthrown";

type A = Result<User, unknown>; // ✗ flagged
type B = Result<User, Error>; // ✗ flagged
type C = Result<User, {}>; // ✗ flagged

type D = Result<User, NotFound>; // ✓
type E = Result<User, "not_found" | "denied">; // ✓
type F = Result<User, never>; // ✓ — an intentionally error-free result
```

The whole point of the defect channel is that bugs **don't** belong in `E`; this
rule keeps them out.

### `unthrown/prefer-async-result`

Prefer `AsyncResult<T, E>` over `Promise<Result<T, E>>`. A raw `Promise<Result>`
can still **reject**, reintroducing the throw channel that `AsyncResult` is
designed to eliminate. Autofixable.

```ts
type Slow = Promise<Result<User, NotFound>>; // ✗ → AsyncResult<User, NotFound>
```

Both rules resolve where `Result` / `AsyncResult` were imported from, so they
only fire on unthrown's types — a `Result` from another library is ignored.

## Setup

Register the plugin and turn its rules on in your `.oxlintrc.json`:

```json
{
  "jsPlugins": [{ "name": "unthrown", "specifier": "@unthrown/oxlint" }],
  "rules": {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/prefer-async-result": "error"
  }
}
```

The default export also exposes a `recommended` preset — an oxlint config that
registers the plugin and enables both rules — for setups that build their config
programmatically (`import unthrown from "@unthrown/oxlint"` →
`unthrown.recommended`).

`oxlint` is a peer dependency; JS plugins require oxlint ≥ 1.69.
