---
title: Checkout API example
description: Serving placeOrder over oRPC with @unthrown/orpc — an exhaustive mapErrCases at the edge, no try/catch, and a provider outage that collapses to INTERNAL_SERVER_ERROR instead of an unhandled rejection.
---

# Checkout API

[`examples/checkout-api`](https://github.com/btravstack/unthrown/tree/main/examples/checkout-api)
— the edge half: [Checkout domain](./checkout-domain)'s `placeOrder` served
over oRPC with `@unthrown/orpc`, tested through a real request/response cycle.

```sh
pnpm --filter @unthrown/example-checkout-api test
```

## No `try`/`catch`

The handler is one `mapErrCases` call — nothing else:

```ts
handlerResult(({ input, errors }) =>
  placeOrder(deps, input.cartId).mapErrCases((matcher) =>
    matcher
      .with(P.tag("CartNotFound"), (e) =>
        errors.NOT_FOUND({ message: e.message }),
      )
      .with(P.tag("CartEmpty"), (e) =>
        errors.BAD_REQUEST({ message: e.message }),
      )
      .with(P.tag("OutOfStock"), (e) => errors.CONFLICT({ message: e.message }))
      .with(P.tag("PaymentDeclined"), (e) =>
        errors.PAYMENT_REQUIRED({ message: e.message }),
      ),
  ),
);
```

That is safe with no surrounding guard because two things already happened
upstream. First, `placeOrder`'s own pipeline never lets a thrown callback
escape — the throw→defect net converts it to a `Defect` before it reaches this
handler. Second, [`handlerResult`](../how-to/use-with-orpc) is the elimination
edge: `Ok` becomes the response, a returned `ORPCError` is served as a typed,
inferable error, and a `Defect` is rethrown onto oRPC's own defect path. There
is nothing left for a `try`/`catch` to do here.

## Every domain case is named

`placeOrder`'s error channel is `CartNotFound | CartEmpty | OutOfStock |
PaymentDeclined` — four cases, each with its own `.with(P.tag(...), ...)` arm
mapping it to a distinct declared `ORPCError`. `P._` is banned by the
dogfooded `no-catch-all-pattern` lint rule, so there is no wildcard to quietly
absorb a case that was never handled. Add a fifth error to
`CheckoutError` and this `mapErrCases` stops compiling — every call site,
this one included, must add its own arm before the build is green again. The
tests pin three of the four outcomes as distinctly observable:

```ts
await expect(caller.placeOrder({ cartId: "nope" })).rejects.toMatchObject({
  code: "NOT_FOUND",
});
await expect(caller.placeOrder({ cartId: "cart_1" })).rejects.toMatchObject({
  code: "PAYMENT_REQUIRED",
});
```

## The defect arm: an outage, not a 500 with a leaked stack trace

The fourth outcome the suite pins is not a domain case at all — it is what
happens when the payment provider throws instead of returning a
`PaymentDeclined`:

```ts
const caller = createCaller(
  deps({
    charge: () => {
      throw new Error("connect ETIMEDOUT");
    },
  }),
);
await expect(caller.placeOrder({ cartId: "cart_1" })).rejects.toMatchObject({
  code: "INTERNAL_SERVER_ERROR",
});
```

Nothing in `router.ts` names this case, because it is not a business outcome —
nobody writes domain logic for a severed connection. The throw becomes a
`Defect` inside `placeOrder`, `handlerResult` rethrows its cause, and oRPC
collapses it to a generic `INTERNAL_SERVER_ERROR` rather than leaking the raw
exception. `createCaller` deliberately routes every call through a real
`RPCHandler`/`RPCLink` loop (in-memory, no socket) rather than oRPC's
in-process shortcut, because that collapse only happens once a call crosses a
genuine transport boundary — the same reason
[`@unthrown/orpc`'s own suite](https://github.com/btravstack/unthrown/tree/main/packages/orpc/src/index.spec.ts)
tests it that way. The payoff: an unmodelled failure still cannot escape as an
unhandled rejection — it always arrives as a typed, catchable error, just not
one you were meant to handle in `mapErrCases`.

See [the oRPC guide](../how-to/use-with-orpc) for the full server/client
bridge.

## Where to go next

- The modelling half: [Checkout domain](./checkout-domain).
- The persistence half: [Checkout persistence](./checkout-persistence).
