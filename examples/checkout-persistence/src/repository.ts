import { CartNotFound, type Cart } from "@unthrown/example-checkout-domain";
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

  return {
    /**
     * A READ has `E = never`: absence is `null`, and a database that will not
     * answer is a defect, not a domain outcome. So the only modelled failure
     * here is the one *we* introduce — the row being absent.
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
     * A WRITE carries the P-codes a caller would branch on. Here that is
     * `UniqueConstraintViolation` — one order per cart — which the type forces
     * every caller to handle.
     */
    saveOrder: (order: { id: string; total: number; cartId: string }) =>
      db.order.tryCreate({ data: order }),
  };
};
