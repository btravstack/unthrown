---
title: Checkout domain example
description: Errors as values in a small checkout domain — a TaggedError union, Do/bind sequencing, and the defect channel, in a package that compiles and is tested.
---

# Checkout domain

[`examples/checkout-domain`](https://github.com/btravstack/unthrown/tree/main/examples/checkout-domain)
— the modelling half: the error union, the domain function, and the tests that
pin both.

```sh
pnpm turbo run test --filter=@unthrown/example-checkout-domain
```

## The signature is the documentation

```ts
placeOrder(deps, cartId): AsyncResult<Order, CartNotFound | CartEmpty | OutOfStock | PaymentDeclined>;
```

Four business outcomes, named. A caller can see every way this fails without
reading the body, and the compiler will not let them forget one.

## What is deliberately _not_ in `E`

The payment provider timing out. It throws, the pipeline catches it, and it
arrives as a `Defect` — never as an `Err` a caller might mistake for a domain
outcome. The test pins it:

```ts
await expect(result).toBeDefectWith(boom);
```

The cause is the original throw, not a wrapper — `bind` is a plain combinator,
so it mints a `Defect` carrying the thrown value as-is.

The rule is "would you branch on it?" Nobody writes business logic for a severed
connection; they log it and return 500. Modelling it would force an arm at every
call site duplicating that same decision.

## Why `OutOfStock` carries fields, not a string

```ts
export class OutOfStock extends TaggedError("OutOfStock")<{
  sku: string;
  requested: number;
  available: number;
}> {
  override message = `${this.requested} × ${this.sku} requested, ${this.available} available`;
}
```

The payload is structured so a caller can _use_ it — render `available`, offer a
partial fulfilment — and the human string is defined once on the class rather
than built at each throw site. See
[Model errors](../how-to/model-errors).

## The trap `reserveAll` avoids

Reserving every line looks like a job for a loop:

```ts
// ✗ WRONG — silently destroys the defect channel
for (const line of lines) {
  const reserved = deps.reserve(line);
  if (reserved.isErr()) return Err(reserved.error);
}
return Ok(lines);
```

`isErr()` is **false for a `Defect`**. A `Result<void, OutOfStock>` can be in the
defect state at runtime — the defect variant is never part of `E` — so a
reservation that blew up on its own account falls straight through this loop and
gets reported as `Ok`. The failure vanishes.

Folding with `flatMap` is both shorter and correct:

```ts
lines
  .reduce<Result<void, OutOfStock>>(
    (acc, line) => acc.flatMap(() => deps.reserve(line)),
    Ok(),
  )
  .map(() => lines);
```

`flatMap` short-circuits on `Err` **and** passes a `Defect` through untouched,
which is the whole reason to reach for the combinator instead of branching by
hand. It stays lazy too: after a failure the callback is simply not invoked, so
later lines are never reserved — which
[`all`](../reference/combinators) could not do, since it takes an
already-materialised array.

A test pins it:

```ts
await expect(result).toBeDefectWith(boom);
```

## When you want _every_ failure: `reviewCart`

`reserveAll` stops at the first bad line, and for placing an order that is right —
the transaction is over, so checking the rest is wasted work.

Rendering a **cart-review screen** is the opposite. Telling a shopper about one
unavailable line, then a second one after they fix it, is a worse product. So
`review.ts` reaches for the accumulating aggregate:

```ts
validateAll(
  cart.lines.map((line) => deps.reserve(line).map(() => line)),
  (violations) => new CartRejected({ violations }),
);
// Result<readonly CartLine[], CartRejected>
```

The `merge` argument is **mandatory**, and that is the design talking.
neverthrow's `combineWithAllErrors` would hand the caller an `OutOfStock[]`; an
array is a _shape_, not a domain failure, so every consuming site would have to
work out what it means. `CartRejected` decides once, here, and keeps a structured
payload the edge can render however it likes.

Two rules are worth seeing in the tests. `merge` receives a **non-empty** list, so
it is total — there is no "shouldn't happen" branch, and it is simply not called
when every line reserves. And a `Defect` still **dominates**: the test that makes
one line blow up gets a defect back, with the `OutOfStock` it beat discarded,
because a violation computed alongside broken code is not a violation you can
trust.

That test also shows something easy to get wrong. `deps.reserve` runs while the
array is being **built**, before `validateAll` sees anything — so a raw `throw`
there escapes the aggregate entirely. The defect has to arrive the way defects
always do, through a boundary (`fromSafeThrowable`). The throw → defect net covers
callbacks _inside_ combinators, not the code that produced their arguments.

## Named checks keep their key: `checkPolicies`

`validateAllFromDict` hands `merge` a list of `[key, error]` **entries**,
correlated per key:

```ts
(entries) =>
  new CheckoutBlocked({
    reasons: entries.map((entry) => {
      switch (entry[0]) {
        case "minimum":
          return `total ${entry[1].total} < ${entry[1].minimum}`;
        case "region":
          return `no shipping to ${entry[1].region}`;
      }
    }),
  });
```

The union is `["minimum", BelowMinimum] | ["region", UnservedRegion]`, **not**
the cross product — so switching on the key narrows the error with no casts and
no re-checking, `["region", BelowMinimum]` would not compile, and the `switch`
needs no `default` to be exhaustive.

That correlation is what makes the record form worth having. It still tells you
which check failed even when two of them share one error type, which a flat list
of errors could not.

## Where to go next

- Store and read it back: [Checkout persistence](./checkout-persistence).
- Serve it: [Checkout API](./checkout-api).
