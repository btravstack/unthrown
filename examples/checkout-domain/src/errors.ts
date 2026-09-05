import { TaggedError } from "unthrown";

/**
 * The four ways placing an order can fail *as a matter of business*. Each one
 * is something a caller branches on — which is exactly the test for whether a
 * failure belongs in `E` at all.
 *
 * A payment provider that will not answer is NOT here. Nobody writes domain
 * logic for a severed TCP connection; they log it and return 500. That is the
 * defect channel's job, and `placeOrder` demonstrates it.
 */
export class CartNotFound extends TaggedError("CartNotFound")<{ cartId: string }> {
  override message = `no cart ${this.cartId}`;
}

export class CartEmpty extends TaggedError("CartEmpty")<{ cartId: string }> {
  override message = `cart ${this.cartId} has no lines`;
}

/**
 * The payload is structured, not baked into a string — Thesis #4. The edge can
 * render `available` in a message; a caller can decide to partially fulfil.
 * `message` is derived from the fields, defined once here.
 */
export class OutOfStock extends TaggedError("OutOfStock")<{
  sku: string;
  requested: number;
  available: number;
}> {
  override message = `${this.requested} × ${this.sku} requested, ${this.available} available`;
}

/** Discriminated on a second axis (`code`), so a matcher can group its arms. */
export class PaymentDeclined extends TaggedError("PaymentDeclined")<{
  code: "insufficient_funds" | "card_expired";
}> {
  override message = `payment declined (${this.code})`;
}

/**
 * A policy check that is not about stock: the order is too small to be worth
 * shipping. Distinct payload, distinct type — which is what lets the merged
 * report say something specific about it.
 */
export class BelowMinimum extends TaggedError("BelowMinimum")<{
  total: number;
  minimum: number;
}> {
  override message = `order total ${this.total} is below the ${this.minimum} minimum`;
}

/** Another policy check, again with its own payload. */
export class UnservedRegion extends TaggedError("UnservedRegion")<{ region: string }> {
  override message = `we do not ship to ${this.region}`;
}

/**
 * The merged error the accumulating aggregates fold into.
 *
 * This is the shape `validateAll` forces you to name. neverthrow's
 * `combineWithAllErrors` would hand the caller an `OutOfStock[]`; an array is a
 * *shape*, not a domain failure, so every consuming site would have to decide
 * what it means. Naming it once, here, is the whole point — and the payload
 * stays structured (Thesis #4), so the edge can render it however it likes.
 */
export class CartRejected extends TaggedError("CartRejected")<{
  violations: readonly OutOfStock[];
}> {
  override message = `${this.violations.length} line(s) cannot be fulfilled`;
}

/** The merged error for the *named* policy checks. */
export class CheckoutBlocked extends TaggedError("CheckoutBlocked")<{
  reasons: readonly string[];
}> {
  override message = this.reasons.join("; ");
}

export type CheckoutError = CartNotFound | CartEmpty | OutOfStock | PaymentDeclined;
