import { DoAsync, Err, Ok, type AsyncResult, type Result } from "unthrown";

import { CartEmpty, type CartNotFound, type OutOfStock, type PaymentDeclined } from "./errors.js";

export type CartLine = { sku: string; quantity: number; unitPrice: number };
export type Cart = { id: string; lines: readonly CartLine[] };
export type Order = { id: string; total: number; lines: readonly CartLine[] };
export type PaymentRef = { reference: string };

/**
 * The collaborators, injected. Nothing here talks to a database or a network —
 * that is what makes this example runnable with nothing listening, and it is
 * also how a real domain layer stays testable.
 *
 * `charge` returns an `AsyncResult`, so `placeOrder` is asynchronous; the other
 * two are synchronous `Result`s. `bind` sequences all three the same way.
 */
export type CheckoutDeps = {
  findCart: (cartId: string) => AsyncResult<Cart, CartNotFound>;
  reserve: (line: CartLine) => Result<void, OutOfStock>;
  charge: (amount: number) => AsyncResult<PaymentRef, PaymentDeclined>;
};

const totalOf = (lines: readonly CartLine[]): number =>
  lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

/**
 * Reserve every line, failing on the first that cannot be met.
 *
 * A plain loop, not an aggregate: `all` would evaluate every line and we want
 * the first failure to stop the walk.
 */
const reserveAll = (
  deps: CheckoutDeps,
  lines: readonly CartLine[],
): Result<readonly CartLine[], OutOfStock> => {
  for (const line of lines) {
    const reserved = deps.reserve(line);
    if (reserved.isErr()) return Err(reserved.error);
  }
  return Ok(lines);
};

/**
 * Place an order for a cart.
 *
 * Read the signature first: the error channel names exactly the four business
 * outcomes. Anything else that can go wrong — the payment provider timing out,
 * a bug in `totalOf` — is not in this type, and arrives as a `Defect`.
 *
 * `Do`/`bind` sequences the steps in an accumulating scope, so each step sees
 * the previous ones by name and any `Err` short-circuits the rest.
 */
export const placeOrder = (
  deps: CheckoutDeps,
  cartId: string,
): AsyncResult<Order, CartNotFound | CartEmpty | OutOfStock | PaymentDeclined> =>
  DoAsync()
    .bind("cart", () => deps.findCart(cartId))
    .bind("nonEmpty", ({ cart }) =>
      cart.lines.length === 0 ? Err(new CartEmpty({ cartId })) : Ok(cart.lines),
    )
    .bind("lines", ({ nonEmpty }) => reserveAll(deps, nonEmpty))
    .bind("payment", ({ lines }) => deps.charge(totalOf(lines)))
    .map(({ lines, payment }) => ({
      id: `order_${payment.reference}`,
      total: totalOf(lines),
      lines,
    }));
