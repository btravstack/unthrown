---
title: Examples
description: Three small packages modelling one checkout — code that compiles and is covered by tests, unlike the snippets in the guide.
---

# Examples

Annotated tours of the runnable packages under
[`examples/`](https://github.com/btravstack/unthrown/tree/main/examples). They
model one small checkout between them, each showing a different job
`unthrown` does.

**Unlike the snippets elsewhere in this guide, this code compiles and is
covered by tests.** There is no database and no server to start:

```sh
git clone https://github.com/btravstack/unthrown.git
cd unthrown
pnpm install
pnpm --filter "@unthrown/example-*" test
pnpm --filter "@unthrown/example-*" typecheck
```

## [Checkout domain](/examples/checkout-domain)

The error union, `Do`/`bind` sequencing, exhaustive matching, and the defect
channel — a thrown payment-provider outage becomes a `Defect`, never an `Err`
a caller might mistake for a modelled outcome.

## [Checkout persistence](/examples/checkout-persistence)

`@unthrown/prisma` on in-memory SQLite: why a read infers `E = never` (absence
is `null`; a database that will not answer is a defect) and a write carries
only the P-codes a caller would actually branch on.

## [Checkout API](/examples/checkout-api)

The edge: `placeOrder` served over oRPC with `@unthrown/orpc` — one exhaustive
`mapErrCases`, a handler with no `try`/`catch`, a provider outage that
collapses to `INTERNAL_SERVER_ERROR` instead of an unhandled rejection, and
why oRPC's own input validation is a separate concern from `E`.

## Why these exist as packages rather than snippets

Every fenced block in the rest of this guide is written by hand. It is
checked by review and nothing else, so it can drift from the library without
any build noticing.

These three cannot. They are workspace packages: they typecheck, their specs
run in CI, and they consume `unthrown` and its satellites through their real
published entry points rather than a path alias. If the library changes
underneath them, something goes red.
