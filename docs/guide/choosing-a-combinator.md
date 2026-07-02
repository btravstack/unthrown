# Choosing a combinator

The method surface is small, but "which one do I reach for?" comes up constantly.
This page is the cheat sheet. Every combinator runs its callback **only on its own
channel** and turns a thrown callback into a `Defect`.

## By intent

The `→ Result<…>` half of each signature is the tell — it shows how the combinator
moves the channels: `flatMap` widens `E` to `E | E2`, `recover` empties it to
`never`, `orElse` widens the value to `T | U`.

| I want to…                                     | use               | signature                                                    | channel |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------ | ------- |
| transform the success value                    | `map`             | `(v: T) => U` → `Result<U, E>`                               | Ok      |
| chain a `Result`-returning step                | `flatMap`         | `(v: T) => Result<U, E2>` → `Result<U, E \| E2>`             | Ok      |
| run a side effect, keep the value              | `tap`             | `(v: T) => void` → `Result<T, E>`                            | Ok      |
| run a **failable** side effect, keep the value | `flatTap`         | `(v: T) => Result<unknown, E2>` → `Result<T, E \| E2>`       | Ok      |
| sequence steps into a named scope              | `Do`/`bind`/`let` | `bind(k, (scope) => Result<U, E2>)` → `Result<{…}, E \| E2>` | Ok      |
| replace the value with a constant              | `as`              | `(value: U)` → `Result<U, E>`                                | Ok      |
| transform the error                            | `mapErr`          | `(e: E) => E2` → `Result<T, E2>`                             | Err     |
| try a fallback that returns a `Result`         | `orElse`          | `(e: E) => Result<U, E2>` → `Result<T \| U, E2>`             | Err     |
| turn an error into a success value             | `recover`         | `(e: E) => U` → `Result<T \| U, never>`                      | Err     |
| run a side effect on the error                 | `tapErr`          | `(e: E) => void` → `Result<T, E>`                            | Err     |
| run a **failable** side effect on the error    | `flatTapErr`      | `(e: E) => Result<unknown, E2>` → `Result<T, E \| E2>`       | Err     |
| recover from a defect (rare)                   | `recoverDefect`   | `(cause) => Result<U, E2>` → `Result<T \| U, E \| E2>`       | Defect  |
| observe a defect, e.g. log it                  | `tapDefect`       | `(cause) => void` → `Result<T, E>`                           | Defect  |
| handle all three channels at the edge          | `match`           | `{ ok, err, defect }` → `R`                                  | all     |
| combine many `Result`s                         | `all`             | `Result<T, E>[]` → `Result<T[], E>`                          | —       |

## Behavior at a glance

A combinator touches **only its own channel**; the other two flow through
untouched. This grid is the whole story — notice the `Defect` column is
"passes ▸" everywhere except `recoverDefect` and `match`, which is the one
invariant to remember:

| method                  | on `Ok`  | on `Err`        | on `Defect` | resulting `E`   |
| ----------------------- | -------- | --------------- | ----------- | --------------- |
| `map`                   | runs `f` | passes ▸        | passes ▸    | `E`             |
| `flatMap`               | runs `f` | passes ▸        | passes ▸    | `E \| E2`       |
| `tap` / `flatTap`       | runs `f` | passes ▸        | passes ▸    | `E` / `E \| E2` |
| `mapErr`                | passes ▸ | runs `f`        | passes ▸    | `E2`            |
| `orElse`                | passes ▸ | runs `f`        | passes ▸    | `E2`            |
| `recover`               | passes ▸ | runs `f` → `Ok` | passes ▸    | `never`         |
| `tapErr` / `flatTapErr` | passes ▸ | runs `f`        | passes ▸    | `E` / `E \| E2` |
| `recoverDefect`         | passes ▸ | passes ▸        | runs `f`    | `E \| E2`       |
| `tapDefect`             | passes ▸ | passes ▸        | runs `f`    | `E`             |
| `match`                 | `ok()`   | `err()`         | `defect()`  | —               |

::: tip `recover`'s `never` under-describes the runtime
`recover` empties only the **error** channel to `never` — a `Defect` can still be
present at runtime and flows past it untouched. See
[The Defect Channel](./the-defect-channel).
:::

## The pairs that are easy to confuse

**`map` vs `flatMap`** — does your callback return a plain value or a `Result`?
A `(value) => U` is `map`; a `(value) => Result<U, E2>` is `flatMap` (otherwise
you nest a `Result<Result<…>>`).

**`flatMap` vs `flatTap`** — both take a `Result`-returning callback. `flatMap`
**replaces** the value with the callback's; `flatTap` **discards** it and keeps
the original (a validation or write whose _outcome_ matters but whose _value_
you don't need). `tapErr`/`flatTapErr` are the same pair on the error channel.

**`orElse` vs `recover`** — both run on `Err`. `recover` produces a plain success
value (emptying the error channel to `never`); `orElse` produces another `Result`
(which may still be an `Err`).

**`recover` vs `recoverDefect`** — `recover` handles a modeled `Err`;
`recoverDefect` is the **only** combinator that can touch a `Defect`. Neither is
the other's fallback — a defect flows past `recover` untouched.

## When to leave the pipeline

Reach for an eliminator once you're done chaining:

- `match` — the default at the edge; fold all three channels into one value.
- `unwrap` / `unwrapErr` — extract, throwing on the wrong variant (and
  _panicking_ on a defect).
- `unwrapOr` / `unwrapOrElse` / `getOrNull` / `getOrUndefined` — recover an `Err`
  to a fallback, but **re-throw a defect** (it's a bug, not an absent value).

→ Continue to [Recipes](./recipes).
