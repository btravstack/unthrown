# @unthrown/saga

> A sequence whose steps carry compensating undos, unwound LIFO the moment one
> fails — for [unthrown](https://github.com/btravstack/unthrown)'s `AsyncResult`.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/sequence-dependent-steps)**

```sh
pnpm add @unthrown/saga
```

```ts
import { SagaAsync } from "@unthrown/saga";

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

`DoAsync` sequences steps where a later one needs an earlier one's **value**.
This is for the sequence where a later step's **failure** has to take the
earlier ones back, and it decides three things the hand-written walk-back gets
wrong:

- **The undos run in reverse.** Getting that backwards is silent.
- **Nothing runs early.** An `AsyncResult` starts on construction, so an undo
  built outside the failure branch runs whether or not it was needed. Every
  argument here is a thunk.
- **Compensation may not fail.** `undo` answers `unknown` in the Ok channel and
  `never` in the Err one: the caller is already handling the failure that
  triggered it. A **defect** inside an undo is the exception — it wins over
  that failure, after every remaining undo has run.

`run` takes no argument; `undo` receives its own step's value. Either may answer
a plain `Result` in place of an `AsyncResult`. `run()` answers the last step's
value, and the failure comes back **unchanged**, so a caller triages exactly
what it would have without the saga.

Pure control flow — no timers, no clock, no randomness — so it replays
deterministically inside a workflow sandbox.

It is a package rather than an `unthrown` export because it is a **pattern**
built on the public surface: it reaches no channel the library does not already
expose, and installing it is the opt-in.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
