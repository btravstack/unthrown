import {
  CartNotFound,
  PaymentDeclined,
  type CheckoutDeps,
} from "@unthrown/example-checkout-domain";
import { Err, Ok } from "unthrown";
import { expect, test } from "vitest";

import { createCaller } from "./index.js";

const LINE = { sku: "COFFEE-1KG", quantity: 2, unitPrice: 12_00 };

const deps = (over: Partial<CheckoutDeps> = {}): CheckoutDeps => ({
  findCart: (id) => Ok({ id, lines: [LINE] }).toAsync(),
  reserve: () => Ok(undefined),
  charge: () => Ok({ reference: "pay_123" }).toAsync(),
  ...over,
});

test("a placed order comes back as the procedure's output", async () => {
  const caller = createCaller(deps());
  const order = await caller.placeOrder({ cartId: "cart_1" });
  expect(order.total).toBe(24_00);
});

test("a modelled failure arrives as a typed, inferable ORPCError", async () => {
  const caller = createCaller(
    deps({ findCart: (id) => Err(new CartNotFound({ cartId: id })).toAsync() }),
  );
  await expect(caller.placeOrder({ cartId: "nope" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("a declined payment maps to its own status, not a generic 500", async () => {
  const caller = createCaller(
    deps({ charge: () => Err(new PaymentDeclined({ code: "card_expired" })).toAsync() }),
  );
  await expect(caller.placeOrder({ cartId: "cart_1" })).rejects.toMatchObject({
    code: "PAYMENT_REQUIRED",
  });
});

// The payoff: the handler has no try/catch, and an unmodelled failure still
// cannot escape as an unhandled rejection — it collapses to INTERNAL_SERVER_ERROR.
test("a provider outage collapses to INTERNAL_SERVER_ERROR", async () => {
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
});
