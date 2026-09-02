# unthrown

A small, focused TypeScript library for **explicit errors as values**, with a
separate **defect channel** for the unexpected.

It exists because the alternatives fall short: `boxed` and `neverthrow` don't
model unexpected errors through a defect channel and don't enforce error
qualification when crossing async boundaries; `effect` is too heavy and conflates
error handling with context, runtime, etc. `unthrown` does one thing.

The name states the concern: ordinary errors are _unthrown_ — returned as values,
not flung up the stack. Only a true defect ever throws (at `get`).

This file is the authoritative spec — the rules _and_ the reasoning behind them.
Keep it in sync with the code as the library evolves (describe what _is_, not what
was planned).

## Thesis (do not drift from these)

1. **`Result<T, E>` where `E` is only the _anticipated_ domain failures.** A
   defect (an unmodeled failure) is the third variant of the `Result` union
   (`{ tag: "Defect" }`), but it **never appears in `E`**. If a failure mode
   appears in `E`, it is by definition modeled and is no longer a defect. The
   defect is matchable like any variant, but you never thread it through your
   domain error type.
2. **No `Option` type.** Absence is expressed with the type system we already
   trust: `T | undefined`, `T | null`, or `Result<T, NotFound>`. Interop with
   nullable third-party APIs goes through `fromNullable`. Do not add `Option`.
3. **Qualification is enforced at every boundary.** `fromPromise` / `fromThrowable`
   take a mandatory `qualify: (cause: unknown, defect) => E | Defect`, where
   `defect` is a helper the boundary **injects** as the second argument (domain
   code never imports it — the qualify-time marker is not a public value);
   `fromExecutor` injects the same helper as its executor's second argument,
   with no `qualify` to write. `qualify` is **synchronous**: its return intersects `NotThenable`, so an
   `async` qualify does not compile (its `Promise` would land in `E`
   un-triaged); a thenable slipped past the types at runtime becomes a `Defect`
   (never `Err(Promise)`), and the orphaned thenable is adopted-and-silenced so
   its later rejection can't float unhandled. There
   is no path that produces `unknown` in `E`. The boundary forces a triage
   decision. The
   modeled error type is inferred as **`Exclude<R, Defect>`** (where `R` is
   `qualify`'s return type): the `Defect` arm is _subtracted_ from `E`, never
   inferred into it — a defect-only `qualify` yields `E = never`, not
   `E = Defect` (sound because `Defect` is `unique symbol`-branded, so no domain
   error is assignable to it). This is also why **`AsyncResult` combinator
   callbacks are synchronous** — a raw `Promise` may never enter an `AsyncResult`
   method (its rejection would silently become a defect, skipping the triage).
   Async work re-enters only through `fromPromise` / `fromSafePromise` and
   composes via `flatMap`.
4. **`TaggedError` is the error convention** (à la Effect's `Data.TaggedError`):
   a `_tag` discriminant on a class extending `Error`. Core `Result<T, E>` stays
   **generic in `E`** (unconstrained); only the tag-aware utilities require
   `E extends { _tag: string }`. The payload carries **only structured domain
   fields** — `name`, `message`, and `stack` are **reserved** out of it (each
   typed `?: never`): `name` is the display label (set via `options.name`),
   `message` is `Error`'s human string, defined once per subclass the standard
   way (`override message = "…"`, which may interpolate the payload via `this`
   because the base populates the fields before the subclass field initialiser
   runs), and `stack` is `Error`'s trace (the constructor re-asserts the real
   one, so even an untyped payload can't clobber it). `cause` is deliberately
   **not** reserved — `Error.cause` is `unknown`, so a typed payload `cause`
   (e.g. `@unthrown/prisma`'s `DriverError`) is a legitimate structured field.
   Keeping `message` off the payload is deliberate — contextual detail
   lives in typed fields, defined per error type, never baked into a per-call
   string.
5. **The error channel is matched exhaustively, never blanket-handled.** The
   error combinators (`mapErrCases`, `flatMapErrCases`, `recoverErrCases`, `tapErrCases`,
   `flatTapErrCases`) do not take a single callback: their callback receives the
   **built-in match builder** over the error (`match(error)`, typed
   `ErrMatcher<E>`) plus the injected `defect` helper, and **returns the
   un-terminated builder** — the combinator calls `.exhaustive()` itself. So a
   match that misses a case **does not compile** (there is no `.exhaustive()`
   to forget, and no `.otherwise()` to smuggle in a fallback), and enriching
   `E` — a new tag, a new `code` — is a compile error at _every_ consuming
   site until each is handled. This is the payoff of errors-as-values: the
   values cannot be silently dropped. The matcher matches by structure, so this
   works on any discriminant (`_tag`, `code`, guards, grouped patterns), not
   only `TaggedError`. **Every case is named** — that is the default position,
   and cases sharing a handler are grouped (`.with(P.tag("A"), P.tag("B"), h)`)
   rather than collapsed into a wildcard. `P._` is an **escape hatch**, not the
   sanctioned way to handle the channel: it makes any match exhaustive, so it
   absorbs unnamed every case `E` grows later — precisely the blanket-handling
   hole the matcher closes. Its **principal remaining purpose is the generic-`E`
   case**: inside a helper generic in `E`, no arm list can prove exhaustiveness
   against an unresolved type parameter and only the catch-all's state
   transition can (see the catch-all invariant below), so `P._` stays exported
   and functional; the untyped boundary (`isResult`, where `E` is `unknown`) is
   the same shape. `@unthrown/oxlint`'s `no-catch-all-pattern` — **in the
   `recommended` preset** — enforces this, and those sites carry a targeted
   `oxlint-disable` with a reason. Each branch
   receives the narrowed variant and the **injected `defect` helper** — the
   same injection `qualify` gets (Thesis #3), the sanctioned deliberate
   `Err`→`Defect` form (`.with(P.tag("DriverError"), (e) => defect(e.cause))`);
   the outgoing type is the builder's output **with the `Defect` arm
   subtracted** (`Exclude<O, Defect>`, exactly the boundary inference), so a
   defect branch — or a throwing one, the safety net — contributes nothing.
   The **observers** (`tapErrCases`, `flatTapErrCases`) take the same exhaustive builder
   (the error passes through unchanged); a branch that returns a raw
   `Promise`/`AsyncResult` is rejected where the combinator awaits it
   (`flatMapErrCases`/`flatTapErrCases`, via the builder-output constraint) **and** in
   `tapErrCases` (its branch results are discarded — bar the `defect(…)` marker,
   which is a control-flow signal, not a value — so a rejected `Promise` would
   float unobserved; its builder output is `NotThenable`-constrained) — only
   the non-awaiting transformers `mapErrCases`/`recoverErrCases` run the branch
   synchronously with an async branch remaining a visible Promise-valued
   result, not a rejection bypass. `tapDefect` / `tapFailure` keep single callbacks — their payloads
   carry no discriminant to match (a defect's cause is `unknown`; `tapFailure`
   splits on channel, not tag). The one eliminator that still handles the error
   channel, **`match`**, applies the **same exhaustive matcher** to its
   `errCases` handler (`(matcher) => matcher.with(…)`, returning the
   un-terminated builder; `match` runs `.exhaustive()`) — so folding at the edge
   is exhaustive too, and there is no blanket `err` callback left to silently
   drop a value. The handler key carries the same `…Cases` suffix as the
   combinators (and a leftover 4.x `err:` handler is now an excess-property
   compile error, not a silent runtime break). Its `errCases` handler receives
   the matcher but **no `defect` helper** — `match` folds to a
   plain value, with no `Defect` output channel; the separate `defect` case
   handles a `Result` that already carries one. (This subsumes the former
   `matchTags` fold — per-tag folding at the edge is now `match` with the
   matcher and `P.tag(t)`, and it works on any discriminant, not only `_tag`.)
   The value-surrendering extractors (`getOr` / `getOrElse` / `getOrNull` /
   `getOrUndefined`) stay exempt — the value is being surrendered anyway. **The
   matcher is built-in** (`matcher.ts` — it replaced the former `ts-pattern`
   peer, keeping its call-site shape): a purpose-built, shallow matcher whose
   exhaustiveness is plain `Exclude` over a tracked `Remaining` parameter, with
   `match`, `P` (`_`, `tag`, `instanceOf`, `when` — a primitive-type wildcard is
   `P.when` with a `typeof` guard, and grouping patterns under one handler is
   what a `.with(a, b, handler)` arm already does, so there is no `P.string` /
   `P.number` / `P.union`, and no `P.any` alias for `P._`),
   `returnType<R>()` (declare the output type once — every branch is checked
   against it, and the match evaluates to `R` instead of the union of the branch
   returns; callable before any arm has produced an output and only once — in
   practice directly after `match(…)`, though an arm returning `never` closes
   nothing — a runtime no-op, and a `defect(…)` branch stays legal because the
   defect channel is not part of the declared output), and `NonExhaustiveError`
   exported from core — first-class in one import,
   dual-copy-safe (patterns carry a `Symbol.for` brand). Deliberately **not**
   supported: deep structural inversion, `P.select`, array patterns — the
   complexity (and cross-version instability) the replacement removed.

## Load-bearing runtime invariants (tests must guard these)

- **Throw → defect.** Any value thrown by a callback (or match branch) inside
  a combinator (`map`, `flatMap`, `flatTap`, `ensure`, `bind`, `let`, `mapErrCases`,
  `flatMapErrCases`,
  `recoverErrCases`, `tap*`, `flatTapErrCases`, `recoverDefect`) is caught and converted to a
  `Defect`. Nothing escapes a pipeline as a raw throw.
  This is what lets an HTTP adapter do a single `match({ ok, errCases, defect })`
  with **no surrounding `try/catch`**.
- **An out-of-contract non-`Result` surfaces as a `Defect`, never a raw
  throw/rejection.** Reachable only from untyped/cast callers: the aggregates
  (`all` / `allFromDict` and their async pair) turn a non-`Result` element into
  a `TypeError`-caused `Defect`, and every combinator whose callback is
  constrained to return a `Result` (`flatMap`, `flatTap`, `bind`, `flatMapErrCases`,
  `flatTapErrCases`, `recoverDefect` — both surfaces; the async ones check the
  **awaited** value, so a legitimately returned `AsyncResult` still passes)
  does the same with a non-`Result` callback return, instead of letting a
  poison value throw a raw `TypeError` further down the pipeline.
- **A non-exhaustive error match becomes a `Defect` (in the combinators).** In
  the error combinators, the callback returns the match builder and the
  combinator runs `.run()` (which executes `.exhaustive()`). For well-typed
  callers the match is exhaustive by construction; a value that slips past the
  types (a widened cast, a JS caller) with no matching case throws the matcher's
  `NonExhaustiveError` (exported from core), which the throw-to-defect net turns
  into a `Defect` — an unmodeled failure. In **`match`** (an edge eliminator, exempt from
  throw→defect) the same non-exhaustive rogue value instead **throws**
  `NonExhaustiveError` outright — a genuinely unmodeled tag at the edge is a
  bug, not a routed value.
- **Exhaustiveness is type-enforced, with no forgettable step.** `mapErrCases` /
  `flatMapErrCases` / `recoverErrCases` / `tapErrCases` / `flatTapErrCases` require the callback to
  return an `ExhaustiveMatch` — `.exhaustive` is typed callable only when the
  builder's tracked `Remaining` parameter has been excluded down to `never`
  (all cases covered); a non-exhaustive builder types `.exhaustive` as the
  branded `NonExhaustive<Remaining>` diagnostic (naming the unhandled cases)
  and fails the constraint at the call site. For code that builds the match through the
  provided matcher there is no path where a case slips past an error combinator
  uncovered without a compile error, and no `.exhaustive()` / `.otherwise()`
  for a caller to reach (the combinator owns termination). One honest caveat:
  `ExhaustiveMatch` is **structural**, so a hand-rolled `{ exhaustive, run }`
  object can satisfy it and bypass exhaustiveness in typed code — accepted, as
  a deliberate act no worse than the `P._` escape hatch. This
  is a _type-level_ invariant, guarded in `types.test-d.ts`.
- **A pinned match under-describes the defect channel — deliberately.** Under
  `.returnType<R>()` a branch handler may return `R | Defect` (the injected
  `defect` helper stays legal — Thesis #5) while `run()`/`exhaustive()` type as
  `R`: the marker is subtracted up front instead of at the end. Unpinned, the
  five error combinators do **not** treat the marker uniformly, so the pin
  papers over a _typing_ asymmetry: `mapErrCases`/`recoverErrCases` subtract it
  from the output (`MatchErrOut` = `Exclude<MatchOut, Defect>`),
  `flatMapErrCases` tolerates it through an explicit `| Defect` in its
  constraint, `tapErrCases` infers it as an ordinary (unthenable) branch return,
  and `flatTapErrCases` unpinned **rejects** it (its
  `ExhaustiveMatch<Result<…>>` constraint admits no marker) — a pin is the only
  way to write a `defect(…)` branch there. The _runtime_ treatment, by contrast,
  is uniform: **every** one of the five combinators checks `isDefectMarker` on
  the branch output, so `defect(…)` is everywhere the expression-position form
  of a `throw`, with no combinator silently discarding one. Soundness is per
  call site, not in `runMatch` (which only builds the matcher, runs the callback
  and `.run()`s the builder): the three transformers mint `defectRes(cause)`,
  while the two observers (`tapErrCases`, `flatTapErrCases`) route it through
  `observerThrowToDefect`, since a deliberate `defect(…)` in an observer is the
  expression-position form of a `throw` and must not destroy the error being
  observed — `tapErrCases` discards ordinary branch _values_, but the marker is
  a control-flow signal, not a value. `match`'s `errCases`
  handler accepts the same shape but is injected **no** `defect` helper and the
  marker has no public constructor, so a `Defect` is not reachable there without
  deliberately smuggling the injected helper out of another combinator's
  callback. Type-level, guarded in `types.test-d.ts`; the observer's runtime
  treatment is guarded in `invariants.spec.ts`.
- **A `Defect` flows through every method untouched EXCEPT `match()`,
  `recoverDefect()`, and the observers `tapDefect()` / `tapFailure()` (which
  observe it without consuming it).** Therefore `getOr`, `getOrElse`,
  `getOrNull`, `getOrUndefined` still **throw** on a `Defect` — they recover
  the modeled `Err`, never an unmodeled defect (a defect is a bug, not an
  absent value).
- **A failure-observer throw preserves the original failure.** A throw inside
  `tapErrCases` / `tapDefect` / `tapFailure` / `flatTapErrCases` produces a `Defect` whose
  cause is an `AggregateError([thrown, original])` — observing a failure never
  destroys it. (A throw in the success-channel `tap`/`map` keeps the plain
  thrown cause.) An **observer branch returning the injected `defect(cause)`
  marker** — in `tapErrCases` (always writable) or in `flatTapErrCases` (only
  under a `returnType` pin, which its constraint otherwise rejects) — takes the
  **same** route: it is the lint-clean, expression-position form of a `throw`,
  so it must not behave differently from one. In particular `tapErrCases` does
  **not** discard it, even though it discards every other branch return — a
  marker is a control-flow signal, not a value. (A branch returning a Defect-state
  _`Result`_ is a different act — an effect that blew up on its own — and keeps
  the documented short-circuit: it replaces the error, unaggregated.)
- **Thenable callback returns are rejected at compile time — where a rejection
  could bypass qualification or vanish.** Every combinator callback not already
  constrained to return a `Result` (`map`, `tap`, `let`, `tapDefect`,
  `tapFailure`, `ensure`'s `onFail`) intersects its return with
  `NotThenable<R>`, so an `async` callback is a compile error (an async
  `ensure` predicate already fails its `boolean` return type — a `Promise`
  would be always-truthy). Among the error-matcher combinators, the
  **awaiting** ones — `flatMapErrCases` / `flatTapErrCases` — reject an async branch via
  their builder-output constraint (an awaited rejection would bypass
  qualification), and so does the observer **`tapErrCases`** (its branch results are
  **discarded** — bar the `defect(…)` marker — so a rejected `Promise` would
  float unobserved; same
  builder-output `NotThenable` constraint). The **non-awaiting** transformers
  `mapErrCases` / `recoverErrCases` run
  the matched branch **synchronously with no await**, so an async branch is
  merely a visible `Promise`-valued result, not a rejection bypass — they do
  not ban it. The boundary `qualify` is constrained the same way, with a
  runtime belt-and-braces: a thenable slipped past the types becomes a
  `Defect` and its orphaned rejection is silenced (see Thesis #3). `match`
  handlers are deliberately exempt (edge elimination). `NotThenable` is spelled
  `[Extract<R, PromiseLike<unknown>>] extends [never]`, **not** the tuple-wrapped
  `[R] extends [PromiseLike<…>]`: the latter is false for a PARTIAL union, so a
  _sometimes_-async callback (`flag ? 1 : work()`) compiled on every guarded
  surface — still an unawaited effect whose rejection the pipeline never sees.
  Same reasoning `fromPromise`'s async-qualify guard always used; the type
  itself only picked it up in 5.1. Guarded in `types.test-d.ts`.
- **A sync boundary's `fn` is sync too — enforced at RUNTIME, not by the
  types.** `fromThrowable` / `fromSafeThrowable` wrap a synchronous function, so
  they only ever see a synchronous `throw`: an `async` `fn` rejects long after
  the boundary has returned, and its rejection can never reach `qualify`. Left
  alone that produced `Ok(<Promise>)` — un-triaged — whose rejection then floated
  as an unhandled rejection (process-fatal on Node by default). Both helpers now
  probe the return value and mint a **`Defect`** for a thenable, adopting and
  silencing the orphan — the sibling of `qualifyToResult`'s thenable-`qualify`
  net. Deliberately **not** a compile error, unlike every other thenable ban:
  `T & NotThenable<T>` on `fn`'s return makes a _generic_ function unassignable,
  so `fromSafeThrowable(structuredClone)` would stop compiling with `T` collapsed
  to `unknown` (the `fromPromise` phantom rest-tuple guard fares worse still).
  The type therefore over-states the success channel — `Result<Promise<T>, E>` is
  spellable but never inhabited — the mirror of `recoverErrCases`'s `never`
  under-stating the error channel. Guarded in `interop.spec.ts`.
- **`fromExecutor`'s executor is sync too — enforced at RUNTIME, the sibling of
  the `fromThrowable` rule above.** An `async` executor **compiles**: TypeScript's
  void-return special case accepts a `Promise<void>` against a `=> void`
  annotation. Neither escape works — `<T, E, R>` with `R & NotThenable<R>` makes
  the primary call form `TS2558: Expected 3 type arguments, but got 2` (there is
  no partial type-argument inference), and defaulting `R = void` to fix that
  pins `R` to the default instead of inferring `Promise<void>`, so the ban never
  fires. So the returned thenable is adopted and its rejection **settles a
  `Defect`** unless the executor already settled — strictly better than
  `new Promise`, which drops the same throw as a floating rejection. Guarded in
  `interop.spec.ts` and `invariants.spec.ts`; the `TS2558` regression is guarded
  in `types.test-d.ts`.
- **A DISCARDED thenable is adopted, so its rejection never floats.** The
  observers (`tap`, `tapErrCases`, `tapDefect`, `tapFailure`) throw their
  callback's return away, and the `Result`-returning combinators reject a
  non-`Result` one — so a thenable that slipped past `NotThenable` (a cast, a
  raw-JS caller) was dropped mid-flight and its later rejection floated
  unhandled (process-fatal on Node by default). Worse for an observer: its whole
  job is to surface a failure, and that was the one path where the failure was
  invisible. Every such site now routes the discarded value through
  `silenceIfThenable`, the combinator-side sibling of the boundary nets in
  `interop.ts`. Silencing changes no outcome — the observed result passes through
  unchanged. Guarded in `invariants.spec.ts` (each case verified to fail without
  the net).
- **Result instances are frozen — and so is the machinery around them.**
  `okRes`/`errRes`/`defectRes` return `Object.freeze`d objects, so a variant
  cannot be forged by mutation; the `readonly` types are real at runtime.
  `Res.prototype` and `AsyncRes.prototype` are frozen too (the shared
  combinators can't be swapped out from under every instance), `AsyncRes`'s
  wrapped promise is a native `#private` field, and the qualify-time `defect`
  marker is frozen.
- **`match`'s `errCases` matcher is type-forced exhaustive — and the catch-all
  is provably exhaustive even over a generic `E`.** For well-typed concrete
  callers a missing branch does not compile; a rogue value slipping past the
  types throws `NonExhaustiveError` (see above). The catch-all `.with(P._, …)`
  arm is a **state transition** (an overload keyed on the statically-universal
  `UniversalPattern` type returning `Matcher<E, never, …>` — literal `never`,
  no deferred `Exclude`), so a catch-all-terminated builder compiles inside
  code **generic in `E`** — the fix for #145; tag/pattern arms alone remain
  correctly unprovable over an unresolved type parameter. This is why `P._`
  survives the de-promotion in Thesis #5 for the generic-`E` case: it is the
  **only** arm that can terminate a match over an unresolved `E` (even a
  universal `P.when` guard is excluded from the overload by the
  `UniversalPattern` marker), so the generic-`E` helper keeps it behind a
  targeted `oxlint-disable … unthrown/no-catch-all-pattern` naming that
  reason. (The other sanctioned use — an `E` that is a single type, not a
  union of cases, with no discriminant to name arms against — needs no such
  proof: there is nothing to enumerate, so the one catch-all arm already **is**
  the enumeration, disabled the same way.)
  Library code that
  folds a generic `Result<T, E>` per-channel (the interop `to*` bridges,
  `@unthrown/orpc`'s `handlerResult`) still uses the `isOk` / `isErr` /
  `isDefect` guards — the simplest shape when no per-case branching is needed.
  Concrete application code uses `match` normally.
- **`get()` / `getErr()` are type-gated.** `get()` compiles only when the
  error channel is empty (`this: Result<T, never>`); `getErr()` only when the
  success channel is empty (`this: Result<never, E>`). Eliminate the opposite
  channel first (`match` / `recoverErrCases` / `flatMapErrCases`), or use the `getOr` /
  `getOrElse` / `getOrNull` / `getOrUndefined` family (which recover an `Err`).
  On a `Defect` they still **rethrow the original `cause`** (they _panic_) with its
  original stack — so `Result<T, never>` means the modeled error channel is empty,
  **not** that `get()` cannot throw. The `GetError`-on-wrong-variant branch
  remains at runtime as a defensive guard but is **unreachable through well-typed
  code** (only a cast or a raw-JS caller can reach it).
- **`recoverErrCases` returns `Result<T | U, never>`, and `never` means only the _error_
  channel is empty — a `Defect` can still be present at runtime.** This is the one
  place the type intentionally under-describes the runtime. Do not read `never`
  as "total".
- **An `AsyncResult`'s internal promise NEVER rejects.** Every rejection or
  thrown value is captured as `Err` (via `qualify`) or `Defect`. `await`-ing an
  `AsyncResult` always yields a `Result` and never throws.

## Public surface (implemented in packages/core/src/, split into focused modules)

`Result<T, E>` is a **discriminated union** — `{ tag: "Ok"; value } | { tag:
"Err"; error } | { tag: "Defect"; cause }`, each intersected with the shared
method surface — so it matches **natively** (a `switch` on `tag`, or the
built-in `match(r).with({ tag: "Ok" }, …).exhaustive()`) **and** chains
fluently. The payload is reachable only after narrowing, so "check before you
access" still holds.

`AsyncResult<T, E>` shares that method surface as an awaitable wrapper typed
`Awaitable<Result<T, E>>` — a **success-only thenable**, not a full `PromiseLike`
(its internal promise never rejects, so there is no rejection channel to model).
Its **combinator callbacks are synchronous** (no raw `Promise` — see Thesis #3);
async work re-enters via `fromPromise` / `fromSafePromise` and composes with
`flatMap`. `await` collapses an `AsyncResult` to a `Result` (then match it).

- success: `map`, `flatMap`, `tap`, `flatTap` (a failable `tap` — runs a
  `Result`-returning effect, keeps the original value, threads the effect's
  error), `ensure` (validate a success or refine its type — keeps the same `Ok`
  when the predicate holds, else `Err(onFail(value))`, widening `E` to
  `E | E2`; a type-guard predicate narrows `T` to `U`), `as`, `discard` (drop
  the value — the success type collapses to
  `void`; the named form of `map(() => undefined)`, distinct from `as`)
- do-notation: `Do()` (entry — `Ok({})`, an empty object scope; capitalised
  because `do` is reserved) and `DoAsync()` (its pre-lifted async twin —
  `Do().toAsync()` without the boilerplate, aliased `AsyncResult.Do`) plus the
  methods `bind(name, f)` (sequence a
  `Result`-returning step, binding its value under `name` in an accumulating
  **readonly** object scope; errors union `E | E2`) and `let(name, f)` (bind a
  pure value). On `AsyncResult`, `bind`'s `f` may return a `Result` or an
  `AsyncResult`. A throw in either becomes a `Defect`; `Err`/`Defect`
  short-circuits/passes through. To go async, lift with `toAsync()`.
- error: `mapErrCases`, `flatMapErrCases`, `recoverErrCases`, `tapErrCases`, `flatTapErrCases` all take
  the Thesis-#5 **matcher callback** `(m: ErrMatcher<E>, defect) => M`
  where `M extends ExhaustiveMatch<…>` (the callback returns the un-terminated
  builder; the combinator runs `.run()`). Outgoing types are computed from the
  builder output `MatchOut<M>` — mapErrCases: `MatchErrOut<M>` (= `Exclude<MatchOut,
Defect>`); flatMapErrCases: `OkOf`/`ErrOf` — plus `AsyncOkOf`/`AsyncErrOf` on the
  async surface — over it; recoverErrCases: `T | MatchErrOut<M>` with `E = never`.
  `flatTapErrCases` is the exception: it infers a plain `E2` from the builder output
  and returns `E | E2` (the `MatchOut<M>` shape unioned with the class `E`
  defeats variance measurement of the intersection `AsyncResult` — see internal
  design). The `defect` helper is passed to every branch (the deliberate
  `Err`→`Defect`); `tapErrCases`/`flatTapErrCases` keep the same exhaustive builder (the
  error passes through), the error-channel mirror of `tap`/`flatTap`
- defect: `recoverDefect`, `tapDefect`
- failure (both KO channels): `tapFailure` — the one cross-channel combinator:
  runs its observer on `Err` **or** `Defect`, passing the discriminated failure
  variant (`FailureView<E, T>` = `ErrView | DefectView`; the variant, not a
  payload, because `E | unknown` would collapse to `unknown` — the callback
  narrows on `tag`). Observe-only by design: there is deliberately **no**
  `recoverFailure` (frictionless defect recovery would erode the channel's
  meaning — recovering stays the separate `recoverDefect`; handling both for
  good is `match`), and no channel-moving operators (`Err`→`Defect` erases the
  modeled type; `Defect`→`Err` would put `unknown` in `E`, violating Thesis #1)
- eliminate: `match` (the `{ ok, defect }` handlers plus an `errCases` handler that
  takes the **exhaustive matcher** `(matcher) => matcher.with(…)` —
  same as the error combinators, but with no `defect` helper since `match` folds
  to a value; the folded type unions all branch returns), `get`/`getErr`
  (type-gated — `get` only compiles on
  `Result<T, never>`, `getErr` only on `Result<never, E>`; use `match` /
  `recoverErrCases` / `flatMapErrCases` to empty the opposite channel first), `getOr` (signature
  `getOr<U>(fallback: U): T | U` — widening, not narrowed to `T`), `getOrElse`
  (same `T | U` widening), `getOrNull`, `getOrUndefined` — the `getOr…`
  family extracts from a still-fallible `Result` with a fallback, since
  `get`/`getErr` won't compile on it. `getOrThrow` completes the `getOr…`
  family with a **deliberate escape hatch** — it **throws the modeled `error`
  as-is** on `Err` (and panics on a `Defect`, like the rest of the family). Its
  home is **tests and scripts**, where "this `Result` had better be `Ok`" is the
  assertion and a throw is the correct failure mode; it is **off the
  errors-as-values thesis** by design, so production code folds the channel
  instead — `recoverErrCases` empties `E` so `get()` compiles, with `match` /
  `flatMapErrCases` the other two ways to keep the error a value. The opt-in
  `@unthrown/oxlint` rule `no-get-or-throw` enforces that split, exempting test
  files through an oxlint `overrides` entry. It is type-gated as the
  **complement of `get`**: it compiles only when the error channel is **non-empty**
  (`E` is not `never`, spelled `this: [E] extends [never] ? never : Result<T,E>`) —
  on a `Result<T, never>` there is nothing to throw, so `getOrThrow` does not
  compile and `get()` is the tool. `get` and `getOrThrow` thus **partition**
  extraction by the error channel's state, with no overlap.
- no deprecated aliases: the extractor family is spelled **only** `get…`
  (`get`/`getErr`/`getOr`/`getOrElse`/`getOrNull`/`getOrUndefined`/`getOrThrow`).
  The old `unwrap`/`unwrapErr`/`unwrapOr`/`unwrapOrElse` aliases were **removed**
  (they were runtime-identical delegates); the error-channel aliases
  `orElse`/`recover` were removed earlier in the same major. One concept, one
  name — no deprecated surface survives into v5.
- matcher exports: `match`, `P`, and `NonExhaustiveError` come from the
  built-in `matcher.ts` (plus the types `Matcher`/`PatternMatcher`/
  `UniversalPattern`; the builder also carries `returnType<R>()`, which pins
  the output type — see Thesis #5). Every pattern constructor lives on `P`,
  `P.tag(t)` (the `{ _tag: t }` pattern, narrowing to the variant + payload)
  included — it is a pattern like `P.instanceOf` or `P.when`, so it is spelled
  like one; there is **no** standalone `tag` export. These make the error
  matcher, and matching a whole `Result` (`match(r).with({ tag: "Ok" }, …)`),
  first-class in one import — the former `@unthrown/pattern` package and the
  former `ts-pattern` re-exports, now one owned module.
- errors: `GetError` (from `core.ts`) is also a public export — the defensive
  wrong-variant error `get`/`getErr` throw, reachable only through a cast or a
  raw-JS caller (see the type-gated extractor invariant).
- guards: methods `isOk`/`isErr`/`isDefect` **and** standalone
  `isOk`/`isErr`/`isDefect` both narrow (to `OkView`/`ErrView`/`DefectView`) — the
  methods are `this is …` type predicates, so `if (r.isErr()) r.error` compiles.
  One narrowing concept, two call styles. Plus the standalone `isResult(x)` —
  narrows an `unknown` to `Result<unknown, unknown>` (an `instanceof` check
  first, with a `Symbol.for("unthrown.Result")` prototype-brand fallback so a
  `Result` from another copy of unthrown — dual CJS/ESM, duplicated install,
  cross-realm — still passes; a plain `{ tag: "Ok" }` look-alike carries
  neither and is not matched — see internal design), for untyped boundaries.
- types: `NotThenable<R>` — rejects a `PromiseLike` at the type level, so a
  combinator callback that returns one is a compile error instead of a silently
  unqualified rejection. `FailureView<E, T>` — the exported `ErrView | DefectView`
  union a `tapFailure` callback receives (error-type-first, like `ErrView`).
  `Settle<T, E>` — the settler a `fromExecutor` executor receives, exported for
  the same reason `ErrMatcher` and `@unthrown/prisma`'s `TransactionClient<C>`
  are: a helper factored out of the callback has to be able to name its
  parameter, and deriving it from the function (`Parameters<typeof
fromExecutor<T, E>>[0]`) is the grotesque spelling that invites a hand-copied
  drifting duplicate instead.
  `ErrMatcher<E>` — the built-in match builder over the error
  (`ReturnType<typeof match<E>>`, i.e. `Matcher<E, E, never>`).
  `OkOf<R>` / `ErrOf<R>` / `AsyncOkOf<R>` / `AsyncErrOf<R>` — public
  derive-a-type utilities extracting a `Result`/`AsyncResult`'s channels from a
  function's return type (also the machinery behind `flatMapErrCases`'s
  outgoing types).
  The supporting `ExhaustiveMatch`/`MatchOut`/`MatchErrOut` are exported for the
  d.ts but not re-exported from `index.ts`. `ExhaustiveMatch<O>` requires
  `.exhaustive` to be _callable_ (the builder types it as the branded
  `NonExhaustive<Remaining>` diagnostic while cases remain) and carries the
  output via `run: () => O`, from which `MatchOut`/`MatchErrOut` extract. Note
  `ErrMatcher<E>` should still appear only as a callback **parameter** type,
  never combined with the class `E` in a covariant return — the historical
  ts-pattern `Match` invariance forced that rule (and `flatTapErrCases`'s plain
  `E2` inference); the built-in `Matcher` is kinder but the discipline is kept,
  guarded by the `combine` inference regression guard — a compile-guard helper
  in `aggregate.spec.ts` (its `r.get()` only compiles while `E` infers `never`)
  plus the variance widen-guards in `types.test-d.ts`.
- constructors: `Ok` (a no-arg overload — `Ok()` — constructs a `void` success,
  `Result<void, never>`, sparing `Ok(undefined)`; `OkAsync()` mirrors it),
  `Err` (there is **no** `Defect` constructor — a defect-state
  `Result` arises only at boundaries; the qualify-time `defect` marker helper is
  injected, not exported), plus the **pre-lifted async** constructors `OkAsync` /
  `ErrAsync` — `Ok(v).toAsync()` / `Err(e).toAsync()` without the boilerplate, for
  the synchronous branch of an `AsyncResult`-returning function. They carry the
  `Async` **suffix** the async free functions use (`allAsync`); the `AsyncResult`
  companion aliases them as `AsyncResult.Ok` / `AsyncResult.Err` (suffix dropped,
  same rule as `AsyncResult.all`). A **deliberate** defect needs no constructor
  either — the `defect` helper is **injected wherever a triage decision is
  made, and nowhere else**: `qualify` at a boundary (Thesis #3), an executor
  passed to `fromExecutor` (the same sanctioned injection, `qualify`-free), and
  the error-match branches (Thesis #5). Elsewhere the syntax
  is `throw` (the throw → defect invariant is the safety net; a
  known-technical precondition throws in a plain helper wrapped once at its
  origin with `fromSafeThrowable`). A public minting helper was weighed and
  **rejected** in #77 — frictionless minting would let unmodeled-by-laziness
  failures erode the defect channel's meaning; scoping the injection to triage
  sites keeps that friction (the exhaustiveness IS the friction). Documented in
  the defect-channel guide.
- interop: `fromNullable`, `fromThrowable`, `fromSafeThrowable` (the sync
  mirror of `fromSafePromise` — every throw a `Defect`, `E = never`, no
  `qualify`; the named form of the `(c, d) => d(c)` boilerplate, an explicit
  "everything here is a defect" decision), `fromPromise`,
  `fromSafePromise`, `fromExecutor` (the callback-API boundary — this library's
  `new Promise`, whose settler takes a **`Result`** so the caller names the
  variant: no `qualify`, and no `unknown` can reach `E`. The `defect` helper is
  injected alongside it, the triage-site rule of Thesis #3, and is the only route
  to the defect channel from inside an asynchronous callback. `T`/`E` come from
  explicit type arguments or an annotated target — a settler is a parameter, so
  nothing infers them; both default to `never`, so supplying neither is a
  compile error at the `settle(...)` call rather than an `unknown` channel. An
  executor that never settles never resolves, the one
  hazard `fromPromise` does not have.)
- aggregate: `all` / `allAsync` take a **tuple/array** (a fixed tuple keeps
  positional types; a dynamic `Result<T, E>[]` / `AsyncResult<T, E>[]` collapses
  to `Result<T[], E>` / `AsyncResult<T[], E>`), while `allFromDict` /
  `allFromDictAsync` take a **record** keyed by name (`{ a: Result<A, E> }` →
  `Result<{ a: A }, E>`) — named parallel work without tupling. Array and record
  are **separate functions**, not one overload (positional vs named is a distinct
  concept). All four short-circuit on the first `Err`, let any `Defect` dominate,
  and are **not** error accumulation (which stays deliberately excluded);
  `allAsync` / `allFromDictAsync` resolve concurrently (order preserved) and never
  reject. The record fold writes keys via `Object.defineProperty`, so a
  caller-supplied `"__proto__"` key can't pollute the prototype.
- facade: two companion objects alias the standalone entry points, **grouped by
  what they return** so a static lives in exactly one namespace. `Result.*` holds
  the `Result`-producing ones
  (`Result.Ok`/`Err`/`Do`/`fromNullable`/`fromThrowable`/`fromSafeThrowable`/`all`/`allFromDict`/`is*`);
  `AsyncResult.*` holds the `AsyncResult`-producing ones
  (`AsyncResult.Ok`/`Err`/`Do`/`fromPromise`/`fromSafePromise`/`all`/`allFromDict` —
  the pre-lifted entry points and aggregates drop the `Async` suffix the free
  functions carry (`OkAsync`→`AsyncResult.Ok`, `DoAsync`→`AsyncResult.Do`,
  `allAsync`→`AsyncResult.all`), since the
  namespace already says async). Both are value+type companions (the value and
  the `Result<T,E>` / `AsyncResult<T,E>` type share one name). The free functions
  remain the primary, tree-shakeable API; the companions are opt-in sugar (only
  code importing a companion value forgoes tree-shaking). One concept, two import
  styles — not a second concept. (Each companion re-aliases its type in
  `facade.ts`, so the `types.ts` `Result`/`AsyncResult` declarations both sit in
  `docs/typedoc.core.json`'s `intentionallyNotExported`.)
- method surface: the fluent combinators live on two exported, **documentation-only**
  object-literal types — `ResultMethods<T, E>` (the sync surface every `Result`
  variant intersects) and `AsyncResultMethods<T, E>` (its async mirror, with
  `AsyncResult`-returning / `Promise`-returning signatures) — both under a
  `Methods` category. They are not meant to be authored against (you get the
  surface by holding a `Result`/`AsyncResult`), but they **are** rendered so the
  API reference lists every combinator's signature and prose. `Result` /
  `AsyncResult` stay value+type companion pairs (value and type share one name,
  declared together in `facade.ts`), so their public type is a re-alias TypeDoc
  can't hang a method list on — that is _why_ the surface is factored out and
  documented on the separate `*Methods` types, which the `Result` / `AsyncResult`
  aliases and the `OkView`/`ErrView`/`DefectView` variants link to. The async
  method docs link back to their sync `ResultMethods` counterpart and state the
  async delta. The `docs/reference/combinators.md` page (the docs site follows
  the Diátaxis layout — `tutorial/`, `how-to/`, `reference/`, `explanation/`)
  remains the "by intent" selection cheat-sheet — one table covering both — and
  links to these API sections. `docs/typedoc.core.json` sets an explicit `categoryOrder` (`Facade`,
  `Types`, `Methods`, `Constructors`, … then `Aggregate`, `Errors`) so the core
  surface leads the API reference instead of the default alphabetical order.
- tagged errors: `TaggedError(tag, options?)` (the error-class factory; optional
  `options.name` sets `Error.name` independently of the `_tag` discriminant, so a
  tag can be namespaced for collision-safety without leaking into the display
  name; the payload reserves `name`, `message`, **and** `stack` via `?: never`
  (`cause` stays allowed — see Thesis #4), so the
  message is set per subclass with `override message = "…"`, never as a payload
  field). The matching half is `P.tag(t)` (the `{ _tag: t }` matcher pattern,
  for use in the error matchers, in `match`'s `errCases` handler, and in
  `match(result)`) — it sits with the other pattern constructors, not with
  `TaggedError`; see the
  `TaggedError` convention in Thesis #4. The supporting types
  `TaggedErrorConstructor` / `TaggedErrorInstance` are exported too — they type
  an `extends TaggedError(…)` site from the outside. **There is no `matchTags`** — a per-tag
  exhaustive fold over a tagged error union is `result.match({ ok, defect, errCases:
(matcher) => matcher.with(P.tag("…"), …) })`, which generalises beyond `_tag` to
  any discriminant.

Deliberately **excluded** for now: **generator** do-notation (`gen`/`yield*`
"safeTry" style — the fluent `Do`/`bind`/`let`/`DoAsync` above covers sequential
code without the generator machinery), accumulation/`Validation`,
**serialization** (a `Result` does not survive `structuredClone`/JSON by design
— fold with `match` at the boundary and re-enter through a constructor/boundary
on the other side), and aliases
(`andThen`, etc. — one name per concept). Keep the surface small enough that the
library can be "done".

## Internal design (don't break these)

- **`Result` / `AsyncResult` are the public types; `Res` / `AsyncRes` are the
  internal classes** (in `core.ts`, **never re-exported from `index.ts`**).
  `Result` is a discriminated union (`{ tag; value/error/cause } & methods`) where
  each variant is `Res` (a method holder, like boxed's `__Result`) intersected
  with its `tag`/payload. `Res` is **never `new`'d**: the builders
  `okRes`/`errRes`/`defectRes` create instances with `Object.create(Res.prototype)`
  and return them as the variant type (`OkView`/`ErrView`/`DefectView`) — so a
  builder yields a value that already _is_ a union member, with **no construction
  cast**. `Res` methods type `this` as `Result<T, E>` and narrow on `tag`. The
  type-changing pass-throughs (`map` reusing an `Err` as a differently-typed
  `Result`) **all funnel through one `passThrough` helper** — a single sound
  `as unknown as` in one place (boxed instead casts inline at every branch), since
  the passed-through variant carries no value of the changed success type. We
  deliberately **do not reconstruct** the variant (neverthrow's approach) — that
  would allocate a fresh object on every short-circuit. The only other casts are
  the `bind`/`let` scope merge (a computed key widens to an index signature, so it
  can't be spelled at the type level), the builder construction noted above, and
  the error-matcher internals noted below.
- **Declared variance is load-bearing at every layer: `ResultMethods` /
  `AsyncResultMethods` / `Awaitable` carry `out` annotations, and the variant
  views (`OkView`/`ErrView`/`DefectView`) plus `AsyncResult` are
  `interface … extends` — NOT intersection aliases — precisely so they can carry
  verified `out T, out E` annotations of their own** (the one sanctioned use of
  `interface` in core, each with a targeted oxlint-disable). An intersection
  can't be annotated (TS2637) and gets its variance measured _structurally_ —
  where the matcher signatures make `E` invariant — so the intersection form
  silently loses the covariance for unresolved-generic targets: a concrete
  `Err(x)` then fails to widen into a generic error union
  (`Result<T, G | RuntimeError>`), which is exactly the v5-beta regression this
  shape fixed. v4 didn't need any of this: its plain `(e: E) => …` callbacks sat
  in bivariantly-compared method-parameter positions (the same reason
  neverthrow's class surface widens without annotations); the exhaustive matcher
  is what made declared variance mandatory. TS **verifies** every annotation
  (TS2636 if unprovable); `Result` (a union of the annotated views) inherits the
  fast path. **`ErrMatcher<E>` (the built-in `Matcher`,
  invariant in its input) must stay in a callback parameter position only**: it
  is contravariant there and harmless, but unioning an `M`-derived output with
  the class `E` in a covariant return re-invaded `E`'s variance and collapsed
  inference (`combine<T,E>(rs: AsyncResult<T,E>[])` inferring `unknown`) — which
  is exactly why `flatTapErrCases` infers a plain `E2` from the builder output and
  returns `E | E2` rather than `E | ErrOf<MatchOut<M>>`.
- **Inference-bearing parameters stay free of conditional types.** The
  async-qualify ban on `fromPromise` is a **phantom rest-tuple guard** (an async
  qualify demands an impossible extra argument carrying the message; a
  `[R] extends [never]` carve-out keeps an always-throwing qualify legal) — NOT
  `R & NotThenable<R>` on the qualify's return: that conditional made TS defer
  qualify's inference and collapse `T` to `unknown` when the promise argument
  was an inline `.then(…)` chain (a v5-beta regression; v4's identical
  union-parameter signature was fine without the conditional). `fromThrowable`
  keeps `NotThenable` on its qualify — its `T` infers directly from `fn`, so
  nothing is disturbed. General rule: a conditional-type constraint may sit on a
  parameter only if no _other_ parameter's inference can be deflected by it;
  otherwise encode it as a trailing phantom guard.
- **Error-matcher runtime.** All five error methods dispatch through one
  `runMatch` helper: `f(match(error), defect).run()` — build `match(error)`,
  hand it (plus `defect`) to the callback, and `.run()` the returned builder
  (which executes `.exhaustive()`). Type-forced exhaustive for well-typed
  callers; a value slipping past the types throws `NonExhaustiveError`, which the
  caller's `try/catch` turns into a `Defect`. `Res`'s methods keep the precise
  generic-`M` signatures; `AsyncRes`'s five are typed **loosely** (`never`
  channels, bivariantly compatible) because TS cannot unify the generic matcher
  signatures across the class/`implements` boundary — the public
  `AsyncResultMethods` re-imposes the precision, the same pattern as `get`'s
  re-imposed `this` gate. `AsyncOkOf`/`AsyncErrOf` infer through the `Awaitable` `then`
  channel only (`R extends Awaitable<infer Res>`), NOT `R extends
AsyncResult<infer T, …>` — structural inference over the whole method surface
  would pick up junk candidates. The **plain async binds** (`flatMap` / `flatTap`
  / `bind`) hit the same hazard from the other direction: destructuring `U`/`E2`
  through an `AsyncResult<U, E2>` union member in the callback-return position
  collapsed them to `unknown` when the callback returned a value typed as the
  opaque `AsyncResult` alias. So their async branch is spelled
  `Awaitable<Result<U, E2>> & { flatMap: unknown }` — inference runs through the
  `Awaitable` then-channel (junk-free), and the `{ flatMap: unknown }` marker
  keeps a bare `Promise<Result>` out (a Promise has no `flatMap`, so a raw
  rejection still can't bypass qualification). The error channel stays a **plain**
  `E | E2` — deriving it as `E | ErrOf<R> | AsyncErrOf<R>` re-invaded `E`'s
  variance (the same `out E` collapse `flatTapErrCases` avoids), so `flatMap` keeps
  the plain `E2`. Keeping the `<U, E2>` shape (rather than inferring a whole
  `R`) also means the precise `AsyncRes` impl signatures conform to the public
  type unchanged — no loosening needed for these three.
- "Check before you access" is enforced by the union: `result.value` only
  type-checks on the `Ok` variant. `AsyncRes` operates purely on the public
  `Result` union (wraps a `Promise<Result>`, branches on `r.tag`), never on `Res`
  internals.
- **`AsyncRes` delegates every non-awaiting combinator to its sync twin**, via
  one private `#lift(f)` = `new AsyncRes(this.#promise.then(f))`. `map`, `tap`,
  `let`, `as`, `discard`, `ensure`, `mapErrCases`, `recoverErrCases`,
  `tapErrCases`, `tapDefect` and `tapFailure` are exactly their `Res`
  counterparts applied to the settled `Result` — same tag check, same
  throw→defect net, same observer aggregation — so restating them was two copies
  of one behaviour that could drift apart. A fix to the sync combinator is now
  the fix to the async one. The **six that genuinely differ** stay written out in
  full: `flatMap`, `flatTap`, `bind`, `flatMapErrCases`, `flatTapErrCases` and
  `recoverDefect` each `await` a callback result that may be an `AsyncResult`,
  which the sync surface has no way to express. Loose-typed methods keep their
  documented cast at the delegation site (`ensure` and the matcher four — see the
  `implements`-boundary note above).
- **`isResult` is `instanceof` first, `Symbol.for` prototype-brand fallback
  second.** The core's own dual CJS/ESM build (or a duplicated install, or
  another realm) can put two copies of `Res` in one process; since the
  aggregates and `Result`-consuming combinators harden non-`Result`s into
  Defects, an `instanceof`-only guard would turn the _other copy's_ genuine
  `Result` into a `Defect`. So `Res.prototype` carries a non-enumerable
  `Symbol.for("unthrown.Result")` brand (defined before the prototype is
  frozen) and `isResult` falls back to reading it off the prototype chain.
  Accidental forgery stays excluded — a structural look-alike has no brand;
  producing one requires deliberately minting the shared symbol.
- **Builders are free functions** (`Ok`, `Err`, …) because they tree-shake — and
  every shipped package sets `"sideEffects": false` so bundlers can prune between
  modules (the sole exception is `@unthrown/vitest`, whose top-level
  `expect.extend` registration is a genuine import-time effect). A `bundle-size`
  CI job reports the per-package `dist` sizes to the run summary — it is
  informational (no threshold), not a hard gate. The `Result` companion
  object is additive sugar (value + type share the name via a re-alias in
  `facade.ts`); it must stay a separate export so `import { Ok }` never pulls it
  in.
- **`AsyncResult` is `Awaitable<Result<T,E>>`, not `PromiseLike`.** Its `then`
  stays a runtime thenable (so `await` collapses it) and forwards `onrejected`
  defensively, but the type advertises no rejection channel — because the internal
  promise never rejects.
- **Source layout** (`packages/core/src/`): `types.ts` (public types), `defect.ts`
  (the `Defect` marker), `core.ts` (the `Res`/`AsyncRes` engine + `GetError`),
  `constructors.ts` (`Ok`/`Err` + guards), `do.ts` (the `Do()` do-notation entry
  — the `bind`/`let` steps themselves live on the method surface in `core.ts`),
  `interop.ts` (`from*`/`qualify`/`all`), `facade.ts` (the `Result` object),
  `tagged.ts` (`TaggedError`), `matcher.ts` (the built-in matcher —
  `match`/`P` (`P.tag` included)/`NonExhaustiveError` + the `Matcher` types),
  and `index.ts` (the
  curated public re-exports — the one place the API is decided).

## Monorepo layout

Every companion package **peers on `unthrown`** (`workspace:^` in
`peerDependencies`, kept in `devDependencies` for the workspace build; pnpm
rewrites it to a real `^` range at publish). As a regular dependency the
package manager was free to fork the tree into two `unthrown` copies, which
diverge in both type and runtime identity (`isResult` compares across
copies) — issue #256, observed live in btravstack/start#99.

- `packages/core` → `unthrown` (**zero runtime dependencies** — the exhaustive
  error matcher is built-in (`matcher.ts`, exported as `match`/`P`/
  `NonExhaustiveError`); it replaced the former `ts-pattern` peer so the
  exhaustiveness guarantee can never vary with a consumer-resolved third-party
  version, and nothing needs installing alongside `unthrown`)
- `packages/vitest` → `@unthrown/vitest` (peerDep `vitest`; besides the
  `expect.extend` registration it also exports the seven raw matcher functions,
  `failOnForgottenAwait`, and the `UnthrownMatchers` type — for manual
  `expect.extend` wiring)
- `packages/saga` → `@unthrown/saga` (peerDep `unthrown`; one export,
  `SagaAsync()` — a sequence whose steps carry compensating undos, unwound
  **LIFO** the moment one fails. `step(run, undo?)` takes **thunks** (an
  `AsyncResult` starts on construction, so an eagerly-built undo would run
  whether or not it was needed — the hazard `unthrown/no-async-result-race`
  exists for), `run()` answers the LAST step's value, and the failure comes
  back **unchanged** so a caller triages what it would have without the saga.
  `run` takes no argument; `undo` receives its own step's value, and either may
  answer a plain `Result` in place of an `AsyncResult`. An `undo` answers
  `unknown` in the Ok channel and `never` in the Err one: compensation may not
  invent a new way to fail, because the caller
  is already handling the one that triggered it. The single exception is a
  **defect inside an undo** — it wins over the failure that triggered it (a
  compensation that broke is the more urgent report) and every remaining undo
  still runs first. Pure control flow: no timers, no clock, no randomness, so
  it replays deterministically inside a workflow sandbox. It is a **satellite
  package rather than a core export** because it is a pattern built on the
  public surface — it operates no channel core does not already expose — and
  core is a finishable library: a saga in the root would invite a retry
  algebra and a scheduler beside it. Built on `unthrown`'s public API only, so
  the boundary is checked by the compiler rather than by review.)
- `packages/effect` → `@unthrown/effect` (peerDep `effect`)
- `packages/neverthrow` → `@unthrown/neverthrow` (peerDep `neverthrow`)
- `packages/boxed` → `@unthrown/boxed` (peerDep `@bloodyowl/boxed` — Boxed's
  maintained scope; `@swan-io/boxed` is the deprecated former name)
- `packages/standard-schema` → `@unthrown/standard-schema` (dep on the
  types-only `@standard-schema/spec`; bridges Zod/Valibot/ArkType validators to
  `Result` via `fromSchema` / `fromSchemaAsync`, with the validation issues as
  the modeled `E`)
- `packages/oxlint` → `@unthrown/oxlint` (an oxlint **JS plugin**, peerDep
  `oxlint`, dep `@oxlint/plugins`; ships **eight rules** — six in the
  `recommended` preset (`no-ambiguous-error-type`, `no-async-result-race`,
  `no-catch-all-pattern`, `no-unhandled-result`, `no-unused-matcher`,
  `prefer-async-result`) plus the
  opt-ins `no-get-or-throw` and `no-throw`. Purely syntactic AST rules. No TypeDoc API page;
  documented in the Linting guide. Full spec: `packages/oxlint/CLAUDE.md`.)
- `packages/prisma` → `@unthrown/prisma` (peerDep `@prisma/client` ^7; a Prisma
  Client **extension** — `$extends(unthrownPrisma)` adds `try*` `AsyncResult`
  variants of all seventeen model delegate operations, plus `$tryTransaction`
  and `tryPaginate`. `E` carries only the three domain P-codes; every
  infrastructure failure is a `Defect`. **Outside the fixed version group**,
  and the one package on `node >=20.19`. Full spec:
  `packages/prisma/CLAUDE.md`.)
- `packages/drizzle` → `@unthrown/drizzle` (peerDeps `drizzle-orm` `^1.0.0-rc`
  and `pg` `^8.16.0`; **replaces** the stock `drizzle-orm/node-postgres`
  database rather than wrapping one, so every method already speaks
  `AsyncResult` and there is no `try*` prefix. Five integrity-constraint
  SQLSTATEs are modeled, everything else is a `Defect`; reads infer
  `E = never`, enforced at runtime. **Outside the fixed version group.** Its
  suite is the one that needs a running Docker daemon. Full spec:
  `packages/drizzle/CLAUDE.md`.)
- `packages/orpc` → `@unthrown/orpc` (peerDeps `@orpc/client` + `@orpc/server`
  at `^2.0.0-beta`, the server one optional; a two-way bridge on oRPC v2's
  returned-`ORPCError` inference — `Ok` ↔ output, `Err` ↔ a returned inferable
  `ORPCError`, `Defect` ↔ everything else. Three entry points, no root export.
  **Outside the fixed version group.** Full spec: `packages/orpc/CLAUDE.md`.)
- shared config is **external**, not a workspace package: the tsconfig and
  typedoc bases come from the catalog dependencies `@btravstack/tsconfig` and
  `@btravstack/typedoc` (alongside `@btravstack/oxlint`, `@btravstack/commitlint`,
  `@btravstack/lefthook` and the docs' `@btravstack/theme`). There is no
  `tools/` directory — `pnpm-workspace.yaml` declares `packages/*`, `examples/*`
  and `docs`.
- `examples/*` are **private, runnable examples**, not published packages —
  `@unthrown/example-checkout-domain`, `@unthrown/example-checkout-persistence`,
  `@unthrown/example-checkout-api`, modelling one checkout between them so each
  package can show a different job the library does (the error union and `Do`
  sequencing; `@unthrown/prisma`'s read/write error shapes; the oRPC edge with
  no `try`/`catch`), plus the standalone `@unthrown/example-existing-errors`,
  which uses **no `TaggedError` at all** — a `kind`-discriminated class
  hierarchy, a plain `code` union, and untagged third-party classes matched
  with `P.instanceOf` — because "`TaggedError` is a convention, not a
  requirement" is a claim about the type system that prose alone lets rot
  (#235). Every guide snippet is hand-written prose, checked by
  review and nothing else, so it drifts silently; these are workspace packages
  instead — real imports of `unthrown` and its satellites through their
  published entry points, typechecked and tested in CI, so a breaking change
  turns one red rather than leaving a stale snippet uncaught. Each is
  `private: true` with **no `build` script** — they are consumed as source,
  never published, so there is nothing to build and no changeset to add.
  `private: true` already keeps them off npm, but changesets **versions** a
  private package by default, so bumping a satellite they depend on bumped
  their version, wrote them a `CHANGELOG.md`, and listed
  `@unthrown/example-checkout-persistence@0.0.1` under **Releases** in the
  release PR — a package name that does not and must not exist on the registry
  (#220). `.changeset/config.json` therefore sets
  `privatePackages: { version: false, tag: false }`, which pins every example
  (and `docs`) at `0.0.0` with no changelog.
  `typecheck` runs on all four; `test` runs where no external infrastructure
  is required (`checkout-domain`, `checkout-api` and `existing-errors` are pure;
  `checkout-persistence`
  runs against Prisma's in-memory SQLite, the same pattern `@unthrown/prisma`'s
  own suite uses). Each has an annotated walkthrough in `docs/examples/`, linked
  from `examples/README.md`. They double as a **conformance fixture** for the
  dogfooded oxlint preset — `no-catch-all-pattern` included, so none of their
  error matches reaches for `P._`.
- `docs` → `@unthrown/docs`, the VitePress site (guide + TypeDoc-generated API
  reference). **TypeDoc runs from here, not from the packages** — it needs its
  own TypeScript (see the toolchain section). One `typedoc.<name>.json` per
  documented package points its `entryPoints`/`tsconfig` back at that package's
  sources and writes straight into `api/<name>/`; `scripts/build-api.ts` runs
  the nine concurrently. There is no per-package `build:docs` and no copy step.
  Only `core`, `drizzle` and `orpc` keep a `typedoc.<name>.json` of their own —
  they carry a `categoryOrder`, an `intentionallyNotExported`, or several entry
  points (`orpc` has no root export at all). The other six differ solely in
  name/entryPoints/tsconfig/out, so they share `typedoc.base.json` and take
  those four on the command line from `build-api.ts`, which derives them from
  the directory name (CLI arguments beat the options file).
  The package list is repeated in three places that must stay in sync:
  `build-api.ts`, `@unthrown/docs#build`'s `dependsOn` in `turbo.json`
  (explicit `<pkg>#build` edges — `docs` no longer _depends_ on the packages, so
  `^build` would resolve to nothing, but it still needs them built for a
  cross-package import inside a documented source to resolve), and the `/api/`
  sidebar in `.vitepress/config.ts`. Deployed to
  GitHub Pages by `deploy-docs.yml` — **versioned**:
  while a prerelease is in progress (`.changeset/pre.json` on main) the site is
  built twice, the latest stable tag's docs at the root (the default) and main's
  under `/beta/`, linked by a nav version dropdown (`DOCS_BASE` /
  `DOCS_VERSIONS` env in the VitePress config). With no prerelease, main
  deploys alone to the root as before

Core has **no runtime dependencies** (the error matcher is built-in). Never
pull `vitest` or any interop peer (`effect`, `neverthrow`, `@bloodyowl/boxed`,
`@orpc/*`, `drizzle-orm`, `pg`) into core.

Every satellite package depends on core via `workspace:^` (an exact pin would
create a dual-copy hazard with the `instanceof`-based `isResult`); for the same
reason, `@unthrown/vitest` takes core as a **peerDependency**, not a regular
dependency. Every published package carries `engines: { node: ">=20" }`
(`@unthrown/prisma` alone raises it to `>=20.19`, Prisma 7's floor), ships
its own `LICENSE`, and sets `files: ["dist"]`.

### Interop packages (`packages/effect`, `packages/neverthrow`, `packages/boxed`)

Thin `to*`/`from*` bridges between `Result`/`AsyncResult` and a neighbour's
types. One rule decides their shape: **does the neighbour have a defect
channel?**

- **Effect does** (`Cause.die`), so `Result ↔ Exit` is a genuine **bijection**
  (`Ok↔succeed`, `Err↔Cause.fail`, `Defect↔Cause.die`). `fromExit` lets a
  `Defect` **dominate** a modeled failure in a composite cause (same rule as
  `all`). `toEither` has no defect target, so it takes a mandatory `onDefect`.
- **neverthrow and Boxed do not.** Coming _in_, results are only `Ok`/`Err` —
  never a `Defect`. Going _out_, every `to*` takes a **mandatory `onDefect:
(cause) => E`** (forced triage, Thesis #3): a defect is never silently folded
  into `E`. There is no one-arg form.
- The async-direction names are **deliberately asymmetric** —
  `toNeverthrowAsync` / `toBoxedFuture` — because each names the neighbour's
  own async type (`ResultAsync` vs `Future<Result>`). Do not uniformise them.
- A `Defect` `Result` has no public constructor (defects arise at boundaries).
  The only place one is minted is `@unthrown/effect`'s `fromExit`, which replays
  Effect's `die` cause through the `fromThrowable` boundary — itself a genuine
  un-triaged-failure boundary.

## Toolchain & conventions

- **Stack:** pnpm (catalog) + turbo; build with **tsdown** (dual CJS/ESM + d.ts;
  **no sourcemaps or declaration maps** — each package tsconfig sets
  `declarationMap: false` over the shared base, because `files: ["dist"]`
  excludes `src/` and published maps would be dead-ends);
  lint/format with **oxlint** / **oxfmt**; **knip** for dead-code/deps; **vitest**
  (+ v8 coverage); **typedoc** (markdown) feeding **vitepress**; **changesets**
  for releases; **lefthook** + **commitlint** (conventional commits) on commit.
- **Two TypeScripts, deliberately.** The default catalog is **7.0.2** (the
  native port) and every `packages/*` runs on it. TypeDoc cannot: 7's package
  ships no `typescript.js`, so the JS compiler API it is written against is
  gone, which is what `typedoc@0.28`'s peer range says (`… || 6.0.x`). A named
  catalog (`catalogs.typedoc`) pins **6.0.3**, the last release carrying that
  API, and only `docs` resolves it. One `package.json` names `typescript` once
  and TypeDoc resolves its peer from the importing package — which is _why_
  TypeDoc moved into `docs`. Raise the TypeDoc pin only when TypeDoc supports 7;
  do not slave the two entries together. Three consequences: `typescript` now
  has an `exports` map, so `typescript/bin/tsc` is
  `ERR_PACKAGE_PATH_NOT_EXPORTED` (resolve `typescript/package.json` and join —
  `doc-examples.spec.ts` and `docs/scripts/build-api.ts` both do); an overload
  failure is reported at the offending **argument** node, not the call, which is
  why the `ensure` async-`onFail` `@ts-expect-error` directives in
  `types.test-d.ts` sit on the argument; and `tsdown` prints a "TypeScript 7.0
  does not yet have a stable API" warning per build, with emit unaffected.
- **The agent skill (`skills/unthrown/`) is a hand-maintained second copy of the
  docs, and it drifts.** It is markdown, so nothing typechecks it and knip does
  not see it; it has already shipped a curried API documented as two-argument
  (`fromSchema(schema, input)`), a stale Prisma error model, and "the six oxlint
  rules" after the seventh landed. `packages/oxlint/src/skill.test.ts` pins the
  mechanically-checkable part — the rule inventory, the spelled-out count, and
  which rules sit under the preset vs opt-in headings. The **prose still needs a
  human**: when a package's public surface changes, update the skill in the same
  PR as the docs site.
- **The repo dogfoods `@unthrown/oxlint`.** `.oxlintrc.json` enables the plugin
  (via the `@unthrown/oxlint` workspace devDependency) with the five
  `recommended` rules, so the library is held to the conventions it ships. The
  plugin is loaded from its **build output**, so the root `lint` script builds it
  first (`turbo run build --filter=@unthrown/oxlint && oxlint .`) — turbo-cached,
  and pointing the specifier at `src/` does not work (oxlint cannot resolve the
  NodeNext `.js` imports of a raw TS tree). The exceptions carry targeted
  `oxlint-disable` comments with reasons: the three interop `settle()` bridges
  and `@unthrown/orpc`'s `ResultHandler` union must stay a native `Promise`
  (`prefer-async-result`), and `@unthrown/vitest`'s `SomeResult` is the untyped
  boundary (`no-ambiguous-error-type`). The interop specs spell their fixture `E`
  as a concrete literal union rather than `string`.
- **Gate (all must stay green):** `pnpm format --check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build`. CI mirrors these.
- TypeScript `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`;
  ESM-first; `moduleResolution: NodeNext` (relative imports use `.js`).
- **oxlint rules are binding:** no `interface` (use `type`), no `any` (use
  `unknown`). Genuine exceptions (e.g. the `vitest` `Matchers` augmentation, the
  `AsyncRes.then` thenable) carry a targeted `oxlint-disable` with a reason.
- **Test conventions.** Core's specs share `src/test-helpers.ts` (excluded from
  coverage): `boom` / `defectOf` fixtures, and `expectOk` / `expectErr` /
  `expectDefect`, which do the narrowing so a spec reads `expectErr(r, "e")`
  instead of the two-line `isErr()` dance. Core cannot use `@unthrown/vitest`'s
  matchers — that package takes core as a **peer**, so importing it would be
  circular — and these recover most of the readability without the dependency.
  **No test asserts the absence of a global `unhandledRejection` after a
  `setTimeout`**: a negative assertion on a timing window cannot distinguish
  "never fires" from "fires later than we waited", so it can silently stop
  protecting. Adoption is asserted **positively** instead, via
  `adoptionProbe()` — `Promise.resolve(x)` calls `x.then(onFulfilled,
onRejected)`, so the fixture records the handler _and invokes it_, proving both
  that it was installed and that it swallows the rejection, in one microtask
  with no timer.
- **`@unthrown/drizzle` is the one suite that needs Docker.** Every other
  package's tests are self-contained (`@unthrown/prisma` runs against in-memory
  SQLite for exactly that reason), but drizzle's assert PostgreSQL's own
  SQLSTATE reporting, constraint naming and transaction semantics, which a fake
  can only pin our assumptions about. It starts one pinned
  `postgres:18.4-alpine` per run via `@testcontainers/postgresql` in a vitest
  `globalSetup`, so **`pnpm test` needs a running Docker daemon** locally. The
  requirement is stated in the package README, the Drizzle guide page and the
  `packages/drizzle` bullet above. CI needs no configuration: every job in the
  shared `ci-reusable.yml` runs on `ubuntu-latest` directly, which ships Docker.
- **TSDoc `@example` blocks are compiled** (`doc-examples.spec.ts`): every
  ```ts fence under an `@example` is extracted, given an import preamble of the
  whole public surface, and typechecked. Examples are the primary teaching
  surface and they rot silently — the same gap shipped a curried API documented
  as two-argument in the agent skill. Placeholder names (`findUser`, `id`)
  surface as TS2304/2552/7006/18046 and are ignored (TS2552 is TS2304 with a
  spelling suggestion, which TypeScript 7 adds where a similar name exists);
  everything else fails, and a renamed export fails on the _preamble import_ as
  TS2305/TS2724, which is never ignored.
  This extractor stays **core-only** — rolling it out to the satellites is not
  the direction taken (#191); the runnable `examples/` packages are the repo's
  answer to prose rot outside core, and the satellites' `@example` blocks
  remain unguarded. Beware the count that motivated that issue: a naive
  `grep -c @example packages/prisma/src` reports **81**, but 47 of those are in
  Prisma's own **generated** client and 30 more are in `index.spec.ts` /
  `types.test-d.ts`, which the extractor skips by name. The public API surface
  the extractor would actually see is `index.ts` alone — **4** blocks. The
  earlier figures in this file (34) and on #191 (~80) were both artefacts of
  counting generated and test files. `@unthrown/drizzle` takes the same idea from the other end:
  `src/docs-examples.test-d.ts` is a type-level file holding every sample its
  README, its guide page and its `@example` blocks ship, so a sample that stops
  compiling fails the gate. (It caught two live defects when it was written — a
  README `.mapErrCases` hung off a query _builder_, which is a thenable with no
  such method, and a `^?` annotation on the wrong expression.)
- Tests: Vitest. Every load-bearing invariant above gets an explicit test
  (`invariants.spec.ts` guards them 1:1); core holds 100% line/function coverage,
  enforced by thresholds in its `vitest.config.ts`.
- **Type-level tests:** `packages/core/src/types.test-d.ts` asserts the
  type-level behaviour the runtime can't (the conditional `all`/`allFromDict`
  shapes, `Exclude<R, Defect>` boundary inference, `flatTap`/`recoverErrCases` channel
  widening, the `this is …` guard narrowing, `match`'s `errCases`-matcher
  exhaustiveness (a missing tag does not compile; the folded type unions the
  branch returns), and the
  error-matcher semantics — narrowing, defect/throw-branch subtraction,
  the `P._` escape hatch (including over a generic `E`), grouped patterns,
  `code`-discriminated and untagged unions,
  forced exhaustiveness (a missing case does not compile), the `E`-inference
  regression guard (`combine` still infers), and the `flatMapErrCases`/`flatTapErrCases`
  async-branch rejection) with a
  `Expect<Equal<…>>` helper plus `@ts-expect-error` for must-not-compile cases.
  They are checked by `tsc` via `tsconfig.test-d.json` (which relaxes
  `noUnusedLocals`), folded into the package's `typecheck` script — so a typing
  regression fails the gate. The file is excluded from the build, coverage,
  oxlint, and knip (it has no runtime).
- Public API carries full **TSDoc**; `pnpm --filter @unthrown/docs build` must
  stay typedoc-warning-free (it runs all nine `typedoc.<name>.json` configs).
- One concept = one name. Resist convenience aliases.
- **The error-matcher combinators carry a `*Cases` suffix** (`mapErrCases`,
  `flatMapErrCases`, `recoverErrCases`, `tapErrCases`, `flatTapErrCases`) —
  **not** the bare `mapErr`/`tapErr`. The callback receives a matcher
  over the error's _cases_, not the value, so the suffix names the protocol and
  keeps it distinct from the value-taking success surface (`map`/`tap`). This
  reverses the earlier plan to keep the bare `map*`/`tap*` names (weighed and
  changed 2026-07): the functor-style name promised a `(e) => …` callback the
  combinators never accept. There is **no** plain-callback `mapErr` variant —
  that would reopen the blanket-handling hole the matcher closes. Do not
  re-litigate or add bare aliases. Documented user-side in the
  exhaustive-error-matching guide.
- The core has **zero runtime dependencies** — the error matcher is built-in
  (`matcher.ts`). It replaced the former `ts-pattern` peer deliberately: the
  exhaustiveness guarantee (unthrown's central promise) must not vary with a
  consumer-resolved third-party version (ts-pattern changed exhaustiveness
  semantics in a _minor_, 5.8), and a peer imposed install friction plus a
  dual-copy type hazard. Add no dependencies — protect that zero.
