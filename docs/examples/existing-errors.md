---
title: Existing error types example
description: Adopting unthrown in a codebase that already models its domain errors — a kind-discriminated class hierarchy, a plain code union, and untagged third-party classes, with no TaggedError anywhere.
---

# Existing error types

[`examples/existing-errors`](https://github.com/btravstack/unthrown/tree/main/examples/existing-errors)
— the adoption case. A codebase that already has an error convention, wired to
`Result` without rewriting it. **`TaggedError` does not appear once.**

```sh
pnpm turbo run test --filter=@unthrown/example-existing-errors
```

## Why the package exists

`Result<T, E>` is generic in `E` and **unconstrained** — there is no
`E extends { _tag: string }` anywhere in core, and `P.tag("X")` is only sugar
for the object pattern `{ _tag: "X" }`. Saying so in prose is cheap; the three
modules here compile and are tested in CI, so the claim cannot quietly stop
being true.

Each one takes a different existing convention, matching a section of
[Model errors](../how-to/model-errors#use-the-errors-you-already-have).

## `tickets.ts` — your own class hierarchy

The convention that was already there: an abstract base carrying a `kind`.

```ts
export abstract class AppError extends Error {
  abstract readonly kind: string;
}

export class TicketNotFound extends AppError {
  readonly kind = "TicketNotFound" as const;
  constructor(readonly ticketId: string) {
    super(`no ticket ${ticketId}`);
  }
}
```

`mapErrCases` drives the same exhaustive matcher the tagged path uses,
dispatching on `kind` through a plain object pattern:

```ts
assignTicket(store, ticketId, to).mapErrCases((matcher) =>
  matcher
    .with({ kind: "TicketNotFound" }, (e) => ({
      status: 404,
      detail: e.ticketId,
    }))
    .with({ kind: "TicketLocked" }, (e) => ({
      status: 423,
      detail: e.lockedBy,
    })),
);
```

Each branch is narrowed to its own class, so `ticketId` and `lockedBy` are
reachable without a cast. Add a third `AppError` subclass to the union and this
stops compiling until it is named — the guarantee comes from the union's shape,
not from `TaggedError`.

## `billing.ts` — a plain union, no classes at all

The other extreme: a client generated from an OpenAPI document, whose failures
are plain objects with a `code`. `E` does not have to be an `Error` either.

```ts
export type BillingError =
  | { readonly code: "CARD_DECLINED"; readonly declineCode: string }
  | { readonly code: "INSUFFICIENT_FUNDS" }
  | { readonly code: "RATE_LIMITED"; readonly retryAfter: number };
```

Two codes deserve the same response, so they share one arm as a **grouped
pattern** — both still named, which is the difference from a wildcard:

```ts
client.charge(cents).match({
  ok: () => 200,
  defect: () => 500,
  errCases: (matcher) =>
    matcher
      .with(
        { code: "CARD_DECLINED" },
        { code: "INSUFFICIENT_FUNDS" },
        () => 402,
      )
      .with({ code: "RATE_LIMITED" }, () => 429),
});
```

The spec pins the `defect` arm too: a socket hang-up in the billing client
folds to 500 rather than arriving as a fourth code a caller might branch on.

## `vendor.ts` — untagged third-party classes

Two SDK error classes with no shared discriminant, no tag, and no possibility
of editing them. The boundary is where the real decision gets made:

```ts
export const render = fromThrowable(
  (source: string): Template => ({ rendered: vendorRender(source) }),
  (cause, defect) =>
    cause instanceof VendorSyntaxError || cause instanceof VendorTimeoutError
      ? cause
      : defect(cause),
);
```

That is the answer to "how does unthrown know which failures are modelled" — not
the error's shape, but `qualify`. What you return becomes `E`; what you hand to
the injected `defect` leaves the modelled type entirely. The spec asserts both
halves, including that a `RangeError` from inside the SDK never reaches `E`.

Matching then uses `P.instanceOf`, the pattern for a union with nothing to
dispatch on but identity:

```ts
result.mapErrCases((matcher) =>
  matcher
    .with(P.instanceOf(VendorSyntaxError), (e) => ({
      detail: `bad syntax at ${e.at}`,
    }))
    .with(P.instanceOf(VendorTimeoutError), (e) => ({
      detail: `timed out after ${e.afterMs}ms`,
    })),
);
```

`P.when(guard)` covers whatever neither an object pattern nor `instanceof` can
express.

## What you still have to give up

Nothing about the error _type_ — but `E` must be a union TypeScript can
**discriminate**, because exhaustiveness is `Exclude` over it. A `kind`, a
`code`, distinct class shapes or a guard all qualify; a widened `Error`,
`string` or `unknown` does not, and leaves `P._` as the only arm that
terminates the match. That is the same thing a `switch` needs, and what
[`no-ambiguous-error-type`](../how-to/lint-your-codebase#no-ambiguous-error-type)
is really guarding.

## Where to go next

- The guide section this mirrors:
  [Model errors](../how-to/model-errors#use-the-errors-you-already-have).
- Why the boundary decides:
  [Qualification](../explanation/qualification).
- What `TaggedError` buys you when you _don't_ have a convention:
  [Model errors](../how-to/model-errors#define-a-tagged-error).
