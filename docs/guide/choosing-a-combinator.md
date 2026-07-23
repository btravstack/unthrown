# Choosing a combinator

The method surface is small, but "which one do I reach for?" comes up constantly.
This page is the cheat sheet. Every combinator runs its callback **only on its own
channel** and turns a thrown callback into a `Defect`.

`Result` and `AsyncResult` expose the **same set of combinators** with the same
per-channel behavior, so the tables below — read _by intent_ — apply to both.
Their _signatures_ differ, though: an `AsyncResult` combinator returns an
`AsyncResult` (its eliminators a `Promise`), and its binds also accept an
`AsyncResult`. The handful of async-only rules (and how to move between the two
types) are in [Result and AsyncResult](#result-and-asyncresult) at the bottom;
for the exact per-type signatures see the API reference linked just below.

::: tip Full per-method reference
These tables are the _selection_ cheat-sheet — which combinator to reach for. For
each one's full signature and prose, see
[`ResultMethods`](/api/core/#resultmethods) (the surface every `Result` carries)
and [`AsyncResultMethods`](/api/core/#asyncresultmethods) (its async mirror) in
the API reference.
:::

## By intent

The `→ Result<…>` half of each signature is the tell — it shows how the combinator
moves the channels: `flatMap` widens `E` to `E | E2`, `recoverErr` empties it to
`never`, `flatMapErr` widens the value to `T | U`.

| I want to…                                     | use               | signature                                                    | channel |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------ | ------- |
| transform the success value                    | `map`             | `(v: T) => U` → `Result<U, E>`                               | Ok      |
| chain a `Result`-returning step                | `flatMap`         | `(v: T) => Result<U, E2>` → `Result<U, E \| E2>`             | Ok      |
| run a side effect, keep the value              | `tap`             | `(v: T) => void` → `Result<T, E>`                            | Ok      |
| run a **failable** side effect, keep the value | `flatTap`         | `(v: T) => Result<unknown, E2>` → `Result<T, E \| E2>`       | Ok      |
| sequence steps into a named scope              | `Do`/`bind`/`let` | `bind(k, (scope) => Result<U, E2>)` → `Result<{…}, E \| E2>` | Ok      |
| replace the value with a constant              | `as`              | `(value: U)` → `Result<U, E>`                                | Ok      |
| drop the value (success type becomes `void`)   | `discard`         | `()` → `Result<void, E>`                                     | Ok      |
| transform the error                            | `mapErr`          | `(e: E) => E2` → `Result<T, E2>`                             | Err     |
| try a fallback that returns a `Result`         | `flatMapErr`      | `(e: E) => Result<U, E2>` → `Result<T \| U, E2>`             | Err     |
| turn an error into a success value             | `recoverErr`      | `(e: E) => U` → `Result<T \| U, never>`                      | Err     |
| run a side effect on the error                 | `tapErr`          | `(e: E) => void` → `Result<T, E>`                            | Err     |
| run a **failable** side effect on the error    | `flatTapErr`      | `(e: E) => Result<unknown, E2>` → `Result<T, E \| E2>`       | Err     |
| recover from a defect (rare)                   | `recoverDefect`   | `(cause) => Result<U, E2>` → `Result<T \| U, E \| E2>`       | Defect  |
| observe a defect, e.g. log it                  | `tapDefect`       | `(cause) => void` → `Result<T, E>`                           | Defect  |
| handle all three channels at the edge          | `match`           | `{ ok, err, defect }` → `R`                                  | all     |
| combine an array of `Result`s                  | `all`             | `Result<T, E>[]` → `Result<T[], E>`                          | —       |
| combine a record of `Result`s                  | `allFromDict`     | `{ [k]: Result<T, E> }` → `Result<{ [k]: T }, E>`            | —       |

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
| `flatMapErr`            | passes ▸ | runs `f`        | passes ▸    | `E2`            |
| `recoverErr`            | passes ▸ | runs `f` → `Ok` | passes ▸    | `never`         |
| `tapErr` / `flatTapErr` | passes ▸ | runs `f`        | passes ▸    | `E` / `E \| E2` |
| `recoverDefect`         | passes ▸ | passes ▸        | runs `f`    | `E \| E2`       |
| `tapDefect`             | passes ▸ | passes ▸        | runs `f`    | `E`             |
| `match`                 | `ok()`   | `err()`         | `defect()`  | —               |

::: tip `recoverErr`'s `never` under-describes the runtime
`recoverErr` empties only the **error** channel to `never` — a `Defect` can still be
present at runtime and flows past it untouched. See
[The Defect Channel](./the-defect-channel).
:::

## Result and AsyncResult

Every combinator above exists on **both** `Result` and `AsyncResult` — same names,
same channel behavior. `AsyncResult` (what you get from `fromPromise` /
`fromSafePromise`, or by lifting a sync `Result` with `.toAsync()`) differs in
exactly three ways:

- **Callbacks stay synchronous.** A raw `Promise` may never enter a combinator —
  that would skip qualification and silently become a defect. Do async work by
  re-entering a boundary and composing it with `flatMap`.
- **The `Result`-returning combinators accept `Result` _or_ `AsyncResult`.**
  `flatMap`, `flatTap`, `flatMapErr`, `flatTapErr`, `bind`, and `recoverDefect` take a
  callback returning either, so you can freely mix sync and async steps in one
  chain.
- **Eliminators return a `Promise`.** `await result.match({ … })` /
  `await result.get()` — or `await` the `AsyncResult` first to collapse it to a
  `Result`, then match synchronously.

Use this table to move between the two:

| I have… and want to…                      | use                                                   |
| ----------------------------------------- | ----------------------------------------------------- |
| build an `AsyncResult` from a value/error | `OkAsync(v)` / `ErrAsync(e)` (no `Ok(v).toAsync()`)   |
| lift a sync `Result` into async           | `result.toAsync()` → `AsyncResult`                    |
| collapse an `AsyncResult` to a `Result`   | `await asyncResult`                                   |
| add an **async** step mid-chain           | `.flatMap((v) => fromPromise(work(v), qualify))`      |
| add a **sync** step to an async chain     | `.flatMap((v) => Ok(v + 1))` — a `Result` is accepted |
| combine async results                     | `allAsync` / `allFromDictAsync`                       |

```ts
// A chain that crosses an async boundary stays an AsyncResult to the end.
const status = await findUser(id) // Result<User, NotFound>  (sync)
  .toAsync() // AsyncResult<User, NotFound>
  .flatMap((user) => fromPromise(loadOrders(user.id), qualify)) // async step
  .map((orders) => orders.length) // sync callback, still AsyncResult
  .match({ ok: (n) => n, err: () => 0, defect: () => -1 }); // await collapses it
```

Once a chain crosses an async boundary it stays an `AsyncResult`; `await` at the
edge turns it back into a `Result` you can `match`. See
[Async Results](./async-results) for the full rules.

## The pairs that are easy to confuse

**`map` vs `flatMap`** — does your callback return a plain value or a `Result`?
A `(value) => U` is `map`; a `(value) => Result<U, E2>` is `flatMap` (otherwise
you nest a `Result<Result<…>>`).

**`flatMap` vs `flatTap`** — both take a `Result`-returning callback. `flatMap`
**replaces** the value with the callback's; `flatTap` **discards** it and keeps
the original (a validation or write whose _outcome_ matters but whose _value_
you don't need). `tapErr`/`flatTapErr` are the same pair on the error channel.

**`tap` vs `flatTap`** — decided by what the _effect_ returns, not by what you do
with its value (both keep the original). An effect that cannot fail — logging, a
metric — is `tap`; an effect that returns a `Result`/`AsyncResult` **must** be
sequenced with `flatTap` on the matching surface, because a `tap` callback cannot
thread it. `tapErr`/`flatTapErr` split the same way on the error channel.

::: warning A failable effect inside `tap` is silently dropped
`tap` ignores its callback's return value, so the effect's outcome is lost — in
one of two shapes:

- a **sync `Result`** returned from the callback compiles (a `Result` is not a
  thenable), but its `Err` is silently discarded;
- an **`AsyncResult`** is rejected at compile time (it is awaitable, so
  `NotThenable` catches it) — and the tempting "fix" of wrapping the call in
  braces compiles, but leaves the effect **floating**: never awaited, its
  `Err`/`Defect` unobserved.

```ts
.tap((user) => {
  auditLog.record(user); // AsyncResult — floats, never awaited
})
```

Sequence the effect instead. A `Result`-returning effect goes in `flatTap` on
either surface; an `AsyncResult`-returning one only in the **async** `flatTap` —
the sync one takes only a `Result`, so lift a still-sync chain with `.toAsync()`
first ([Result and AsyncResult](#result-and-asyncresult)). A raw `Promise` gets
qualified through `fromPromise` / `fromSafePromise` before either. Here the
chain is already an `AsyncResult`, so `flatTap` takes the effect directly, awaits
it, and short-circuits on its failure:

```ts
.flatTap((user) => auditLog.record(user))
```

If a fire-and-forget is deliberate, say so in a comment at the call site —
otherwise the same effect ends up `tap`ped at one site and `flatTap`ped at
another, and a reviewer has to guess which one is the bug.
:::

**`flatMapErr` vs `recoverErr`** — both run on `Err`. `recoverErr` produces a plain success
value (emptying the error channel to `never`); `flatMapErr` produces another `Result`
(which may still be an `Err`).

**`recoverErr` vs `recoverDefect`** — `recoverErr` handles a modeled `Err`;
`recoverDefect` is the **only** combinator that can touch a `Defect`. Neither is
the other's fallback — a defect flows past `recoverErr` untouched.

## When to leave the pipeline

Reach for an eliminator once you're done chaining:

- `match` — the default at the edge; fold all three channels into one value.
- `get` / `getErr` — extract; type-gated to compile only when the
  opposite channel is `never` (`get` needs `Result<T, never>`, `getErr`
  needs `Result<never, E>`), and _panicking_ (rethrowing the cause) on a defect.
- `getOr` / `getOrElse` / `getOrNull` / `getOrUndefined` — recover an `Err`
  to a fallback, but **re-throw a defect** (it's a bug, not an absent value).
- `getOrThrow` — extract `T`, but **throw the modeled error as-is** on `Err`
  (panicking on a defect). A deliberate escape hatch off errors-as-values: its
  point is to move a literal `throw` behind a method so a `no-throw` lint rule can
  ban raw throws. Prefer `match` / `recoverErr` / `flatMapErr` when the error can stay a
  value.

On an `AsyncResult` every eliminator returns a `Promise` — `await` it (an `Err` or
`Defect` still throws/rejects, exactly as above).

→ Continue to [Recipes](./recipes).
