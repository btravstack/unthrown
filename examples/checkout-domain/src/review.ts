import { type Result, validateAll, validateAllFromDict } from "unthrown";

import type { Cart, CartLine, CheckoutDeps } from "./checkout.js";
import { type BelowMinimum, CartRejected, CheckoutBlocked, type UnservedRegion } from "./errors.js";

/**
 * Review a whole cart: check **every** line and report all the ones that cannot
 * be fulfilled.
 *
 * The deliberate contrast with `reserveAll` in `checkout.ts`. That one folds with
 * `flatMap` so the walk stays lazy — placing an order, the first failure ends the
 * transaction and there is no reason to keep going. Here the caller is rendering
 * a cart-review screen: telling a shopper about one bad line, then a second one
 * after they fix it, is a worse product. So every line is checked and every
 * violation reported.
 *
 * `merge` is mandatory, and it is called only when at least one line failed — it
 * receives a **non-empty** list, so there is no "shouldn't happen" branch here.
 */
export const reviewCart = (
  deps: CheckoutDeps,
  cart: Cart,
): Result<readonly CartLine[], CartRejected> =>
  validateAll(
    cart.lines.map((line) => deps.reserve(line).map(() => line)),
    (violations) => new CartRejected({ violations }),
  );

/**
 * The named policy checks, each with its own error type.
 *
 * `validateAllFromDict` hands `merge` a list of `[key, error]` **entries**, and
 * they are correlated per key — the union is
 * `["minimum", BelowMinimum] | ["region", UnservedRegion]`, not the cross
 * product. So the `switch` below narrows the error from the key with no casts
 * and no re-checking, and `["region", BelowMinimum]` would not compile.
 *
 * That correlation is what keeps the record form worth having: it still names
 * the failing check even when two of them share one error type, where a flat
 * list of errors could not tell you which key produced which.
 */
export type PolicyDeps = {
  checkMinimum: (cart: Cart) => Result<void, BelowMinimum>;
  checkRegion: (cart: Cart) => Result<void, UnservedRegion>;
};

export const checkPolicies = (deps: PolicyDeps, cart: Cart): Result<void, CheckoutBlocked> =>
  validateAllFromDict(
    {
      minimum: deps.checkMinimum(cart),
      region: deps.checkRegion(cart),
    },
    (entries) =>
      new CheckoutBlocked({
        reasons: entries.map((entry) => {
          switch (entry[0]) {
            case "minimum":
              return `total ${entry[1].total} < ${entry[1].minimum}`;
            case "region":
              return `no shipping to ${entry[1].region}`;
          }
        }),
      }),
  ).discard();
