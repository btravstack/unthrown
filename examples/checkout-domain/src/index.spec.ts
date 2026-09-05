import { Err, Ok, P, fromSafeThrowable, OkAsync, ErrAsync } from "unthrown";
import { expect, test } from "vitest";
import "@unthrown/vitest";

import {
  BelowMinimum,
  CartNotFound,
  checkPolicies,
  OutOfStock,
  PaymentDeclined,
  reviewCart,
  UnservedRegion,
  type Cart,
  type CheckoutDeps,
  type PolicyDeps,
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

// --- reviewing a whole cart: every violation, not just the first -------------

const OUT_OF_STOCK = (sku: string) => new OutOfStock({ sku, requested: 2, available: 0 });

test("reviewCart reports EVERY unfulfillable line, not just the first", () => {
  const cart: Cart = {
    id: "cart_1",
    lines: [
      { sku: "COFFEE-1KG", quantity: 2, unitPrice: 12_00 },
      { sku: "TEA-500G", quantity: 2, unitPrice: 8_00 },
      { sku: "MUG", quantity: 1, unitPrice: 5_00 },
    ],
  };
  const result = reviewCart(
    deps({ reserve: (line) => (line.sku === "MUG" ? Ok() : Err(OUT_OF_STOCK(line.sku))) }),
    cart,
  );
  // `getErr()` does not compile on a still-fallible Result — fold the channel
  // exhaustively instead, which is the same thing the API edge would do.
  const skus = result.match({
    ok: () => [],
    errCases: (m) => m.with(P.tag("CartRejected"), (e) => e.violations.map((v) => v.sku)),
    defect: () => [],
  });
  // `placeOrder`'s lazy fold would have stopped at COFFEE-1KG.
  expect(skus).toEqual(["COFFEE-1KG", "TEA-500G"]);
});

test("reviewCart never calls merge when every line reserves", () => {
  const cart: Cart = { id: "cart_1", lines: [LINE] };
  const result = reviewCart(deps(), cart);
  expect(result.getOrNull()).toEqual([LINE]);
});

test("a Defect in one line dominates the accumulated violations", () => {
  const cart: Cart = {
    id: "cart_1",
    lines: [LINE, { sku: "TEA-500G", quantity: 1, unitPrice: 8_00 }],
  };
  // Note where the defect comes from: `reserve` is called while the array is
  // being built, BEFORE `validateAll` sees anything, so a raw `throw` here would
  // escape the aggregate entirely. A defect reaches an aggregate the way defects
  // always arise — through a boundary. `fromSafeThrowable` is that boundary.
  const explode = fromSafeThrowable((): void => {
    throw new Error("stock service exploded");
  });
  const result = reviewCart(
    deps({
      reserve: (line) => (line.sku === "COFFEE-1KG" ? Err(OUT_OF_STOCK(line.sku)) : explode()),
    }),
    cart,
  );
  // The violation it beat was computed alongside broken code, so it is dropped.
  expect(result.isDefect()).toBe(true);
});

// --- named policy checks: the entries stay correlated with their key ---------

const policies = (over: Partial<PolicyDeps> = {}): PolicyDeps => ({
  checkMinimum: () => Ok(),
  checkRegion: () => Ok(),
  ...over,
});

test("checkPolicies merges each failure using the error type its key produces", () => {
  const cart: Cart = { id: "cart_1", lines: [LINE] };
  const result = checkPolicies(
    policies({
      checkMinimum: () => Err(new BelowMinimum({ total: 500, minimum: 2_000 })),
      checkRegion: () => Err(new UnservedRegion({ region: "Antarctica" })),
    }),
    cart,
  );
  const reasons = result.match({
    ok: () => [],
    errCases: (m) => m.with(P.tag("CheckoutBlocked"), (e) => e.reasons),
    defect: () => [],
  });
  expect(reasons).toEqual(["total 500 < 2000", "no shipping to Antarctica"]);
});

test("checkPolicies passes when every rule holds", () => {
  const result = checkPolicies(policies(), { id: "cart_1", lines: [LINE] });
  expect(result.isOk()).toBe(true);
});
