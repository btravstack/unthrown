// The HTTP edge: `placeOrder` served over oRPC via `@unthrown/orpc`'s
// `handlerResult`. This file is the point of the example — read the handler
// body first.
//
// The load-bearing shape: ONE exhaustive `mapErrCases`, naming every domain
// case by tag, with no `try`/`catch` anywhere. `handlerResult` already routes
// `Ok` to the procedure's output and rethrows a `Defect`'s cause onto oRPC's
// own defect path (which collapses it to `INTERNAL_SERVER_ERROR`), so the
// handler itself never needs to guard against an unmodelled failure — the
// throw→defect net upstream in `placeOrder`'s pipeline already turned the
// payment provider's exception into a `Defect` before it ever reached here.
//
// `P._` is banned by the dogfooded oxlint preset (`no-catch-all-pattern`), so
// every one of the four `CheckoutError` cases must be named. Add a fifth error
// to the domain's union and this `mapErrCases` stops compiling until it is
// handled too — that is the payoff of matching exhaustively instead of
// blanket-handling.

import { os } from "@orpc/server";
import { placeOrder, type CheckoutDeps } from "@unthrown/example-checkout-domain";
import { handlerResult } from "@unthrown/orpc/server";
import { P } from "unthrown";
import { z } from "zod";

export const createRouter = (deps: CheckoutDeps) => ({
  placeOrder: os
    .input(z.object({ cartId: z.string().min(1) }))
    .errors({
      NOT_FOUND: {},
      BAD_REQUEST: {},
      CONFLICT: {},
      PAYMENT_REQUIRED: {},
    })
    .handler(
      handlerResult(({ input, errors }) =>
        placeOrder(deps, input.cartId).mapErrCases((matcher) =>
          matcher
            .with(P.tag("CartNotFound"), (e) => errors.NOT_FOUND({ message: e.message }))
            .with(P.tag("CartEmpty"), (e) => errors.BAD_REQUEST({ message: e.message }))
            .with(P.tag("OutOfStock"), (e) => errors.CONFLICT({ message: e.message }))
            .with(P.tag("PaymentDeclined"), (e) => errors.PAYMENT_REQUIRED({ message: e.message })),
        ),
      ),
    ),
});
