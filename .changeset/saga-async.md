---
"@unthrown/saga": minor
---

`@unthrown/saga`: a sequence whose steps carry compensating undos, unwound LIFO
the moment one fails.

`DoAsync` sequences steps where a later one needs an earlier one's **value**.
There was nothing for the sequence where a later step's **failure** has to undo
the earlier ones — so every saga was hand-written, with two traps in the
spelling:

- **Ordering.** The undos must run in reverse of the steps that earned them.
  Nothing checked it, and getting it backwards is silent.
- **Eagerness.** An `AsyncResult` starts on construction, so an undo built
  outside the failure branch runs whether or not it was needed — the hazard
  `unthrown/no-async-result-race` exists for.

```ts
const fulfilled = await SagaAsync()
  .step(
    () => place(order),
    () => cancelPlacement(order),
  )
  .step(
    () => reserveStock(order),
    () => releaseStock(order),
  )
  .step(() => arrangeShipping(order))
  .run();
// shipping failed → stock released, then placement cancelled, then the Err
```

Every argument is a **thunk**, so nothing is built before the saga reaches it.
`run()` answers the last step's value, and a failure — `Err` or `Defect` — comes
back **unchanged**, so a caller triages exactly what it would have without the
saga. An `undo` receives its own step's value and answers
`AsyncResult<unknown, never>`: compensation may not invent a new way to fail,
because the caller is already handling the one that triggered it. The single
exception is a **defect inside an undo** — it wins over the failure that
triggered it, since a compensation that broke is the more urgent report, and
every remaining undo still runs first.

It is pure control flow — no timers, no clock, no randomness — so it replays
deterministically inside a workflow sandbox, which is where its first consumer
runs.

It ships as a satellite package rather than a core export because it is a
**pattern** built on the public surface — it operates no channel `unthrown`
does not already expose — and core is a finishable library. Installing it is
the opt-in; the compiler holds the boundary, since it imports nothing private.

Closes #268.
