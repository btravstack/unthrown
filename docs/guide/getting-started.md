# Getting Started

## Installation

::: code-group

```sh [pnpm]
pnpm add unthrown
```

```sh [npm]
npm install unthrown
```

```sh [yarn]
yarn add unthrown
```

:::

`unthrown` is ESM-first, ships dual CJS/ESM builds with full type definitions,
and has **zero runtime dependencies**. It targets TypeScript with `strict` mode.

## Your first Result

A `Result<T, E>` is either an **Ok** carrying a value `T`, or an **Err** carrying
a _modeled_ error `E`. Build them with `ok` and `err`:

```ts
import { ok, err, type Result } from "unthrown";

function half(n: number): Result<number, "odd"> {
  return n % 2 === 0 ? ok(n / 2) : err("odd");
}
```

`E` lists only the failures you _anticipate_. Here, the only modeled failure is
the literal `"odd"`.

## Transform and chain

The success combinators run only on `Ok`; an `Err` passes straight through:

```ts
half(10)
  .map((n) => n + 1) // Ok(6)
  .flatMap((n) => half(n)) // Ok(3)
  .unwrap(); // 3
```

```ts
half(7) // Err("odd")
  .map((n) => n + 1) // still Err("odd") — callback never runs
  .unwrapErr(); // "odd"
```

## Handle every outcome

At the edge of your program, fold a `Result` into a single value with `match`.
You must handle all three runtime channels — `ok`, `err`, and `defect`:

```ts
const message = half(7).match({
  ok: (n) => `got ${n}`,
  err: (e) => `failed: ${e}`,
  defect: (cause) => `bug: ${String(cause)}`,
});
```

The third channel, `defect`, is for the _unexpected_ — covered next.

→ Continue to [Core Concepts](./core-concepts).
