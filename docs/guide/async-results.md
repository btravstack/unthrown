# Async Results

An `AsyncResult<T, E>` is the asynchronous counterpart of `Result<T, E>`. It has
the **same method surface**, and `await`-ing it collapses it to a `Result`.

You get one from a qualified boundary ([`fromPromise`](./boundaries),
`fromSafePromise`) or by lifting a sync `Result` with `.toAsync()`.

```ts
import { fromSafePromise } from "unthrown";

const result = await fromSafePromise(Promise.resolve(1)).map((n) => n + 1);
result.unwrap(); // 2
```

## Awaitable, not a Promise

An `AsyncResult`'s internal promise **never rejects**. Every rejection or thrown
value is captured as an `Err` (via `qualify`) or a `Defect`, so `await`-ing one
always yields a `Result` and never throws.

Because of that, it is typed as a success-only `Awaitable<Result<T, E>>` rather
than a full `PromiseLike` — there is no rejection channel to model. It is still a
thenable at runtime (that is how `await` collapses it), but it is deliberately
not interchangeable with a raw promise.

::: warning Eliminators still reject
The async eliminators do throw when you ask them to: `await result.unwrap()`
rejects on an `Err` or `Defect`, just like the synchronous `unwrap()`. It is the
_internal_ promise — the one `await result` resolves — that never rejects.
:::

## Combinator callbacks are synchronous

This is the rule that keeps qualification honest:

> A raw `Promise` may **never** enter an `AsyncResult` combinator.

If `.map(async …)` were allowed, a rejection inside that callback would silently
become a defect — an un-qualified async boundary, exactly what the library exists
to prevent. So combinator callbacks are synchronous, and the binds (`flatMap`,
`orElse`, `recoverDefect`) accept a `Result` or an `AsyncResult`, but never a raw
promise.

To do more async work, re-enter through a qualified boundary and compose it with
`flatMap`:

```ts
const order = await fromPromise(loadCart(id), qualify).flatMap((cart) =>
  fromPromise(checkout(cart), qualify),
);
```

The extra `fromPromise` is not ceremony — it is the forced triage decision that
guarantees the failure becomes a modeled error or a defect, never an untyped
`unknown`.

→ Continue to [Tagged Errors](./tagged-errors).
