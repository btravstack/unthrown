import { DoAsync, Ok, type AsyncResult, type Result } from "unthrown";

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
 * A `flatMap` fold, not an aggregate: `all` takes an already-materialised array,
 * so every `reserve` would have run before it saw the first failure. Folding
 * keeps the walk lazy — after a failure the callback is simply not invoked.
 *
 * And not a hand-rolled loop either. The obvious version —
 * `for (…) { if (r.isErr()) return Err(r.error) }` — is **wrong**: `isErr()` is
 * false for a `Defect`, so a reservation that blew up on its own account would
 * fall through the loop and be reported as `Ok`, silently destroying the defect
 * channel. `flatMap` short-circuits on `Err` *and* passes a `Defect` through
 * untouched, which is the whole reason to reach for the combinator rather than
 * branch by hand.
 */
const reserveAll = (
  deps: CheckoutDeps,
  lines: readonly CartLine[],
): Result<readonly CartLine[], OutOfStock> =>
  lines
    .reduce<Result<void, OutOfStock>>((acc, line) => acc.flatMap(() => deps.reserve(line)), Ok())
    .map(() => lines);

/**
 * Place an order for a cart.
 *
 * Read the signature first: the error channel names exactly the four business
 * outcomes. Anything else that can go wrong — the payment provider timing out,
 * a bug in `totalOf` — is not in this type, and arrives as a `Defect`.
 *
 * `Do`/`bind` sequences the steps in an accumulating scope, so each step sees
 * the previous ones by name and any `Err` short-circuits the rest. `ensure`
 * validates the cart in place — no separate step just to rename the same
 * value — widening `E` from `CartNotFound` to `CartNotFound | CartEmpty`.
 */
export const placeOrder = (
  deps: CheckoutDeps,
  cartId: string,
): AsyncResult<Order, CartNotFound | CartEmpty | OutOfStock | PaymentDeclined> =>
  DoAsync()
    .bind("cart", () =>
      deps.findCart(cartId).ensure(
        (c) => c.lines.length > 0,
        () => new CartEmpty({ cartId }),
      ),
    )
    .bind("lines", ({ cart }) => reserveAll(deps, cart.lines))
    .let("total", ({ lines }) => totalOf(lines))
    .bind("payment", ({ total }) => deps.charge(total))
    .map(({ lines, payment, total }) => ({
      id: `order_${payment.reference}`,
      total,
      lines,
    }));
