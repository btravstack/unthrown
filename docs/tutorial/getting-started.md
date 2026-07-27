# Getting started

> **Tutorial.** A hands-on first lesson. Follow it top to bottom and you'll have
> written, chained, and folded your first `Result`s. We keep explanation to a
> minimum here and link out to it — the goal is to _do_, not to study.

By the end you will have a small program that parses a value and handles every
outcome as a value — with no `try`/`catch` to write. It takes about ten minutes.

## Step 1 — Install

::: code-group

```sh [pnpm]
pnpm add unthrown ts-pattern
```

```sh [npm]
npm install unthrown ts-pattern
```

```sh [yarn]
yarn add unthrown ts-pattern
```

:::

`unthrown` is ESM-first, ships dual CJS/ESM builds with full types, and has one
tiny runtime dependency, `ts-pattern` (`^5`) — a **peer** you install alongside
it, so you own the single copy that powers the error matchers (and that
`unthrown` re-exports as `match` / `P`). Use it with TypeScript in `strict`
mode.

## Step 2 — Return a failure instead of throwing

A `Result<T, E>` is either an **`Ok`** carrying a value `T`, or an **`Err`**
carrying a _modeled_ error `E`. `E` lists only the failures you _anticipate_.

Say you're parsing a user-supplied age. Two things can go wrong. Model both
instead of throwing:

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

Nothing is thrown — both outcomes come back as values. Notice the signature now
tells the whole truth: a caller can _see_ that `parseAge` may fail, and how.

## Step 3 — Transform and chain

Success combinators run only on `Ok`; an `Err` passes straight through, so you
can chain without checking at every step:

```ts
const adult = parseAge("42")
  .map((n) => n + 1) // => Ok(43)   — map: callback returns a plain value
  .flatMap((n) => (n >= 18 ? Ok(n) : Err("underage"))); // => Ok(43) — flatMap: callback returns a Result
// adult: Result<number, AgeError | "underage">  — flatMap unioned the error channels
```

The value stays wrapped in a `Result` the whole way — you extract it once, at the
edge, in Step 4. Nothing is thrown along the way.

And when a step fails, the rest of the chain is skipped:

```ts
const parsed = parseAge("x") // => Err("not_a_number")
  .map((n) => n + 1); // callback never runs — still Err("not_a_number")

if (parsed.isErr()) parsed.error; // => "not_a_number"
```

Rule of thumb: reach for `map` when your callback returns a plain value, `flatMap`
when it returns another `Result`. (The full picture is in the
[combinator reference](../reference/combinators) — you don't need it yet.)

## Step 4 — Handle every outcome with `match`

At the edge of your program, fold a `Result` into a single value with `match`.
You handle three runtime channels — `ok`, `err`, and a `defect` channel for the
_unexpected_ (you'll meet it in the next step):

```ts
const message = parseAge("-3").match({
  ok: (age) => `age is ${age}`,
  // `errCases` receives an exhaustive matcher — one branch per error. ts-pattern
  // matches plain strings too (no tag required), and a missing case won't compile.
  errCases: (matcher) =>
    matcher.with("negative", () => "must be positive").with("not_a_number", () => "not a number"),
  defect: (cause) => {
    console.error(cause); // a bug slipped through — log it, don't leak it
    return "something went wrong";
  },
});
// => "must be positive"
```

Try deleting the `.with("not_a_number", …)` branch — your editor will flag it as
a compile error. That's the point: the error channel is matched **exhaustively**,
so a new failure can never be silently ignored.

## Step 5 — Meet a defect

What happens if a callback throws by accident — a typo, a `JSON.parse` on bad
input? `unthrown` **catches it and turns it into a `Defect`**, a third state that
is _not_ part of your error type:

```ts
const result = parseAge("42").map((age) => {
  throw new Error("boom"); // an unexpected bug
});

result.isDefect(); // => true — not an Err, and not in AgeError
```

Because a thrown bug becomes a defect (never an `Err`), the single `match` from
Step 4 needs **no surrounding `try`/`catch`** — the `defect` arm catches
everything unexpected. That is the whole promise of the library: modeled failures
travel as values, and bugs are quarantined in their own channel.

## What you built

You now have a function that:

- returns its failures as typed values instead of throwing;
- chains transformations that skip automatically on failure;
- folds every outcome — success, modeled error, and unexpected bug — in one
  exhaustive `match`.

## Where to go next

- **Continue the tutorial:** [Crossing an async boundary](./crossing-an-async-boundary)
  — the same ideas, applied to promises.
- **Understand the defect channel:** [The Defect Channel](../explanation/the-defect-channel).
- **Look up a combinator:** [Combinator reference](../reference/combinators).
