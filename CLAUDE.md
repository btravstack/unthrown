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
   code never imports it — the qualify-time marker is not a public value).
   `qualify` is **synchronous**: its return intersects `NotThenable`, so an
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
   `match`, `P` (`_`/`any`, `tag`, `instanceOf`, `when`, `union`, `string`,
   `number`), `returnType<R>()` (declare the output type once — every branch is checked
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
  as-is** on `Err` (and panics on a `Defect`, like the rest of the family). It
  exists so a `no-throw` lint rule can ban raw `throw` while this one sanctioned
  extraction remains — the faithful, lint-clean form of
  `.flatMapErrCases((matcher) => matcher.with(P._, (e) => { throw e })).get()`; it is
  **off the errors-as-values thesis** by design, so reach for `match` / `recoverErrCases`
  / `flatMapErrCases` whenever the error can stay a value. It is type-gated as the
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
  made, and nowhere else**: `qualify` at a boundary (Thesis #3) and the
  error-match branches (Thesis #5). Elsewhere the syntax
  is `throw` (the throw → defect invariant is the safety net; a
  known-technical precondition throws in a plain helper wrapped once at its
  origin with `fromSafeThrowable`). A public minting helper was weighed and
  **rejected** in #77 — frictionless minting would let unmodeled-by-laziness
  failures erode the defect channel's meaning; scoping the injection to triage
  sites keeps that friction (the exhaustiveness IS the friction) while staying
  lint-clean under a `no-throw` rule. Documented in the defect-channel guide.
- interop: `fromNullable`, `fromThrowable`, `fromSafeThrowable` (the sync
  mirror of `fromSafePromise` — every throw a `Defect`, `E = never`, no
  `qualify`; the named form of the `(c, d) => d(c)` boilerplate, an explicit
  "everything here is a defect" decision), `fromPromise`, `fromSafePromise`
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
  `typedoc.json`'s `intentionallyNotExported`.)
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
  links to these API sections. The core `typedoc.json` sets an explicit `categoryOrder` (`Facade`,
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

- `packages/core` → `unthrown` (**zero runtime dependencies** — the exhaustive
  error matcher is built-in (`matcher.ts`, exported as `match`/`P`/
  `NonExhaustiveError`); it replaced the former `ts-pattern` peer so the
  exhaustiveness guarantee can never vary with a consumer-resolved third-party
  version, and nothing needs installing alongside `unthrown`)
- `packages/vitest` → `@unthrown/vitest` (peerDep `vitest`; besides the
  `expect.extend` registration it also exports the six raw matcher functions,
  `failOnForgottenAwait`, and the `UnthrownMatchers` type — for manual
  `expect.extend` wiring)
- `packages/effect` → `@unthrown/effect` (peerDep `effect`)
- `packages/neverthrow` → `@unthrown/neverthrow` (peerDep `neverthrow`)
- `packages/boxed` → `@unthrown/boxed` (peerDep `@bloodyowl/boxed` — Boxed's
  maintained scope; `@swan-io/boxed` is the deprecated former name)
- `packages/standard-schema` → `@unthrown/standard-schema` (dep on the
  types-only `@standard-schema/spec`; bridges Zod/Valibot/ArkType validators to
  `Result` via `fromSchema` / `fromSchemaAsync`, with the validation issues as
  the modeled `E`)
- `packages/oxlint` → `@unthrown/oxlint` (an oxlint **JS plugin**, peerDep
  `oxlint`, dep `@oxlint/plugins`; ships **seven rules**: `no-ambiguous-error-type`
  — enforces Thesis #1 against `unknown`/`any`/`Error`/`{}` **and the primitive
  keywords** (`void` included) in `E`, both in a `Result`/`AsyncResult` type
  **annotation** and in the matcher's `returnType<R>()` **pin** — the latter only
  inside a `mapErrCases` callback, the one surface whose builder output _becomes_
  `E`; `recoverErrCases` (success type), `tapErrCases` (discarded) and `match`
  (folded value) are deliberately left alone, and the flat pair needs no case of
  its own (a bare ambiguous pin does not type-check there, and a nested
  `Result<U, E2>` pin is already read by the annotation check, which sees type
  arguments wherever they occur). Recognised on the callback's own matcher
  parameter via scope analysis — a matcher copied to another variable, or a
  callback passed by reference, is a documented miss; `prefer-async-result` (reports
  `Promise<Result<T, E>>` in favour of `AsyncResult<T, E>`, but withholds the
  autofix on an `async` function's return annotation **and in function-type
  return positions** — either must stay a native `Promise` at the
  implementation, so the fix would not compile); `no-unhandled-result` (in the
  recommended preset — flags a bare `ExpressionStatement` dropping a `Result`:
  a call to an unthrown-imported producer or facade-companion member, or to a
  locally-declared function whose return annotation is unthrown's
  `Result`/`AsyncResult`, awaited or not; deliberately syntactic — a dropped
  method _chain_ like `r.map(f);` is type-dependent and out of scope); and
  `no-catch-all-pattern` (**in the recommended preset** — reports the catch-all
  `P._` / its alias `P.any` where `P` is imported from `unthrown` or
  `ts-pattern`, so every error case must be enumerated by name; this **states
  the library's own default** (Thesis #5: `P._` is an escape hatch, not the
  sanctioned catch-all), and the sites that must keep the wildcard — a helper
  generic in `E`, or an `E` that is a single type rather than a union of
  cases — carry a targeted `oxlint-disable` with a reason);
  `no-unused-matcher` (**in the recommended preset** — the other way through
  the door `no-catch-all-pattern` guards (#171): a `…Cases` callback — the five
  error combinators, plus `match`'s `errCases` handler — whose matcher
  parameter is absent or never read sources its exhaustiveness from a builder
  bound to some **other** value, which the structural `ExhaustiveMatch`
  constraint accepts and the runtime runs against whatever that builder closed
  over — the wrong branch chosen silently, or a `NonExhaustiveError` turning
  the modeled error into a Defect; the rule also reports a second unthrown /
  ts-pattern `match(...)` call in the callback's **own** body (catching a
  trivial `void matcher` reference fronting for a foreign builder — reported
  only when the parameter is otherwise used, so one fault yields one report),
  while **nested functions are skipped** — a branch handler matching a payload
  field (`.with(P.tag("A"), (e) => match(e.code)…)`) is legitimate; keyed on
  the `…Cases` method names alone (unthrown's own coinage — no receiver
  typing), a callback passed by reference is a documented miss, and there is
  deliberately **no escape hatch**: a `…Cases` callback that does not use its
  matcher is never what you meant); and
  `no-throw` (**opt-in**, not in the preset — reports every `throw`
  statement, pointing at `Err`/`getOrThrow`/`fromSafeThrowable`; this is the
  `no-throw` rule the `getOrThrow` rationale references); and `prefer-ensure`
  (**the other opt-in**, report-only with **no autofix** — flags a `flatMap`
  whose success branch returns its own parameter untouched
  (`flatMap((x) => c ? Ok(x) : Err(e))`), a predicate wearing a bind costume:
  `ensure` names that intent and passes the _same_ `Ok` through where the
  `flatMap` form allocates a fresh one. Anchored on the constructors rather
  than the method name — the `Ok(...)` / `Err(...)` calls must resolve to
  `unthrown` imports (`OkAsync` / `ErrAsync` and the facade members included) —
  and it requires **every** return position of the callback to be a constructor
  call, so a wrapped branch or a fall-through is left alone; a **reassigned**
  parameter is the one false positive the shape admits. No autofix because a
  reversed ternary needs its condition negated and `ensure`'s boolean form
  requires a `boolean` predicate. Unlike every preset rule, the shape it flags
  violates no thesis — it is correct code with a better name available).
  Purely syntactic AST rules that
  resolve bindings via scope analysis keyed by the **imported** name (renamed
  and namespace imports resolve; alias indirection like `type E = unknown` is a
  documented limit) so they only fire on unthrown's `Result`. No TypeDoc API
  page; documented in the Linting guide.
  Tested with oxlint's `RuleTester` from `oxlint/plugins-dev`.
  The **`oxlint` peer floor (`^1.69.0`) is deliberately decoupled from the
  `@oxlint/plugins` dependency** — it names the oldest _host_ the rules were
  verified to run on, not the plugin-utils version the package happens to build
  against. Slaving the two ratchets the floor on every bot bump and drags
  consumers through an oxlint + `oxlint-tsgolint` engine upgrade for a
  packaging-only release (#163). Raise it only when a rule starts using a host
  API that needs it, and name that API in the changeset; the decoupling is
  guarded by a test in `index.test.ts`.)
- `packages/prisma` → `@unthrown/prisma` (peerDep `@prisma/client` ^7; a Prisma
  Client **extension** — `$extends(unthrownPrisma)` adds `try*` variants of
  **all seventeen** model delegate operations alongside the raw promise ones,
  each an `AsyncResult` whose error channel is exactly the **domain outcomes**
  that operation can raise — and nothing else. `E` holds only the three P-codes
  a caller branches on: `UniqueConstraintViolation` P2002 (409),
  `ForeignKeyViolation` P2003 (400), `RecordNotFound` P2025 **and P2018** (404 —
  the to-one and to-many sides of "a record this write depended on was not
  found", the same failure, so one tag). **Every infrastructure failure is a
  `Defect`**: a dropped connection, a pool timeout (P2024), a deadlock (P2034),
  an unmapped P-code, `PrismaClientValidationError` (a malformed query,
  unreachable without casting the `Prisma.Exact` args away),
  `PrismaClientInitializationError`, `PrismaClientRustPanicError`,
  `PrismaClientUnknownRequestError`, a non-Prisma cause. The rule is "would you
  branch on it?" — nobody writes domain logic for a severed TCP connection, they
  log it and 500, which is exactly what `match`'s `defect` arm already does;
  modelling those would force **every call site** to carry an arm duplicating
  its own `defect` arm. (A defect is not a crash — it flows through the pipeline
  untouched and is folded at the edge like any other unmodeled failure.) So a
  **read has `E = never`** (absence is `null`; a database that will not answer is
  a defect), and there is **no `DriverError` class** — it was removed
  2026-08 when the last of its contents moved to the defect channel. A retry
  wrapper for P2024/P2034 therefore uses `recoverDefect` and inspects the cause:
  one place in a codebase, versus an arm at every call site. Only the **batch**
  mutations (`createMany`/`updateMany` + their `*AndReturn` twins) are free of
  `RecordNotFound`: they accept no nested writes and zero matches is
  `Ok({ count: 0 })`. `create` and `upsert` **do** carry it — neither misses a
  row of its own, but a nested `connect` to a non-existent record raises P2025
  (an unsound omission until 2026-08: the runtime produced a `RecordNotFound`
  the type excluded, so a type-exhaustive `mapErrCases` threw
  `NonExhaustiveError` and the modeled error silently became a `Defect`). Also
  `$tryTransaction` (an interactive transaction whose callback
  speaks `AsyncResult` — an `Err` rolls back and re-surfaces typed; a defect
  rolls back and stays a defect, a throwing callback included) and
  `tryPaginate(...).withCursor(...)` (the
  `prisma-extension-pagination` cursor API with its unmerged #35 fix folded
  in; `after`/`before` are mutually exclusive in the type — passing both used to
  drop `after` silently — and pagination carries the **one carve-out** to the
  defect routing above: its `E` is `InvalidCursor`, minted both from a Prisma
  validation error and from a throw out of the caller's `parseCursor` on a
  request cursor (marked by the internal `CursorParseFailure` sentinel), because
  a cursor is an opaque string from a client and garbage in it is a 400, not a
  bug. A throw out of `getCursor` — which reads rows _we_ fetched — is
  deliberately NOT marked, so it stays a defect). Qualification happens once inside the extension via the exported
  `qualifyPrismaError`, which **is** a `qualify` — `(cause, defect)`, generic in
  the marker type so core's non-exported `Defect` need not be named — and so
  drops straight into a `fromPromise` at a boundary of your own; the raw methods
  stay as the escape hatch for batch
  `$transaction([...])` and raw SQL. Tested against a
  real in-memory SQLite client (`@prisma/adapter-better-sqlite3`) with a
  generated, gitignored test client; **deliberately outside the fixed version
  group** — its majors track `@prisma/client`'s cadence, not the family's.
  `engines: { node: ">=20.19" }` (Prisma 7's floor), the one exception to the
  family's `>=20`. Documented in the Prisma guide page.)
- `packages/orpc` → `@unthrown/orpc` (peerDeps `@orpc/client` + `@orpc/server`
  at `^2.0.0-beta` — **peers, not deps**: `isInferableError` is an
  `instanceof ORPCError` check, the same dual-copy hazard as `isResult`;
  `@orpc/server` is an **optional** peer so a browser-only consumer skips it.
  A two-way bridge built on oRPC v2's returned-`ORPCError` inference (an error
  a procedure declares via `.errors({...})` or returns as a value is
  _inferable_ — typed end-to-end; everything else collapses to
  `INTERNAL_SERVER_ERROR`), which maps onto the variants exactly: `Ok` ↔
  output, `Err` ↔ returned inferable `ORPCError`, `Defect` ↔ the rest. Three
  entry points, **no root export**: `./server` — `handlerResult(fn)` adapts a
  `Result`-returning handler (`Err` is constrained to `ORPCError`, so the
  `mapErrCases` into `errors.CODE(...)` at the endpoint is the Thesis-#3 triage
  point; a `Defect` rethrows its cause; a non-`ORPCError` `Err` smuggled past
  the types routes to the defect path — it must never be served as a
  successful output; the callback may be async — an elimination edge, exempt
  like `match`). `./extensions/result` — the opt-in `.result()` builder
  method via `declare module "@orpc/server"` augmentation + two prototype
  patches (`Builder`, `ProcedureImplementer` — every builder state shares the
  `Builder` class at runtime); the package's ONE side-effectful entry, listed
  in a `sideEffects` array (the `@orpc/experimental-effect` packaging).
  `./client` — `fromCall(promise)` lifts a single call (client call or
  server-side `call(...)`), `createResultClient(client)` recursively wraps a
  router (the `createSafeClient` mirror): `E` is the raw inferable `ORPCError`
  union discriminated by `code` — deliberately NOT re-wrapped into
  `TaggedError` (match it on `code`, e.g. `.mapErrCases((matcher) => matcher.with({
code: "NOT_FOUND" }, …))`); non-inferable →
  `Defect`. Event-iterator (streaming) procedures are deliberately out of
  scope — the raw client is the escape hatch. Tested end-to-end against real
  oRPC machinery: `createRouterClient` in-process plus an
  `RPCHandler`/`RPCLink` loop through a custom `fetch` (real JSON
  serialization, where the defect-collapse to `INTERNAL_SERVER_ERROR`
  actually happens). **Deliberately outside the fixed version group** — its
  majors track oRPC's cadence, not the family's. Documented in the oRPC guide
  page.)
- shared config is **external**, not a workspace package: the tsconfig and
  typedoc bases come from the catalog dependencies `@btravstack/tsconfig` and
  `@btravstack/typedoc` (alongside `@btravstack/oxlint`, `@btravstack/commitlint`,
  `@btravstack/lefthook` and the docs' `@btravstack/theme`). There is no
  `tools/` directory — `pnpm-workspace.yaml` declares only `packages/*` and
  `docs`.
- `docs` → `@unthrown/docs`, the VitePress site (guide + TypeDoc-generated API
  reference); deployed to GitHub Pages by `deploy-docs.yml` — **versioned**:
  while a prerelease is in progress (`.changeset/pre.json` on main) the site is
  built twice, the latest stable tag's docs at the root (the default) and main's
  under `/beta/`, linked by a nav version dropdown (`DOCS_BASE` /
  `DOCS_VERSIONS` env in the VitePress config; a legacy tag without native
  support gets the dropdown injected by
  `.github/scripts/inject-docs-version-nav.ts`). With no prerelease, main
  deploys alone to the root as before

Core has **no runtime dependencies** (the error matcher is built-in). Never
pull `vitest` or any interop peer (`effect`, `neverthrow`, `@bloodyowl/boxed`,
`@orpc/*`) into core.

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

## Status (all four roadmap items shipped)

1. ✅ **Scaffold the workspace.** Done — pnpm + turbo workspace, dual CJS/ESM
   tsdown build, strict shared tsconfig, oxlint/oxfmt, knip, changesets, CI. The
   core `unthrown` package is split into focused modules, fully TSDoc'd, and
   covered by a test suite held at 100% line/function coverage. (`unthrown`
   and the `@unthrown` scope are published on npm; releases flow through the
   changesets `release.yml`.)
2. ✅ **`packages/core/src/tagged.ts`** — Done. `TaggedError(tag)` factory
   (extends `Error`, `_tag`, no-arg constructor when payload is empty via the
   `keyof A extends never ? void : A` trick). Its matching half is the
   `P.tag(t)` pattern (`{ _tag: t }`), which lives with the other pattern
   constructors. A per-tag exhaustive fold is `match`'s `errCases` handler
   with the matcher (`matcher.with(P.tag("…"), …)`), not a dedicated
   `matchTags` — that former helper was folded into `match` when the matcher
   became the error-channel convention.
3. ✅ **`packages/vitest`** — Done. Custom matchers `toBeOk`, `toBeOkWith`,
   `toBeErr`, `toBeErrWith` (the error-value mirror of `toBeOkWith` — a deep
   compare of the `Err` value), `toBeErrTagged` (optional second arg also matches
   the tagged error's payload — exact for a plain object, partial for an
   asymmetric matcher like `expect.objectContaining`; "payload" excludes
   **every** key `TaggedError` reserves — `_tag`/`name`/`message`/`stack`, the
   same list `TaggedErrorInstance` omits — because a subclass's documented
   `override message = "…"` lands as an own **enumerable** property and would
   otherwise leak into the exact form, breaking the very pattern Thesis #4
   prescribes), `toBeDefect`, registered
   via `expect.extend`
   and augmenting Vitest's `Matchers` interface. They detect a thenable
   `AsyncResult` and await internally, so a test reads
   `await expect(asyncResult).toBeOk()`. A forgotten `await` is **loud**: the
   matchers track in-flight assertions and a module-registered `afterEach`
   (`failOnForgottenAwait`) fails the test at its end, naming the pending
   matchers — the abandoned assertion is reported exactly once, correctly
   attributed, and can never late-fire as an unhandled rejection.
4. ✅ **The built-in matcher** — Done. `matcher.ts` powers the exhaustive error
   matchers (Thesis #5), exporting `match`/`P`/`NonExhaustiveError` — `P`
   carrying every pattern constructor, `P.tag(t)` (the `{ _tag: t }` pattern)
   included. Because `Result` is a discriminated
   union (Thesis #1), `match(result).with({ tag: "Ok" }, …)` also matches a
   whole `Result` natively. (History: the standalone `@unthrown/pattern`
   package was folded into core when a `ts-pattern` dependency was taken in
   early v5; the built-in matcher then replaced that dependency entirely —
   same call-site shape, owned type machinery, catch-all provable over a
   generic `E` (#145), zero runtime deps.)

Also shipped: a root `README` + `LICENSE`, per-package READMEs, and the VitePress
docs site (guide + generated API reference). Both the npm packages and the
GitHub Pages site are live (the release secrets / npm Trusted Publishers are
configured outside the repo).

## Toolchain & conventions

- **Stack:** pnpm (catalog) + turbo; build with **tsdown** (dual CJS/ESM + d.ts;
  **no sourcemaps or declaration maps** — each package tsconfig sets
  `declarationMap: false` over the shared base, because `files: ["dist"]`
  excludes `src/` and published maps would be dead-ends);
  lint/format with **oxlint** / **oxfmt**; **knip** for dead-code/deps; **vitest**
  (+ v8 coverage); **typedoc** (markdown) feeding **vitepress**; **changesets**
  for releases; **lefthook** + **commitlint** (conventional commits) on commit.
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
- **TSDoc `@example` blocks are compiled** (`doc-examples.spec.ts`): every
  ```ts fence under an `@example` is extracted, given an import preamble of the
  whole public surface, and typechecked. Examples are the primary teaching
  surface and they rot silently — the same gap shipped a curried API documented
  as two-argument in the agent skill. Placeholder names (`findUser`, `id`)
  surface as TS2304/7006/18046 and are ignored; everything else fails, and a
  renamed export fails on the _preamble import_ rather than as an ignorable
  TS2304. `@unthrown/prisma`'s 34 examples are the obvious next application.
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
- Public API carries full **TSDoc**; `pnpm --filter <pkg> build:docs` must stay
  typedoc-warning-free.
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
