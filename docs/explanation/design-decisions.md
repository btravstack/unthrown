# Design decisions

> **Explanation.** `unthrown` is defined as much by what it leaves out as by what
> it ships. This page collects the deliberate exclusions and the reasoning
> behind them, so a missing feature reads as a decision rather than an oversight.

The guiding aim is that the library can be **"done"** — small enough to hold in
your head, with one name per concept and no surface that has to keep growing.
Each omission below was weighed against that aim.

## No `Option` type

Absence is expressed with the type system you already trust — `T | undefined`,
`T | null`, or `Result<T, NotFound>` — and nullable third-party APIs cross into
`Result` through [`fromNullable`](../how-to/qualify-a-boundary#fromnullable-absence-as-a-modeled-error).

A dedicated `Option` would be a second way to say "maybe absent", competing with
the union types TypeScript already models well. `boxed` ships one; `unthrown`
deliberately does not. One concept, one representation.

## No generator do-notation (`gen` / `safeTry`)

If you come from neverthrow's `safeTry` or Effect's `gen`, you may miss
`yield*`-style flattening. The [`Do`/`bind`/`let`](../how-to/sequence-dependent-steps)
notation covers the same sequential code without the generator machinery:

```ts
// Generator style (not in unthrown):
safeTry(function* () {
  const user = yield* findUser(id);
  const plan = yield* findPlan(user);
  return Ok({ user, plan });
});

// unthrown's Do-notation — same flattening, no generator:
Do()
  .bind("user", () => findUser(id))
  .bind("plan", ({ user }) => findPlan(user));
```

The two are semantically equivalent for sequential code. What the generator
buys — early `return` mid-block, `try`/`finally` around yields — comes at the
cost of a second composition style, generator-transpilation overhead, and a
`yield*` operator whose error-channel typing surprises people. If a chain grows
long enough that `Do` feels heavy, that is usually a sign the steps deserve named
functions composed with `flatMap`.

## No error accumulation (`Validation`)

`all` / `allFromDict` (and their async pair) **short-circuit on the first
`Err`** — they are not error accumulation. There is no `combineWithAllErrors`, no
`Validation` applicative.

Accumulating every failure is a genuinely different operation with a different
type (`Result<T, E[]>`-shaped), most useful for form validation — and for that
case the [Standard Schema bridge](../how-to/validate-with-standard-schema) already
hands you the validator's full issues array as the modeled error. Building a
second accumulation primitive into the core would widen the surface for a job a
validator does better.

## No `Defect` constructor

A defect-state `Result` has no public constructor. The primitive is already
`throw` — the [throw → defect](./the-defect-channel#throw-defect) rule is the
sanctioned syntax — and the qualify-time `defect` helper is _injected_ wherever a
triage decision is made (`qualify` at a boundary, the error-match branches),
never exported.

The reasoning is friction as a forcing function: once minting a defect is one
frictionless call, "I don't feel like modeling this error" starts flowing into
the defect channel, and the discipline that makes `E` trustworthy erodes. Scoping
the injection to triage sites keeps that friction. Weighed and
decided in [#77](https://github.com/btravstack/unthrown/issues/77).

## No serialization

A `Result` does not survive `structuredClone` / JSON by design — the method
surface and the frozen prototype don't round-trip. Fold it with `match` at the
boundary and re-enter through a constructor or a boundary on the other side. A
`Result` is an in-process control-flow value, not a wire format.

## No `recoverFailure`, no channel-moving operators

`tapFailure` observes both KO channels, but there is deliberately no
`recoverFailure`: frictionless defect recovery would erode the channel's meaning,
so recovering stays the separate, loud `recoverDefect`, and handling both
channels for good is `match`. There are likewise no operators that move a value
between channels — `Err`→`Defect` would erase the modeled type, and
`Defect`→`Err` would put `unknown` back into `E`, violating the first thesis.

## One name per concept — no aliases

There is no `andThen` (it's `flatMap`), no `chain`, no `bind` outside
do-notation, no `orElse`/`recover` aliases for the error combinators. The
extractor family is spelled only `get…`
(`get`/`getErr`/`getOr`/`getOrElse`/`getOrNull`/`getOrUndefined`/`getOrThrow`);
the old `unwrap*` aliases were removed. Convenience aliases multiply the surface
and force every reader to learn that two names mean one thing. Resisting them is
part of staying "done".

Naming follows behavior, even when that breaks symmetry with the success surface:
the error-matcher combinators carry a `*Cases` suffix (`mapErrCases`,
`flatMapErrCases`, `recoverErrCases`, `tapErrCases`, `flatTapErrCases`) rather than
the bare `mapErr` / `tapErr`, because their callback receives a matcher over the
error's _cases_, not the value. The suffix is the honest name — see
[Exhaustive error matching](./exhaustive-error-matching#why-the-cases-suffix).

## Where to go next

- The channel several of these decisions protect: [The Defect Channel](./the-defect-channel).
- How `unthrown` compares to libraries that made other choices:
  [Comparison](./comparison).
