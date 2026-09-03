import { Err, Ok, P, OkAsync, ErrAsync } from "unthrown";
import { expect, test } from "vitest";
import "@unthrown/vitest";

import {
  CartNotFound,
  OutOfStock,
  PaymentDeclined,
  type Cart,
  type CheckoutDeps,
  placeOrder,
} from "./index.js";

const LINE = { sku: "COFFEE-1KG", quantity: 2, unitPrice: 12_00 };

/**
 * A fully-working set of dependencies. Each test overrides exactly the one it
 * is about, so the failure under test is unambiguous.
 */
const deps = (over: Partial<CheckoutDeps> = {}): CheckoutDeps => ({
  findCart: (id) => OkAsync({ id, lines: [LINE] } satisfies Cart),
  reserve: () => Ok(),
  charge: () => OkAsync({ reference: "pay_123" }),
  ...over,
});

test("an order is placed when every step succeeds", async () => {
  const result = await placeOrder(deps(), "cart_1");
  await expect(result).toBeOk();
  expect(result.getOrNull()?.total).toBe(24_00);
});

test("a missing cart surfaces as CartNotFound, not a throw", async () => {
  const result = await placeOrder(
    deps({ findCart: (id) => ErrAsync(new CartNotFound({ cartId: id })) }),
    "cart_missing",
  );
  await expect(result).toBeErrTagged("CartNotFound", { cartId: "cart_missing" });
});

test("an empty cart is its own case, distinct from a missing one", async () => {
  const result = await placeOrder(deps({ findCart: (id) => OkAsync({ id, lines: [] }) }), "cart_1");
  await expect(result).toBeErrTagged("CartEmpty", { cartId: "cart_1" });
});

test("OutOfStock carries the structured detail, and the message is built from it", async () => {
  const result = await placeOrder(
    deps({
      reserve: (line) =>
        Err(new OutOfStock({ sku: line.sku, requested: line.quantity, available: 1 })),
    }),
    "cart_1",
  );
  await expect(result).toBeErrTagged("OutOfStock", {
    sku: "COFFEE-1KG",
    requested: 2,
    available: 1,
  });
  // The message is derived from the payload — read it back through an
  // exhaustive fold, since there is no "get the error or null" extractor.
  const message = result.match({
    ok: () => "",
    defect: () => "",
    errCases: (m) =>
      m
        .with(P.tag("OutOfStock"), (e) => e.message)
        .with(P.tag("CartNotFound"), P.tag("CartEmpty"), P.tag("PaymentDeclined"), () => ""),
  });
  expect(message).toBe("2 × COFFEE-1KG requested, 1 available");
});

// A `Result<void, OutOfStock>` can be in the DEFECT state at runtime — the
// defect variant is never part of `E`. A reservation step that blows up on its
// own account must therefore pass through as a Defect, not be mistaken for
// success: `isErr()` is false for a Defect, so anything that branches only on
// `isErr` silently swallows it.
test("a reservation step that throws surfaces as a Defect, not a silent Ok", async () => {
  const boom = new Error("stock service exploded");
  const result = await placeOrder(
    deps({
      reserve: () =>
        Ok().map(() => {
          throw boom;
        }),
    }),
    "cart_1",
  );
  await expect(result).toBeDefectWith(boom);
});

test("a declined payment keeps its code for the edge to branch on", async () => {
  const result = await placeOrder(
    deps({ charge: () => ErrAsync(new PaymentDeclined({ code: "card_expired" })) }),
    "cart_1",
  );
  await expect(result).toBeErrTagged("PaymentDeclined", { code: "card_expired" });
});

// THE POINT OF THE WHOLE EXAMPLE: a provider outage is not a modelled failure.
// It throws, the pipeline catches it, and it arrives as a Defect — never as an
// `Err` the caller could mistake for a domain outcome.
test("a payment-provider outage becomes a Defect, not an Err", async () => {
  const boom = new Error("connect ETIMEDOUT");
  const result = await placeOrder(
    deps({
      charge: () => {
        throw boom;
      },
    }),
    "cart_1",
  );
  // The cause is the original throw, not a wrapper: `bind` is a plain
  // combinator, so it mints a Defect carrying the thrown value as-is. (The
  // AggregateError wrapping is reserved for the failure *observers*.)
  await expect(result).toBeDefectWith(boom);
});
