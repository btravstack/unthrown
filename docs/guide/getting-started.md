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
a _modeled_ error `E`. `E` lists only the failures you _anticipate_.

Say you're parsing a user-supplied age. Two things can go wrong, and you want to
model both instead of throwing:

```ts
import { Ok, Err, type Result } from "unthrown";

type AgeError = "not_a_number" | "negative";

function parseAge(input: string): Result<number, AgeError> {
  const n = Number(input);
  if (Number.isNaN(n)) return Err("not_a_number");
  if (n < 0) return Err("negative");
  return Ok(n);
}

parseAge("42"); // => Ok(42)
parseAge("-3"); // => Err("negative")
parseAge("x"); // => Err("not_a_number")
```

Nothing is thrown — both outcomes come back as values you can inspect.

## Transform and chain

Success combinators run only on `Ok`; an `Err` passes straight through, so you
can chain without checking at every step:

```ts
parseAge("42")
  .map((n) => n + 1) // => Ok(43)   — map: callback returns a plain value
  .flatMap((n) => (n >= 18 ? Ok(n) : Err("negative"))) // => Ok(43) — flatMap: callback returns a Result
  .unwrap(); // => 43
```

```ts
parseAge("x") // => Err("not_a_number")
  .map((n) => n + 1) // callback never runs — still Err("not_a_number")
  .unwrapErr(); // => "not_a_number"
```

Reach for `map` when your callback returns a plain value, `flatMap` when it
returns another `Result`. The [Choosing a Combinator](./choosing-a-combinator)
cheat sheet has the full picture.

## Handle every outcome

At the edge of your program, fold a `Result` into a single value with `match`.
You handle all three runtime channels — `ok`, `err`, and the `defect` channel for
the _unexpected_ (covered next):

```ts
const message = parseAge(input).match({
  ok: (age) => `age is ${age}`,
  err: (e) => (e === "negative" ? "must be positive" : "not a number"),
  defect: (cause) => {
    logger.error(cause); // a bug slipped through — log it, don't leak it
    return "something went wrong";
  },
});
```

Because a thrown bug inside any combinator becomes a `defect` (never an `Err`),
this single `match` at the edge needs no surrounding `try`/`catch`.

→ Continue to [Core Concepts](./core-concepts).
