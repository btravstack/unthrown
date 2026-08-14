import type { AsyncResult } from "unthrown";

/**
 * A second convention, from the other extreme: the billing client is generated
 * from an OpenAPI document, so its failures arrive as **plain objects** with a
 * `code`. No classes, no `Error` subclassing, nothing to rewrite.
 *
 * `E` does not have to be an `Error` — only discriminable.
 */
export type BillingError =
  | { readonly code: "CARD_DECLINED"; readonly declineCode: string }
  | { readonly code: "INSUFFICIENT_FUNDS" }
  | { readonly code: "RATE_LIMITED"; readonly retryAfter: number };

export type BillingClient = {
  readonly charge: (cents: number) => AsyncResult<{ reference: string }, BillingError>;
};

/**
 * Folding at the edge with `match`. Two of the three codes deserve the same
 * response, so they share one arm as a **grouped pattern** — both still named,
 * which is the difference that matters: add a fourth code to
 * {@link BillingError} and this fails to compile, where a `P._` fallback would
 * have swallowed it silently.
 *
 * `match` on an `AsyncResult` resolves to a `Promise` of the folded value.
 */
export function chargeForHttp(client: BillingClient, cents: number): Promise<number> {
  return client.charge(cents).match({
    ok: () => 200,
    // The billing client's transport blowing up is not a modelled outcome —
    // it lands in the defect channel and becomes a 500, never an `E` a caller
    // might branch on.
    defect: () => 500,
    errCases: (matcher) =>
      matcher
        .with({ code: "CARD_DECLINED" }, { code: "INSUFFICIENT_FUNDS" }, () => 402)
        .with({ code: "RATE_LIMITED" }, () => 429),
  });
}
