import { CartNotFound, type Cart, type CheckoutDeps } from "@unthrown/example-checkout-domain";
import { unthrownPrisma } from "@unthrown/prisma";
import { Err, Ok, type AsyncResult } from "unthrown";

import type { PrismaClient } from "./generated/prisma/client.js";

/**
 * The extension adds a `try*` twin to every delegate operation, each returning
 * an `AsyncResult` whose error channel is exactly the domain outcomes that
 * operation can raise — and nothing else.
 */
export const createRepository = (client: PrismaClient) => {
  const db = client.$extends(unthrownPrisma);

  const repository = {
    /**
     * A READ has `E = never`: absence is `null`, and a database that will not
     * answer is a defect, not a domain outcome. So the only modelled failure
     * here is the one *we* introduce — the row being absent.
     *
     * The `satisfies Pick<CheckoutDeps, "findCart">` below makes the claim
     * that this matches the domain's `CheckoutDeps["findCart"]` a
     * compiler-checked fact rather than prose — see the persistence guide.
     */
    findCart: (cartId: string): AsyncResult<Cart, CartNotFound> =>
      db.cart.tryFindUnique({ where: { id: cartId }, include: { lines: true } }).flatMap((row) =>
        row === null
          ? Err(new CartNotFound({ cartId }))
          : Ok({
              id: row.id,
              lines: row.lines.map((line) => ({
                sku: line.sku,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })),
            } satisfies Cart),
      ),

    /**
     * A WRITE carries the P-codes a caller would branch on: here that is
     * `UniqueConstraintViolation` (one order per cart), `ForeignKeyViolation`,
     * and `RecordNotFound` — `create` always carries the latter because a
     * nested `connect` to a non-existent record raises P2025. The type forces
     * every caller to handle all three.
     *
     * Note this does NOT compose with the domain's `Order` type
     * (`{ id, total, lines }`) the way `findCart` composes with `Cart` —
     * `saveOrder` takes `{ id, total, cartId }`, a persistence-shaped input,
     * not the domain's `placeOrder` output. The two packages share error
     * vocabulary, not a write-side data path.
     */
    saveOrder: (order: { id: string; total: number; cartId: string }) =>
      db.order.tryCreate({ data: order }),
  };

  return repository satisfies Pick<CheckoutDeps, "findCart">;
};
