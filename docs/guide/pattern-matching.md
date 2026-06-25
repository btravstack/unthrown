# Pattern Matching

For the everyday exhaustive case, [`matchTags`](./tagged-errors) is all you need.
When you want richer matching — guards, nested patterns, wildcards, `P.union` —
`@unthrown/pattern` is a thin bridge to
[ts-pattern](https://github.com/gvergnaud/ts-pattern).

## Installation

::: code-group

```sh [pnpm]
pnpm add @unthrown/pattern ts-pattern
```

```sh [npm]
npm install @unthrown/pattern ts-pattern
```

:::

`ts-pattern` is a peer dependency. The integration is deliberately small — the
matching power is ts-pattern's.

## `toMatchable` — expose the channels

A `Result` hides its internal state, so you can't pattern-match it directly.
`toMatchable` adapts a `Result` into a discriminated union that ts-pattern can
match, exposing the ok / err / defect channels under a `_kind` discriminant:

```ts
import { match } from "ts-pattern";
import { toMatchable, tag } from "@unthrown/pattern";

const status = match(toMatchable(result))
  .with({ _kind: "Ok" }, ({ value }) => 200)
  .with({ _kind: "Err" }, ({ error }) => 400)
  .with({ _kind: "Defect" }, ({ cause }) => 500)
  .exhaustive();
```

The `_kind` discriminant is distinct from any `_tag` on an error value, so the
two never collide in nested patterns.

## `tag` — match a tagged error

`tag(t)` is sugar for the `{ _tag: t }` pattern. Nested inside an `Err` pattern,
it narrows to the matching [`TaggedError`](./tagged-errors) variant — including
its payload:

```ts
match(toMatchable(result))
  .with({ _kind: "Ok" }, ({ value }) => `ok: ${value}`)
  .with({ _kind: "Err", error: tag("NotFound") }, () => "404")
  .with({ _kind: "Err", error: tag("Forbidden") }, ({ error }) => `403 ${error.user}`)
  .with({ _kind: "Defect" }, () => "500")
  .exhaustive();
```

In the `Forbidden` branch, `error` is narrowed to the full `Forbidden` variant,
so `error.user` type-checks.

## Which should I use?

- **`matchTags`** (core) — the everyday exhaustive fold over a tagged error
  union. Zero dependencies, no `.exhaustive()` to forget.
- **`@unthrown/pattern` + ts-pattern** — when you need guards, nested matching on
  payloads, wildcards, or to match on the success value's shape.
