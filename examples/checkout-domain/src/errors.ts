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

export type CheckoutError = CartNotFound | CartEmpty | OutOfStock | PaymentDeclined;
