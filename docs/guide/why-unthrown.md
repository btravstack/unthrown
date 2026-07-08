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

```ts
// Before: the signature hides every failure — and a bug in a callback
// escapes as a runtime exception three layers up.
function getUser(id: string): User; // throws NotFoundError? TimeoutError? TypeError?

// After: anticipated failures are in the type; a thrown bug becomes a
// Defect that can't masquerade as either.
function getUser(id: string): Result<User, NotFound | Timeout>;

getUser(id)
  .map((u) => u.emial.trim()) // typo — TypeError → Defect, NOT an Err
  .match({ ok: render, err: showMessage, defect: report500 });
```

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

## Why this matters more with AI in the loop

Most code today is written with an assistant in the loop, and the economics of
that loop reward exactly what errors-as-values provides. A model converges on
correct code fastest when a mistake is caught **at author time by the type
checker** rather than **at run time by a crash**: a compile error is local,
specific, and available before anything executes, whereas a thrown exception
costs a full generate → run → observe → retry cycle just to _discover_ that
something can fail.

Thrown exceptions give a model nothing to work with. A signature
`(id: string) => User` hides every way it can fail, so neither the model nor the
compiler can tell that a caller forgot to handle a timeout — the failure surfaces
later, as a stack trace, in a separate iteration. `Result<T, E>` puts every
anticipated failure _in the type_, which turns the type checker into a
specification the model must satisfy: a non-exhaustive `match`, an unhandled
`PaymentDeclined`, a forgotten `Err` arm each become a compile error the moment
they're written. That is the tightest correction signal there is — immediate,
mechanical, and free of a run.

The defect channel is what keeps that signal sharp. If unexpected failures were
folded into `E` as `unknown` or `Error`, exhaustiveness would degrade into
"handle the catch-all" and stop meaning anything. By holding `E` to exactly the
modeled errors and routing the unexpected to a separate, type-invisible defect,
`unthrown` keeps `E` a precise contract — so the type stays worth checking and
the compiler keeps telling the model something _true_. The enforced `qualify` at
every boundary reinforces this: it forces an explicit triage decision at each
`fromPromise` / `fromThrowable` instead of letting `unknown` be swallowed and
carried forward. The [`@unthrown/oxlint`](./linting) rule
`no-ambiguous-error-type` guards the same line from the other side, failing the
build when `unknown` / `any` / `Error` leak back into `E`.

## Compared to the alternatives

- **neverthrow / boxed / byethrow** — model errors as values, but have no proper
  channel for _unexpected_ errors, and a throw inside a `.map` callback either
  escapes as a real exception or gets folded into `E`. `boxed` also ships an
  `Option` type — a second way to express absence that `unthrown` deliberately
  omits.
- **effect** — extremely powerful, and it _does_ have a defect channel, but it is
  heavy: it conflates error handling with context, runtime, dependency injection,
  and more. `unthrown` does one thing.

`unthrown` borrows Effect's best idea — a defect (`die`) channel distinct from
modeled errors — and ships just that, in a library small enough to be _done_.

For a feature-by-feature table across all of these, see
[Comparison](./comparison).

→ Continue to [Comparison](./comparison).
