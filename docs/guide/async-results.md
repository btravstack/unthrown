# Async Results

An `AsyncResult<T, E>` is the asynchronous counterpart of `Result<T, E>`. It has
the **same method surface**, and `await`-ing it collapses it to a `Result`.

You get one from a qualified boundary ([`fromPromise`](./boundaries),
`fromSafePromise`), by lifting a sync `Result` with `.toAsync()`, or — for a pure
value or error — directly with `OkAsync` / `ErrAsync`.

```ts
import { fromSafePromise } from "unthrown";

const result = await fromSafePromise(Promise.resolve(1)).map((n) => n + 1);
result.get(); // => 2
```

`OkAsync(value)` / `ErrAsync(error)` are the pre-lifted constructors — exactly
`Ok(value).toAsync()` / `Err(error).toAsync()`, minus the boilerplate. Reach for
them on the synchronous or early-return branch of an `AsyncResult`-returning
function, so both branches share one return type:

```ts
import { OkAsync, type AsyncResult } from "unthrown";

function loadItems(ids: string[]): AsyncResult<Item[], never> {
  if (ids.length === 0) return OkAsync([]); // no trailing .toAsync()
  return itemRepository.load(ids);
}
```

They carry the `Async` suffix the async free functions use (`allAsync`); the
`AsyncResult` companion aliases them as `AsyncResult.Ok` / `AsyncResult.Err`.

## Awaitable, not a Promise

An `AsyncResult`'s internal promise **never rejects**. Every rejection or thrown
value is captured as an `Err` (via `qualify`) or a `Defect`, so `await`-ing one
always yields a `Result` and never throws.

Because of that, it is typed as a success-only `Awaitable<Result<T, E>>` rather
than a full `PromiseLike` — there is no rejection channel to model. It is still a
thenable at runtime (that is how `await` collapses it), but it is deliberately
not interchangeable with a raw promise.

> `AsyncResult` deliberately has no `isOk` / `isErr` / `isDefect`: the state
> isn't known until it settles. `await` it first — the guards live on the
> `Result` you get back.

::: warning Eliminators still reject on a Defect
The async eliminators reject when they hit a `Defect`: `await result.get()`
rethrows the defect's cause, just like the synchronous `get()`. (Like its sync
form, `get()` is type-gated — it compiles only when the error channel is
`never` — so in well-typed code an `Err` can't reach it; a `Defect` is the only
rejection you'll see.) It is the _internal_ promise — the one `await result`
resolves — that never rejects.
:::

## Combinator callbacks are synchronous

This is the rule that keeps qualification honest:

> A raw `Promise` may **never** enter an `AsyncResult` combinator.

If `.map(async …)` were allowed, a rejection inside that callback would silently
become a defect — an un-qualified async boundary, exactly what the library exists
to prevent. So combinator callbacks are synchronous, and the binds (`flatMap`,
`flatMapErr`, `recoverDefect`) accept a `Result` or an `AsyncResult`, but never a raw
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

→ Continue to [Do Notation](./do-notation).
