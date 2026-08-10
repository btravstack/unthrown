---
title: Checkout persistence example
description: Storing and reading a checkout with @unthrown/prisma — a read that infers E = never, and a write that carries only the P-codes a caller would branch on.
---

# Checkout persistence

[`examples/checkout-persistence`](https://github.com/btravstack/unthrown/tree/main/examples/checkout-persistence)
— the persistence half: a repository built on `@unthrown/prisma`, storing and
reading the cart from [Checkout domain](./checkout-domain) against a real
(in-memory) database.

```sh
pnpm --filter @unthrown/example-checkout-persistence test
```

## A read infers `E = never`

```ts
findCart: (cartId: string): AsyncResult<Cart, CartNotFound> =>
  db.cart
    .tryFindUnique({ where: { id: cartId }, include: { lines: true } })
    .flatMap((row) =>
      row === null ? Err(new CartNotFound({ cartId })) : Ok(/* … */),
    );
```

`tryFindUnique` itself is `AsyncResult<Row | null, never>` — a database that
will not answer at all is a `Defect`, not a domain outcome, so there is no
error case to name for the query. Absence is `null`. `CartNotFound` is not
something Prisma raises; it is something _this repository_ introduces by
turning that `null` into the modeled error `findCart` promises its caller
(matching `CheckoutDeps["findCart"]` from the domain package). The test pins
the distinction:

```ts
await expect(repo.findCart("nope")).toBeErrTagged("CartNotFound", {
  cartId: "nope",
});
```

## A write carries only the P-codes you would branch on

```ts
saveOrder: (order: { id: string; total: number; cartId: string }) =>
  db.order.tryCreate({ data: order });
```

`saveOrder`'s error channel is exactly `UniqueConstraintViolation |
ForeignKeyViolation | RecordNotFound` — the P-codes a `create` can actually
raise. The schema's `Order.cartId @unique` makes "one order per cart" a real
constraint, so a second `saveOrder` for the same cart comes back as a modeled
`Err`, not a thrown driver exception:

```ts
await expect(repo.saveOrder({ id: "o1", total: 100, cartId: "c1" })).toBeOk();
await expect(
  repo.saveOrder({ id: "o2", total: 100, cartId: "c1" }),
).toBeErrTagged("UniqueConstraintViolation");
```

Everything infrastructural — a dropped connection, a pool timeout, a
deadlock — is deliberately _not_ in either channel. Nobody writes domain logic
for those; they are a `Defect`, folded once at the edge. See
[the Prisma guide](../how-to/use-with-prisma) for the full per-operation error
table.

## Where to go next

- The modelling half: [Checkout domain](./checkout-domain).
- Serve it: [Checkout API](./checkout-api).
