# Combine parallel results

> **How-to.** Collect several _independent_ `Result`s into one. For _dependent_
> steps (each needs the previous value), use
> [do-notation](./sequence-dependent-steps) instead.

## Combine an array with `all`

`all` collects a tuple/array of `Result`s into a `Result` of all their values.
The first `Err` short-circuits; any `Defect` dominates (even over an earlier
`Err`). A fixed tuple keeps its positional types; a dynamic `Result<T, E>[]`
collapses to `Result<T[], E>`:

```ts
import { all, Ok, type Result } from "unthrown";

all([Ok(1), Ok("two"), Ok(true)]).get(); // => [1, "two", true] (typed [number, string, boolean])
all([Ok(1), Ok(2)] as Result<number, never>[]).get(); // => number[]
```

## Combine a record with `allFromDict`

For **named** parallel work, `allFromDict` takes a record instead — same rules, no
tupling:

```ts
import { allFromDict, Ok } from "unthrown";

allFromDict({ id: Ok(1), name: Ok("ada") }).get(); // => { id: 1, name: "ada" }
```

Both report the **first** `Err` and stop looking. To report every one instead, see [Accumulate every error](#accumulate-every-error-with-validateall) below.

## Combine async results concurrently

`allAsync` and `allFromDictAsync` are the asynchronous counterparts — same folding
rules, inputs resolved **concurrently** (order preserved), and (like every
`AsyncResult`) they never reject:

```ts
import { allAsync } from "unthrown";

// loadProfile / loadPosts / loadFollowers each return an AsyncResult
const page = allAsync([loadProfile(id), loadPosts(id), loadFollowers(id)]);
// AsyncResult<[Profile, Post[], User[]], ProfileError>

page.map(([profile, posts, followers]) =>
  renderPage(profile, posts, followers),
);
```

Use `allFromDictAsync` to key the concurrent results by name instead of position.

## Accumulate every error with `validateAll`

`all` tells you the first thing that went wrong. When you are running
**independent checks** — business rules that don't depend on one another — you usually want all of them:

```ts
import { validateAll } from "unthrown";

// each check returns Result<_, OutOfStock | OverLimit | UnservedZone>
validateAll(
  [checkStock(order), checkCreditLimit(customer), checkShippingZone(address)],
  (violations) => new OrderRejected({ violations }),
);
// Result<[StockHold, CreditLine, Zone], OrderRejected>
```

`merge` is **mandatory**, and that is the design. neverthrow's `combineWithAllErrors` hands you an `E[]`; unthrown makes you name an `E2`, because an array of errors is a _shape_, not a domain failure — and `E` holds anticipated domain failures ([why](../explanation/why-unthrown)). You decide what "three rules were violated" means in your domain, once, at the point you collect them.

Four things worth knowing:

- **`merge` is total.** It receives a **non-empty** list, and it is called only
  when at least one `Err` was collected — never on an all-`Ok` input. No
  "shouldn't happen" branch.
- **A `Defect` still dominates**, and the accumulated errors are discarded
  without reaching `merge`. A defect means something in the batch failed in a way
  nobody modeled, so the violations computed alongside it aren't trustworthy.
- **A throw inside `merge` becomes a `Defect`**, like every other callback in the
  library.
- **`merge` must be synchronous.** An `async` one is a compile error — its
  `Promise` would land unqualified in `E`.

The record form names each failure, and the entries are **correlated per key**,
so a `switch` on the key narrows the error:

```ts
import { validateAllFromDict } from "unthrown";

validateAllFromDict(
  {
    vatRate: checkRate(inv),
    currency: checkCurrency(inv),
    dueDate: checkDueDate(inv),
  },
  (entries) => new InvoiceRejected({ fields: entries.map(([field]) => field) }),
);
```

That correlation is what keeps two checks that share an error type distinguishable — with a flat list of `RuleViolated`s you could not tell which field produced which.

`validateAllAsync` and `validateAllFromDictAsync` are the concurrent
counterparts. Note that the accumulating and fail-fast forms do the **same work**: every input has already run by the time the aggregate sees it, so the choice is purely about which errors get reported.

::: tip Schema-shaped input?
If you're validating a request body or a form, reach for [`fromSchema`](./validate-with-standard-schema) instead — a validator already hands you every issue as the modeled error. `validateAll` is for independent checks you wrote yourself.
:::

## Where to go next

- Sequence _dependent_ steps: [Sequence dependent steps](./sequence-dependent-steps).
- The full aggregate surface: [Result & AsyncResult surface](../reference/result-surface#aggregating-all-allfromdict).
