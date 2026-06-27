# Choosing a combinator

The method surface is small, but "which one do I reach for?" comes up constantly.
This page is the cheat sheet. Every combinator runs its callback **only on its own
channel** and turns a thrown callback into a `Defect`.

## By intent

| I want to…                                     | use                | channel |
| ---------------------------------------------- | ------------------ | ------- |
| transform the success value                    | `map`              | Ok      |
| run a dependent, `Result`-returning step       | `flatMap`          | Ok      |
| run a side effect, keep the value              | `tap`              | Ok      |
| run a **failable** side effect, keep the value | `flatTap`          | Ok      |
| replace the value with a constant              | `as`               | Ok      |
| transform the error                            | `mapErr`           | Err     |
| try a fallback that returns a `Result`         | `orElse`           | Err     |
| turn an error into a success value             | `recover`          | Err     |
| run a side effect on the error                 | `tapErr`           | Err     |
| recover from a defect (rare)                   | `recoverDefect`    | Defect  |
| observe a defect, e.g. log it                  | `tapDefect`        | Defect  |
| handle all three channels at the edge          | `match`            | all     |
| combine many `Result`s                         | `all` / `allAsync` | —       |

## The pairs that are easy to confuse

**`map` vs `flatMap`** — does your callback return a plain value or a `Result`?
A `(value) => U` is `map`; a `(value) => Result<U, E2>` is `flatMap` (otherwise
you get a nested `Result<Result<…>>`).

**`tap` vs `flatTap`** — both keep the original value. `tap` takes a `void`
callback that can't fail; `flatTap` takes a `Result`-returning one and threads
its error (a validation or write whose _outcome_ matters but whose _value_ you
don't need).

**`flatMap` vs `flatTap`** — both take a `Result`-returning callback. `flatMap`
**replaces** the value with the callback's; `flatTap` **discards** the callback's
value and keeps the original.

**`orElse` vs `recover`** — both run on `Err`. `recover` produces a plain success
value (emptying the error channel to `never`); `orElse` produces another
`Result` (which may still be an `Err`).

**`recover` vs `recoverDefect`** — `recover` handles a modeled `Err`;
`recoverDefect` is the **only** combinator that can touch a `Defect`. Neither is
the other's fallback: a defect flows past `recover` untouched.

## When to leave the pipeline

Reach for an eliminator once you're done chaining:

- `match` — the default at the edge; fold all three channels into one value.
- `unwrap` / `unwrapErr` — extract, throwing on the wrong variant (and
  _panicking_ on a defect).
- `unwrapOr` / `unwrapOrElse` / `getOrNull` / `getOrUndefined` — recover an `Err`
  to a fallback, but **re-throw a defect** (it's a bug, not an absent value).

→ Continue to [Recipes](./recipes).
