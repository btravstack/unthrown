import {
  CartNotFound,
  PaymentDeclined,
  type CheckoutDeps,
} from "@unthrown/example-checkout-domain";
import { ErrAsync, Ok, OkAsync } from "unthrown";
import { expect, test } from "vitest";

import { createCaller } from "./index.js";

const LINE = { sku: "COFFEE-1KG", quantity: 2, unitPrice: 12_00 };

const deps = (over: Partial<CheckoutDeps> = {}): CheckoutDeps => ({
  findCart: (id) => OkAsync({ id, lines: [LINE] }),
  reserve: () => Ok(),
  charge: () => OkAsync({ reference: "pay_123" }),
  ...over,
});

test("a placed order comes back as the procedure's output", async () => {
  const caller = createCaller(deps());
  const order = await caller.placeOrder({ cartId: "cart_1" });
  expect(order.total).toBe(24_00);
});

test("a modelled failure arrives as a typed, inferable ORPCError", async () => {
  const caller = createCaller(
    deps({ findCart: (id) => ErrAsync(new CartNotFound({ cartId: id })) }),
  );
  await expect(caller.placeOrder({ cartId: "nope" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("a declined payment maps to its own status, not a generic 500", async () => {
  const caller = createCaller(
    deps({ charge: () => ErrAsync(new PaymentDeclined({ code: "card_expired" })) }),
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
    message: "Internal Server Error",
  });
});

// oRPC's own input validation is a SEPARATE concern from `E`: `cartId` never
// even reaches `placeOrder`, so this is not one of the four domain cases —
// `.errors({ BAD_REQUEST: {} })` happens to share a code with `CartEmpty`,
// but the message ("Input validation failed", not "cart … has no lines")
// shows it is oRPC's own contract check, not a returned domain error.
test("an empty cartId fails oRPC's own input validation, not a domain case", async () => {
  const caller = createCaller(deps());
  await expect(caller.placeOrder({ cartId: "" })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Input validation failed",
  });
});
