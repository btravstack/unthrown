# The async model

> **Explanation.** This page explains the design of `AsyncResult` — why it never
> rejects and why its callbacks are synchronous. For the tasks (lifting,
> composing, awaiting) see [Crossing an async
> boundary](../tutorial/crossing-an-async-boundary) and the
> [combinator reference](../reference/combinators#result-and-asyncresult).

An `AsyncResult<T, E>` is the asynchronous counterpart of `Result<T, E>`. It has
the **same method surface**, and `await`-ing it collapses it to a `Result`. Two
design choices make it behave the way it does, and both fall out of the same
principle: **failure must stay triaged**.

## It is `Awaitable`, not `PromiseLike`

An `AsyncResult`'s internal promise **never rejects**. Every rejection or thrown
value is captured as an `Err` (via `qualify`) or a `Defect`, so `await`-ing one
always yields a `Result` and never throws.

Because of that, it is typed as a success-only `Awaitable<Result<T, E>>` rather
than a full `PromiseLike` — there is no rejection channel to model, so the type
advertises none. It is still a thenable at runtime (that is how `await`
collapses it, and its `then` forwards `onrejected` defensively), but it is
deliberately **not** interchangeable with a raw promise. A raw `Promise<Result>`
_can_ reject; an `AsyncResult` cannot. That distinction is why the
[`prefer-async-result`](../how-to/lint-your-codebase#prefer-async-result)
lint rule steers you away from `Promise<Result<T, E>>`.

One consequence: an `AsyncResult` has no `isOk` / `isErr` / `isDefect`. The state
isn't known until it settles, so there is nothing to guard on yet. `await` it
first — the guards live on the `Result` you get back.

::: info Eliminators still reject on a Defect
The async eliminators reject when they hit a `Defect`: `await result.get()`
rethrows the defect's cause, just like the synchronous `get()`. (Like its sync
form, `get()` is type-gated — it compiles only when the error channel is
`never` — so in well-typed code an `Err` can't reach it; a `Defect` is the only
rejection you'll see.) It is the _internal_ promise — the one `await result`
resolves — that never rejects. Panicking on a defect is by design; see
[The Defect Channel](./the-defect-channel#get-is-asymmetric).
:::

## Combinator callbacks are synchronous

This is the rule that keeps qualification honest:

> A raw `Promise` may **never** enter an `AsyncResult` combinator.

If `.map(async …)` were allowed, a rejection inside that callback would silently
become a defect — an un-qualified async boundary, exactly what
[qualification](./qualification) exists to prevent. So combinator callbacks are
synchronous. The `Result`-returning binds (`flatMap`, `flatMapErr`,
`recoverDefect`, `bind`, …) accept a `Result` **or** an `AsyncResult`, but never a
raw promise — a `Promise` has no `flatMap`, so the types keep it out.

To do more async work, you re-enter through a qualified boundary and compose it
with `flatMap`:

```ts
const order = await fromPromise(loadCart(id), qualify).flatMap((cart) =>
  fromPromise(checkout(cart), qualify),
);
```

The extra `fromPromise` is not ceremony — it is the forced triage decision that
guarantees the failure becomes a modeled error or a defect, never an untyped
`unknown`. The alternative — allowing `async` callbacks — would reintroduce the
one leak the library is built to close, at the most convenient-looking spot.

## Why this is worth the constraint

A single-axis `Result` can only stay sound if every combinator callback is
total, and an `async` callback that can reject breaks that. By forbidding raw
promises in the pipeline and forcing async re-entry through a boundary,
`unthrown` guarantees that **every** way a failure can arise — a rejection, a
throw, a returned `Err` — has passed through triage. That is what lets the whole
program share one exhaustive `match` at its edge, with no `try`/`catch` and no
rejection to forget to handle.

## Where to go next

- The forced-triage rule this depends on: [Qualification](./qualification).
- The type it routes bugs to: [The Defect Channel](./the-defect-channel).
- Moving between `Result` and `AsyncResult`:
  [Combinator reference](../reference/combinators#result-and-asyncresult).
