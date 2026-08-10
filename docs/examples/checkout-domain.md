---
title: Checkout domain example
description: Errors as values in a small checkout domain — a TaggedError union, Do/bind sequencing, and the defect channel, in a package that compiles and is tested.
---

# Checkout domain

[`examples/checkout-domain`](https://github.com/btravstack/unthrown/tree/main/examples/checkout-domain)
— the modelling half: the error union, the domain function, and the tests that
pin both.

```sh
pnpm --filter @unthrown/example-checkout-domain test
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
await expect(result).toBeDefect();
expect(result.isDefect() ? result.cause : undefined).toBe(boom);
```

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

## Where to go next

- Store and read it back: [Checkout persistence](./checkout-persistence).
- Serve it: [Checkout API](./checkout-api).
