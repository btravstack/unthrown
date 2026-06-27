# Comparison

How `unthrown` relates to the other errors-as-values libraries. The short
version: they all return failures as values; they differ on **whether
_unexpected_ failures get their own channel**, and on **what happens when a
callback throws**.

## At a glance

|                                    | **unthrown**                      | **neverthrow**         | **boxed**  | **effect**            | **byethrow**                        |
| ---------------------------------- | --------------------------------- | ---------------------- | ---------- | --------------------- | ----------------------------------- |
| Result representation              | discriminated union **+ methods** | class                  | class      | lazy effect           | discriminated union (plain objects) |
| API style                          | fluent **and** matchable          | fluent                 | fluent     | pipe / generators     | pipe (free functions)               |
| Defect channel (separate from `E`) | ✅ `Defect`                       | ❌                     | ❌         | ✅ `Cause.die`        | ❌                                  |
| Throw in `map`/`flatMap` callback  | **caught → `Defect`**             | propagates             | propagates | caught                | propagates¹                         |
| Async model                        | `AsyncResult` (never rejects)     | `ResultAsync`          | `Future`   | `Effect`              | `Promise<Result>` (**can reject**)  |
| Boundary forces error typing       | ✅ mandatory `qualify`            | partial²               | partial²   | ✅                    | ✅ `catch` (or `safe`)              |
| `Option` type                      | ❌ (deliberate)                   | ❌                     | ✅         | ✅                    | ❌                                  |
| Tagged errors                      | ✅ `TaggedError`                  | ❌                     | ❌         | ✅ `Data.TaggedError` | ❌                                  |
| Error accumulation                 | ❌ (deliberate)                   | `combineWithAllErrors` | ❌         | ✅                    | ✅ `collect`                        |
| Runtime dependencies (core)        | **0**                             | 0                      | 0          | a runtime             | 0                                   |

¹ byethrow's combinators don't `try/catch`; it relies on an oxlint rule
(`no-throw-in-callback`) to keep throws out of callbacks. ² They force typing at
explicit `fromPromise`/`fromThrowable`-style boundaries, but a throw inside a
later `map` is not re-qualified.

## The two differences that actually matter

### 1. A separate channel for the unexpected

Every library here models _anticipated_ failures as values. The question is what
happens to an **un**anticipated one — a `TypeError` from a typo, a thrown
non-`Error`, a bug in a callback you typed as total.

- **neverthrow, boxed, byethrow** have one failure axis. An unexpected throw
  either escapes as a real exception or, if you catch it, gets folded into `E` —
  at which point your domain error type is a lie (it now also means "some bug").
- **effect** has a real defect channel (`Cause.die`) distinct from the typed
  error — but brings a whole runtime, context, and dependency-injection system
  with it.
- **unthrown** ships _just_ that idea: a third `Defect` state that is **invisible
  to the type**. `E` stays exactly your modeled errors; a bug becomes a defect
  that short-circuits to the edge and can only be observed by `match` or
  `recoverDefect`. See [The Defect Channel](./the-defect-channel).

This is the line unthrown borrows from Effect and almost nothing else has: _your
`E` should never have to include "and also, maybe a bug."_

### 2. What happens when a `.map` callback throws

You can type a callback `(value: T) => U`, but the type system can't promise it
won't _also_ throw — `JSON.parse`, a surprise `null`, a throwing getter.

- In **neverthrow** and **byethrow**, a combinator callback is assumed total. A
  throw inside `.map`/`andThen` propagates as a real exception (byethrow leans on
  the `no-throw-in-callback` lint rule to discourage it; the runtime doesn't
  contain it). Its async result can therefore **reject**.
- In **unthrown**, a throw inside any combinator is **caught and converted to a
  `Defect`** — nothing escapes a pipeline as a raw throw, and an `AsyncResult`'s
  internal promise **never rejects**. That is the runtime guarantee that lets an
  HTTP adapter do a single `match({ ok, err, defect })` with no surrounding
  `try/catch`. See [Boundaries & Qualification](./boundaries).

A single-axis Result can only stay sound if every combinator callback is
total — and you can't guarantee that. The defect channel is what removes the
assumption.

## When another library is the better fit

This isn't a clean sweep — pick the tool for the job:

- **byethrow** — if you want a lightweight, pipe-idiomatic Result with **one**
  failure axis and don't need the defect distinction, it's an excellent, smaller,
  more mature choice. It also ships niceties unthrown deliberately omits
  (error-accumulating `collect`, lightweight `do`/`bind` notation, a Standard
  Schema adapter, an oxlint plugin).
- **neverthrow** — the established, widely-adopted class-based option; reach for
  it if ecosystem maturity outweighs the defect channel.
- **boxed** — if you specifically want an `Option` type and a broader functional
  toolkit (`Future`, `AsyncData`, `Option`, `Result`) in one package.
- **effect** — if you actually want the platform: dependency injection,
  structured concurrency, a scheduler. unthrown is what you reach for when you
  want effect's defect idea **without** adopting effect.

unthrown's bet is narrow on purpose: the modeled-vs-defect split, qualification
forced at boundaries, and a runtime that can't leak a raw throw — and nothing
else. If those three are what you want, that's the whole library.

→ Continue to [Getting Started](./getting-started).
