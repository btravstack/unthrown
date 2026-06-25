# Why unthrown?

`unthrown` is a small, focused TypeScript library for **explicit errors as
values**, with a separate **defect channel** for the unexpected.

The name states the concern: ordinary errors are _unthrown_ — returned as
values, not flung up the stack. Only a true defect ever throws, and only at
`unwrap`.

## The problem with throwing

A thrown exception is invisible to the type system. A function typed
`(id: string) => User` might throw `NotFoundError`, `TimeoutError`, or a
`TypeError` from a typo — the signature promises none of it, and the compiler
won't make you handle any of it. Errors-as-values libraries fix this by
returning a `Result<T, E>` so failures are part of the type.

But most of them stop there, and that leaves a gap.

## The gap: unexpected failures

There are really **two** kinds of failure:

- **Anticipated** domain errors — "user not found", "payment declined". You
  model these, and callers handle them.
- **Unexpected** failures — a thrown `TypeError`, an un-triaged promise
  rejection, a bug in a callback. These are not part of your domain; they are
  defects.

If a library folds both into the same `E`, a bug starts to look like a domain
error. You write a `match` that "handles" `E`, and a `TypeError` quietly flows
down the success-recovery path. The type said you were safe; the runtime
disagreed.

## How unthrown is different

`unthrown` keeps a **third runtime state** — a `Defect` — that is **invisible to
the type**. `Result<T, E>` exposes only your anticipated errors in `E`. Anything
unexpected becomes a defect that short-circuits to the edge, where you log it and
return a 500. A defect can only be observed by `match` or `recoverDefect`; it is
never silently recovered by `unwrapOr`, `getOrNull`, or `recover`.

Two more deliberate choices follow from this:

- **Qualification is enforced at every boundary.** `fromPromise` /
  `fromThrowable` take a mandatory `qualify` function that triages each failure
  into a modeled error or a defect. There is no code path that yields `unknown`
  in `E`.
- **Throws are caught and become defects.** A `throw` inside any combinator
  (`.map`, `.flatMap`, …) is captured as a defect rather than escaping — which is
  what lets an HTTP handler do a single `match({ ok, err, defect })` with no
  surrounding `try`/`catch`.

## Compared to the alternatives

- **neverthrow / boxed** — model errors as values, but have no proper channel
  for _unexpected_ errors, and don't force qualification when a value crosses an
  async boundary. `boxed` also ships an `Option` type — a second way to express
  absence that `unthrown` deliberately omits.
- **effect** — extremely powerful, but heavy: it conflates error handling with
  context, runtime, dependency injection, and more. `unthrown` does one thing.

`unthrown` borrows Effect's best idea — a defect (`die`) channel distinct from
modeled errors — and ships just that, in a library small enough to be _done_.

→ Continue to [Getting Started](./getting-started).
