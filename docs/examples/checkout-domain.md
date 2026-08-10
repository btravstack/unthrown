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

## Where to go next

- Store and read it back: [Checkout persistence](./checkout-persistence).
- Serve it: [Checkout API](./checkout-api).
