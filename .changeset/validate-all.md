---
"unthrown": minor
---

`validateAll` / `validateAllFromDict` and their async counterparts
(`validateAllAsync` / `validateAllFromDictAsync`): the accumulating siblings of
`all` / `allFromDict`, which report only the first `Err`.

```ts
const checked = validateAllFromDict(
  {
    stock: checkStock(order),
    credit: checkCreditLimit(customer),
    address: checkAddress(order),
  },
  (entries) => new OrderRejected({ violations: entries }),
);
// stock and address failed → Err(OrderRejected) naming both, not just the first
```

The success channel is `all`'s, unchanged: a fixed tuple keeps its positional
types, a dynamic array collapses to `Result<T[], E2>`, and a record answers a
record. Only the error channel differs.

**`merge` is mandatory, and that is the point.** neverthrow's
`combineWithAllErrors` answers `Result<T[], E[]>`; here you supply
`(errors) => E2`. An `E[]` is a _shape_, not a domain failure — Thesis #1 says
`E` holds anticipated failures a caller can match on and act upon, and an array
pushes "what does it mean that several rules failed?" to every consuming site,
forever. Naming an `E2` answers it once, where the errors were collected.

`merge` receives a **non-empty** list, so it is total — it never runs on an
all-`Ok` batch. The record form hands it **`[key, error]` entries correlated per
key** (`{ a: Result<A, E1>; b: Result<B, E2> }` yields `["a", E1] | ["b", E2]`),
so a `switch` on the key narrows the error and an impossible pairing does not
typecheck — which is what keeps two checks sharing one error type
distinguishable.

Every existing aggregate rule still holds. A `Defect` **dominates** and
discards the accumulated errors — a batch carrying an unmodeled failure produced
violations computed alongside broken code, so `merge` is never called; an
out-of-contract non-`Result` element is still a `TypeError`-caused `Defect`; a
throw inside `merge` becomes a `Defect`; the async pair resolves concurrently
(order preserved) and its internal promise never rejects. `merge` must be
**synchronous** (`NotThenable`) — an `async` one would land an unqualified
`Promise` in `E`, the boundary rule from Thesis #3.

This narrows, rather than reverses, the "no error accumulation" decision. For
**schema-shaped** input — a request body, a form — `@unthrown/standard-schema`'s
`fromSchema` is still the tool: a validator already hands you every issue as the
modeled error, and `validateAll` there duplicates a job it does better. What the
old argument never reached is independent checks you wrote yourself — business
rules that hit the database and encode policy rather than shape. No validator
expresses `checkCreditLimit(customer)`, and reporting one violation of five is a
worse product. That is the case these four exist for.

Both facades gained the entry points (`Result.validateAll` /
`Result.validateAllFromDict`, `AsyncResult.validateAll` /
`AsyncResult.validateAllFromDict`, dropping the `Async` suffix as the namespace
already says async), and `examples/checkout-domain` exercises the record form on
three independent order checks.
