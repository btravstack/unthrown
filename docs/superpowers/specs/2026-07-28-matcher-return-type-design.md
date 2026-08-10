# `returnType<R>()` — pin the match output, enforce it per branch

**Date:** 2026-07-28
**Status:** Approved
**Package:** `unthrown` (core) — minor release (beta prerelease active)

## Motivation

The built-in matcher (`matcher.ts`, #151) reproduced ts-pattern's call-site
shape but dropped one feature that came with the dependency: `.returnType<R>()`,
which declares the output type once and constrains **every** branch handler to
it.

The loss bites hardest in **code generic in `E`** — a boundary helper, a bridge,
an adapter that folds an unresolved error union. There, the fold's output has to
be _declared_ by the signature, not reverse-engineered from whatever the
branches happen to return. Without a pin:

- a branch drifting off-spec silently widens the outgoing type instead of
  erroring (exactly the silent-widening-of-`E` the library exists to prevent);
- the mismatch surfaces downstream — at the call site, or wherever the `Result`
  is finally consumed — not on the branch that broke the contract;
- branch returns get no contextual type, so object literals widen and need
  per-branch annotations.

`returnType` fixes all three at once, and it is the feature users coming from
ts-pattern will reach for by name. Keep the name.

## Public surface

Builder-level, so one addition reaches every surface that hands out a matcher:
the five `*ErrCases` combinators (sync **and** async), `match`'s `errCases`
handler, and standalone `match(value)`.

```ts
r.mapErrCases((m, defect) =>
  m
    .returnType<ApiError>()
    .with(tag("NotFound"), () => new ApiError({ status: 404 }))
    .with(tag("DriverError"), (e) => defect(e.cause)),
); // => Result<T, ApiError> — declared, not inferred from the branches
```

No new exports from `index.ts`. `returnType` is a member of the already-exported
`Matcher` type; the new diagnostic type stays unexported, symmetric with
`NonExhaustive`.

## Type encoding (`packages/core/src/matcher.ts`)

`Matcher<E, Remaining, O>` gains a fourth parameter:

```ts
type Matcher<E, Remaining, O, Declared = Unset> = { … }
```

`Declared` is defaulted, so `ErrMatcher<E> = ReturnType<typeof match<E>>` and
every existing `Matcher<…>` reference stay source-compatible — the change is
purely additive.

Two internal conditionals mirror ts-pattern's `PickReturnValue`:

```ts
declare const UNSET: unique symbol;
type Unset = typeof UNSET;

/** Handler return position: free inference unpinned; the declared type pinned. */
type BranchReturn<D, O2> = [D] extends [Unset] ? O2 : D | Defect;
/** Builder output: the accumulated union unpinned; the declared type pinned. */
type PinnedOut<D, O> = [D] extends [Unset] ? O : D;
```

(Named to avoid confusion with `types.ts`'s existing `MatchOut<M>`, which
extracts a builder's output through `ExhaustiveMatch` — a different concept.)

Applied to both `with` overloads (the `UniversalPattern` catch-all **and** the
grouped-pattern one), to `exhaustive`, and to `run`. `Declared` threads through
unchanged on every arm.

`returnType` is a **property** with the same gate shape as `exhaustive`:

```ts
returnType: [O] extends [never]
  ? <R>() => Matcher<E, Remaining, never, R>
  : PinTooLate;
```

`PinTooLate` is a branded diagnostic object (the `NonExhaustive` pattern):
``{ readonly "unthrown: `.returnType<R>()` is only allowed directly after `match(…)`": true }``.

Two consequences fall out for free:

- calling `.returnType` after a `.with` arm fails, matching ts-pattern's rule;
- a pinned `.with` leaves `O` as `unknown` (the handler's return is contextually
  typed, so `O2` never infers), so **re-pinning is blocked** by the same gate.

### Inference hazard — checked, not assumed

CLAUDE.md's internal-design rule forbids conditional types in inference-bearing
parameter positions (the `fromPromise` qualify regression, where a conditional
made TS defer inference and collapse `T` to `unknown`). `BranchReturn<D, O2>` sits on
the handler's **return** type with `D` resolved by the receiver, so the
conditional reduces eagerly. Verified against a scratch harness reproducing the
real overload shapes: the unpinned path still infers `1 | "x"`, not `unknown`.

This is guarded by a type-level regression test rather than left to trust, and
the existing `combine` inference guard must stay green.

## Runtime (`packages/core/src/matcher.ts`)

One line on `MatcherImpl`, exactly as ts-pattern does it (`returnType(){return this}`) —
the feature is entirely type-level:

```ts
/** Type-level only: pins the output type. A no-op at runtime. */
returnType(): this {
  return this;
}
```

`MatcherImpl.prototype` stays frozen.

## Semantics

- **A `defect(…)` branch stays legal under a pin.** The handler return type is
  `Declared | Defect`; `run()` types as `Declared`. This is the same net result
  as today's `Exclude<MatchOut<M>, Defect>` subtraction, performed up front. The
  alternative — an exact pin — would make `returnType` and the sanctioned
  Thesis-#5 `Err`→`Defect` form mutually exclusive, and `Defect` is not a
  nameable public type, so `returnType<ApiError | Defect>()` is not spellable.
- **This under-describes the runtime**, by exactly the amount `recoverErrCases`'
  `Result<T | U, never>` already does: a pinned `run()` types as `Declared`
  while a defect branch may return the marker at runtime. Sound in practice —
  the combinators' `runMatch` checks `isDefectMarker` before using the value, so
  no lie escapes. This gets an explicit line in CLAUDE.md's load-bearing
  invariants.
- **`match`'s `errCases` handler** also accepts a `Defect` return by this typing,
  but no `defect` helper is injected there and there is no public constructor —
  unreachable, documented as such.
- **Everything else is preserved:** branch narrowing (`Extract<Remaining, …>`),
  the `P._` catch-all state transition over an unresolved generic `E` (#145 —
  verified pinned _and_ unpinned), `NonExhaustive` diagnostics naming the
  remaining cases, and the combinators' `ExhaustiveMatch` / `MatchOut` /
  `MatchErrOut` plumbing (which reads `run()`, so it picks up the declared type
  with no change).

## Testing

**`packages/core/src/matcher.spec.ts`** (runtime; 100% line/function coverage is
enforced):

- `returnType()` returns the same builder and the match still evaluates —
  covers the new method.
- a pinned match with a `P._` catch-all still throws `NonExhaustiveError` on a
  rogue value.

**`packages/core/src/types.test-d.ts`** (type-level):

Must compile:

- pin locks the output — `mapErrCases` with `returnType<ApiError>()` yields
  `Result<T, ApiError>`.
- a `defect(…)` branch under a pin.
- branch narrowing under a pin.
- the generic-`E` lock: `P._`-terminated, pinned, inside a function generic in
  `E`.
- **regression:** the unpinned path infers the branch union exactly as today,
  and `combine<T, E>(rs: AsyncResult<T, E>[])` still infers.

Must **not** compile (`@ts-expect-error`):

- a branch returning something off the pin (the error must land on the branch).
- `.returnType` after a `.with` arm.
- re-pinning.
- a missing case under a pin (`exhaustive` not callable).

## Documentation

- `docs/explanation/exhaustive-error-matching.md` — a new section on pinning the
  output, placed after "Generic boundary helpers: the catch-all works, tags
  don't" (the same generic-`E` motivation), showing the defect branch.
- `docs/reference/combinators.md` — a note in "The error channel" preamble
  (around the `(matcher) => …` abbreviation) that the matcher's output can be
  pinned.
- TSDoc on `returnType` and the fourth type parameter (must stay
  typedoc-warning-free).
- `CLAUDE.md` — the matcher paragraph currently implies `returnType` is among
  the dropped ts-pattern surface; move it into the supported list, and add the
  under-description note to the load-bearing invariants.
- A `minor` changeset for `unthrown`.

## Out of scope

The rest of the deliberately-dropped ts-pattern surface stays dropped: deep
structural inversion, `P.select`, array/variadic patterns, `.narrow()`,
`.otherwise()`. `returnType` is re-introduced on its own merits (declaring an
output type), not as a step toward restoring parity.
