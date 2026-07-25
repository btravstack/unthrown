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
   error combinators (`mapErr`, `flatMapErr`, `recoverErr`, `tapErr`,
   `flatTapErr`) do not take a single callback: their callback receives a
   **ts-pattern match builder** over the error (`match(error)`, typed
   `ErrMatcher<E>`) plus the injected `defect` helper, and **returns the
   un-terminated builder** — the combinator calls `.exhaustive()` itself. So a
   match that misses a case **does not compile** (there is no `.exhaustive()`
   to forget, and no `.otherwise()` to smuggle in a fallback), and enriching
   `E` — a new tag, a new `code` — is a compile error at _every_ consuming
   site until each is handled. This is the payoff of errors-as-values: the
   values cannot be silently dropped. ts-pattern matches by structure, so this
   works on any discriminant (`_tag`, `code`, guards, grouped patterns), not
   only `TaggedError`. `P._` is the deliberate catch-all (the uniform "handle
   everything else" branch, replacing the old single callback). Each branch
   receives the narrowed variant and the **injected `defect` helper** — the
   same injection `qualify` gets (Thesis #3), the sanctioned deliberate
   `Err`→`Defect` form (`.with(tag("DriverError"), (e) => defect(e.cause))`);
   the outgoing type is the builder's output **with the `Defect` arm
   subtracted** (`Exclude<O, Defect>`, exactly the boundary inference), so a
   defect branch — or a throwing one, the safety net — contributes nothing.
   The **observers** (`tapErr`, `flatTapErr`) take the same exhaustive builder
   (the error passes through unchanged); a branch that returns a raw
   `Promise`/`AsyncResult` is rejected where the combinator awaits it
   (`flatMapErr`/`flatTapErr`, via the builder-output constraint) **and** in
   `tapErr` (its branch results are discarded, so a rejected `Promise` would
   float unobserved — its builder output is `NotThenable`-constrained) — only
   the non-awaiting transformers `mapErr`/`recoverErr` run the branch
   synchronously with an async branch remaining a visible Promise-valued
   result, not a rejection bypass. `tapDefect` / `tapFailure` keep single callbacks — their payloads
   carry no discriminant to match (a defect's cause is `unknown`; `tapFailure`
   splits on channel, not tag). The one eliminator that still handles the error
   channel, **`match`**, applies the **same exhaustive matcher** to its `err`
   handler (`(matcher) => matcher.with(…)`, returning the un-terminated builder;
   `match` runs `.exhaustive()`) — so folding at the edge is exhaustive too, and
   there is no blanket `err` callback left to silently drop a value. Its `err`
   handler receives the matcher but **no `defect` helper** — `match` folds to a
   plain value, with no `Defect` output channel; the separate `defect` case
   handles a `Result` that already carries one. (This subsumes the former
   `matchTags` fold — per-tag folding at the edge is now `match` with the
   matcher and `tag(t)`, and it works on any discriminant, not only `_tag`.) The
   value-surrendering extractors (`getOr` / `getOrElse` / `getOrNull` /
   `getOrUndefined`) stay exempt — the value is being surrendered anyway. **Core
   depends on `ts-pattern`** (a light, types-heavy, dual-copy-safe library —
   its matcher protocol keys off a global `Symbol.for`), re-exporting `match`
   and `P` so the matcher is first-class in one import.

## Load-bearing runtime invariants (tests must guard these)

- **Throw → defect.** Any value thrown by a callback (or match branch) inside
  a combinator (`map`, `flatMap`, `flatTap`, `ensure`, `bind`, `let`, `mapErr`,
  `flatMapErr`,
  `recoverErr`, `tap*`, `flatTapErr`, `recoverDefect`) is caught and converted to a
  `Defect`. Nothing escapes a pipeline as a raw throw.
  This is what lets an HTTP adapter do a single `match({ ok, err, defect })`
  with **no surrounding `try/catch`**.
- **An out-of-contract non-`Result` surfaces as a `Defect`, never a raw
  throw/rejection.** Reachable only from untyped/cast callers: the aggregates
  (`all` / `allFromDict` and their async pair) turn a non-`Result` element into
  a `TypeError`-caused `Defect`, and every combinator whose callback is
  constrained to return a `Result` (`flatMap`, `flatTap`, `bind`, `flatMapErr`,
  `flatTapErr`, `recoverDefect` — both surfaces; the async ones check the
  **awaited** value, so a legitimately returned `AsyncResult` still passes)
  does the same with a non-`Result` callback return, instead of letting a
  poison value throw a raw `TypeError` further down the pipeline.
- **A non-exhaustive error match becomes a `Defect` (in the combinators).** In
  the error combinators, the callback returns a ts-pattern builder and the
  combinator runs `.run()` (which executes `.exhaustive()`). For well-typed
  callers the match is exhaustive by construction; a value that slips past the
  types (a widened cast, a JS caller) with no matching case throws ts-pattern's
  `NonExhaustiveError`, which the throw-to-defect net turns into a `Defect` — an
  unmodeled failure. In **`match`** (an edge eliminator, exempt from
  throw→defect) the same non-exhaustive rogue value instead **throws**
  `NonExhaustiveError` outright — a genuinely unmodeled tag at the edge is a
  bug, not a routed value.
- **Exhaustiveness is type-enforced, with no forgettable step.** `mapErr` /
  `flatMapErr` / `recoverErr` / `tapErr` / `flatTapErr` require the callback to
  return an `ExhaustiveMatch` — `.exhaustive` is typed callable only when
  ts-pattern has narrowed the input to `never` (all cases covered); a
  non-exhaustive builder types `.exhaustive` as `NonExhaustiveError` and fails
  the constraint at the call site. For code that builds the match through the
  provided matcher there is no path where a case slips past an error combinator
  uncovered without a compile error, and no `.exhaustive()` / `.otherwise()`
  for a caller to reach (the combinator owns termination). One honest caveat:
  `ExhaustiveMatch` is **structural**, so a hand-rolled `{ exhaustive, run }`
  object can satisfy it and bypass exhaustiveness in typed code — accepted, as
  a deliberate act no worse than the sanctioned `P._` catch-all. This
  is a _type-level_ invariant, guarded in `types.test-d.ts`.
- **A `Defect` flows through every method untouched EXCEPT `match()`,
  `recoverDefect()`, and the observers `tapDefect()` / `tapFailure()` (which
  observe it without consuming it).** Therefore `getOr`, `getOrElse`,
  `getOrNull`, `getOrUndefined` still **throw** on a `Defect` — they recover
  the modeled `Err`, never an unmodeled defect (a defect is a bug, not an
  absent value).
- **A failure-observer throw preserves the original failure.** A throw inside
  `tapErr` / `tapDefect` / `tapFailure` / `flatTapErr` produces a `Defect` whose
  cause is an `AggregateError([thrown, original])` — observing a failure never
  destroys it. (A throw in the success-channel `tap`/`map` keeps the plain
  thrown cause.)
- **Thenable callback returns are rejected at compile time — where a rejection
  could bypass qualification or vanish.** Every combinator callback not already
  constrained to return a `Result` (`map`, `tap`, `let`, `tapDefect`,
  `tapFailure`, `ensure`'s `onFail`) intersects its return with
  `NotThenable<R>`, so an `async` callback is a compile error (an async
  `ensure` predicate already fails its `boolean` return type — a `Promise`
  would be always-truthy). Among the error-matcher combinators, the
  **awaiting** ones — `flatMapErr` / `flatTapErr` — reject an async branch via
  their builder-output constraint (an awaited rejection would bypass
  qualification), and so does the observer **`tapErr`** (its branch results are
  **discarded**, so a rejected `Promise` would float unobserved; same
  builder-output `NotThenable` constraint). The **non-awaiting** transformers
  `mapErr` / `recoverErr` run
  the matched branch **synchronously with no await**, so an async branch is
  merely a visible `Promise`-valued result, not a rejection bypass — they do
  not ban it. The boundary `qualify` is constrained the same way, with a
  runtime belt-and-braces: a thenable slipped past the types becomes a
  `Defect` and its orphaned rejection is silenced (see Thesis #3). `match`
  handlers are deliberately exempt (edge elimination).
- **Result instances are frozen — and so is the machinery around them.**
  `okRes`/`errRes`/`defectRes` return `Object.freeze`d objects, so a variant
  cannot be forged by mutation; the `readonly` types are real at runtime.
  `Res.prototype` and `AsyncRes.prototype` are frozen too (the shared
  combinators can't be swapped out from under every instance), `AsyncRes`'s
  wrapped promise is a native `#private` field, and the qualify-time `defect`
  marker is frozen.
- **`match`'s `err` matcher is type-forced exhaustive, and library code generic
  in `E` uses the guards instead.** For well-typed concrete callers a missing
  branch does not compile; a rogue value slipping past the types throws
  `NonExhaustiveError` (see above). Because ts-pattern cannot prove `.with(P._,
…)` exhaustive over an **unresolved type parameter**, code that folds a
  generic `Result<T, E>` (the interop `to*` bridges, `@unthrown/orpc`'s
  `handlerResult`) branches via the `isOk` / `isErr` / `isDefect` guards rather
  than `match` — the guards narrow to `OkView` / `ErrView` / `DefectView` with
  no exhaustiveness obligation. Concrete application code uses `match` normally.
- **`get()` / `getErr()` are type-gated.** `get()` compiles only when the
  error channel is empty (`this: Result<T, never>`); `getErr()` only when the
  success channel is empty (`this: Result<never, E>`). Eliminate the opposite
  channel first (`match` / `recoverErr` / `flatMapErr`), or use the `getOr` /
  `getOrElse` / `getOrNull` / `getOrUndefined` family (which recover an `Err`).
  On a `Defect` they still **rethrow the original `cause`** (they _panic_) with its
  original stack — so `Result<T, never>` means the modeled error channel is empty,
  **not** that `get()` cannot throw. The `GetError`-on-wrong-variant branch
  remains at runtime as a defensive guard but is **unreachable through well-typed
  code** (only a cast or a raw-JS caller can reach it).
- **`recoverErr` returns `Result<T | U, never>`, and `never` means only the _error_
  channel is empty — a `Defect` can still be present at runtime.** This is the one
  place the type intentionally under-describes the runtime. Do not read `never`
  as "total".
- **An `AsyncResult`'s internal promise NEVER rejects.** Every rejection or
  thrown value is captured as `Err` (via `qualify`) or `Defect`. `await`-ing an
  `AsyncResult` always yields a `Result` and never throws.

## Public surface (implemented in packages/core/src/, split into focused modules)

`Result<T, E>` is a **discriminated union** — `{ tag: "Ok"; value } | { tag:
"Err"; error } | { tag: "Defect"; cause }`, each intersected with the shared
method surface — so it matches **natively** (a `switch` on `tag`, or
`ts-pattern`'s `match(r).with({ tag: "Ok" }, …).exhaustive()`) **and** chains
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
- error: `mapErr`, `flatMapErr`, `recoverErr`, `tapErr`, `flatTapErr` all take
  the Thesis-#5 **ts-pattern matcher callback** `(m: ErrMatcher<E>, defect) => M`
  where `M extends ExhaustiveMatch<…>` (the callback returns the un-terminated
  builder; the combinator runs `.run()`). Outgoing types are computed from the
  builder output `MatchOut<M>` — mapErr: `MatchErrOut<M>` (= `Exclude<MatchOut,
Defect>`); flatMapErr: `OkOf`/`ErrOf` — plus `AsyncOkOf`/`AsyncErrOf` on the
  async surface — over it; recoverErr: `T | MatchErrOut<M>` with `E = never`.
  `flatTapErr` is the exception: it infers a plain `E2` from the builder output
  and returns `E | E2` (the `MatchOut<M>` shape unioned with the class `E`
  defeats variance measurement of the intersection `AsyncResult` — see internal
  design). The `defect` helper is passed to every branch (the deliberate
  `Err`→`Defect`); `tapErr`/`flatTapErr` keep the same exhaustive builder (the
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
- eliminate: `match` (the `{ ok, defect }` handlers plus an `err` handler that
  takes the **exhaustive ts-pattern matcher** `(matcher) => matcher.with(…)` —
  same as the error combinators, but with no `defect` helper since `match` folds
  to a value; the folded type unions all branch returns), `get`/`getErr`
  (type-gated — `get` only compiles on
  `Result<T, never>`, `getErr` only on `Result<never, E>`; use `match` /
  `recoverErr` / `flatMapErr` to empty the opposite channel first), `getOr` (signature
  `getOr<U>(fallback: U): T | U` — widening, not narrowed to `T`), `getOrElse`
  (same `T | U` widening), `getOrNull`, `getOrUndefined` — the `getOr…`
  family extracts from a still-fallible `Result` with a fallback, since
  `get`/`getErr` won't compile on it. `getOrThrow` completes the `getOr…`
  family with a **deliberate escape hatch** — it **throws the modeled `error`
  as-is** on `Err` (and panics on a `Defect`, like the rest of the family). It
  exists so a `no-throw` lint rule can ban raw `throw` while this one sanctioned
  extraction remains — the faithful, lint-clean form of
  `.flatMapErr((matcher) => matcher.with(P._, (e) => { throw e })).get()`; it is
  **off the errors-as-values thesis** by design, so reach for `match` / `recoverErr`
  / `flatMapErr` whenever the error can stay a value. It is type-gated as the
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
- ts-pattern re-exports: `match` and `P` are re-exported from `ts-pattern` (core
  depends on it), and `tag(t)` (the `{ _tag: t }` pattern, narrowing to the
  variant + payload) lives in `tagged.ts`. These make the error matcher, and
  matching a whole `Result` (`match(r).with(P.…)`), first-class in one import —
  the former `@unthrown/pattern` package, now folded in.
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
  `ErrMatcher<E>` — the ts-pattern builder over the error (`ReturnType<typeof
match<E>>`, so ts-pattern's non-exported `Match` type is never imported).
  The supporting `ExhaustiveMatch`/`MatchOut`/`MatchErrOut` are exported for the
  d.ts but not re-exported from `index.ts`. `ExhaustiveMatch<O>` requires
  `.exhaustive` to be _callable_ (ts-pattern types it as `NonExhaustiveError` on
  a non-exhaustive builder) and carries the output via `run: () => O`, from which
  `MatchOut`/`MatchErrOut` extract. Note `ErrMatcher<E>` must appear only as a
  callback **parameter** type (contravariant), never combined with the class `E`
  in a covariant return — ts-pattern's `Match` is invariant in its input, which
  would poison `E` inference (why `flatTapErr` infers a plain `E2` instead).
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
  async delta. The `docs/guide/choosing-a-combinator.md` guide remains the "by
  intent" selection cheat-sheet — one table covering both — and links to these API
  sections. The core `typedoc.json` sets an explicit `categoryOrder` (`Facade`,
  `Types`, `Methods`, `Constructors`, … then `Aggregate`, `Errors`) so the core
  surface leads the API reference instead of the default alphabetical order.
- tagged errors: `TaggedError(tag, options?)` (the error-class factory; optional
  `options.name` sets `Error.name` independently of the `_tag` discriminant, so a
  tag can be namespaced for collision-safety without leaking into the display
  name; the payload reserves `name`, `message`, **and** `stack` via `?: never`
  (`cause` stays allowed — see Thesis #4), so the
  message is set per subclass with `override message = "…"`, never as a payload
  field) and `tag(t)` (the `{ _tag: t }` ts-pattern pattern, for use in the
  error matchers, in `match`'s `err` handler, and in `match(result)`); see the
  `TaggedError` convention in Thesis #4. **There is no `matchTags`** — a per-tag
  exhaustive fold over a tagged error union is `result.match({ ok, defect, err:
(matcher) => matcher.with(tag("…"), …) })`, which generalises beyond `_tag` to
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
- **`ResultMethods` / `AsyncResultMethods` / `Awaitable` carry `out` variance
  annotations, and they must verify.** `Result<T, E>`'s covariance in both
  params is what lets generic engine and user code widen (`Result<U, E2>` →
  `Result<U, E | E2>`); with the matcher signatures, TypeScript can no longer
  _measure_ that covariance structurally across unresolved type parameters, so
  the declared `out` fast-path carries it. TS **verifies** the annotations
  (TS2636 if unprovable). Only aliases whose body is directly an object type may
  be annotated — the unions/intersections (`Result`, the views, `AsyncResult`)
  inherit the fast path through them. **`ErrMatcher<E>` (ts-pattern's `Match`,
  invariant in its input) must stay in a callback parameter position only**: it
  is contravariant there and harmless, but unioning an `M`-derived output with
  the class `E` in a covariant return re-invaded `E`'s variance and collapsed
  inference (`combine<T,E>(rs: AsyncResult<T,E>[])` inferring `unknown`) — which
  is exactly why `flatTapErr` infers a plain `E2` from the builder output and
  returns `E | E2` rather than `E | ErrOf<MatchOut<M>>`.
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
  would pick up junk candidates.
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
  `tagged.ts` (`TaggedError`/`tag`), and `index.ts` (the curated
  public re-exports, including `match`/`P` from `ts-pattern` — the one place the
  API is decided).

## Monorepo layout

- `packages/core` → `unthrown` (one runtime dependency: `ts-pattern`, which
  powers the exhaustive error matchers and is re-exported as `match`/`P`)
- `packages/vitest` → `@unthrown/vitest` (peerDep `vitest`)
- `packages/effect` → `@unthrown/effect` (peerDep `effect`)
- `packages/neverthrow` → `@unthrown/neverthrow` (peerDep `neverthrow`)
- `packages/boxed` → `@unthrown/boxed` (peerDep `@bloodyowl/boxed` — Boxed's
  maintained scope; `@swan-io/boxed` is the deprecated former name)
- `packages/standard-schema` → `@unthrown/standard-schema` (dep on the
  types-only `@standard-schema/spec`; bridges Zod/Valibot/ArkType validators to
  `Result` via `fromSchema` / `fromSchemaAsync`, with the validation issues as
  the modeled `E`)
- `packages/oxlint` → `@unthrown/oxlint` (an oxlint **JS plugin**, peerDep
  `oxlint`, dep `@oxlint/plugins`; ships **four rules**: `no-ambiguous-error-type`
  — enforces Thesis #1 against `unknown`/`any`/`Error`/`{}` **and the primitive
  keywords** (`void` included) in `E`; `prefer-async-result` (reports
  `Promise<Result<T, E>>` in favour of `AsyncResult<T, E>`, but withholds the
  autofix on an `async` function's return annotation **and in function-type
  return positions** — either must stay a native `Promise` at the
  implementation, so the fix would not compile); `no-unhandled-result` (in the
  recommended preset — flags a bare `ExpressionStatement` dropping a `Result`:
  a call to an unthrown-imported producer or facade-companion member, or to a
  locally-declared function whose return annotation is unthrown's
  `Result`/`AsyncResult`, awaited or not; deliberately syntactic — a dropped
  method _chain_ like `r.map(f);` is type-dependent and out of scope); and
  `no-throw` (**opt-in**, not in the preset — reports every `throw` statement,
  pointing at `Err`/`getOrThrow`/`fromSafeThrowable`; this is the `no-throw`
  rule the `getOrThrow` rationale references). Purely syntactic AST rules that
  resolve bindings via scope analysis keyed by the **imported** name (renamed
  and namespace imports resolve; alias indirection like `type E = unknown` is a
  documented limit) so they only fire on unthrown's `Result`. No TypeDoc API
  page; documented in the Linting guide.
  Tested with oxlint's `RuleTester` from `oxlint/plugins-dev`.)
- `packages/prisma` → `@unthrown/prisma` (peerDep `@prisma/client` ^7; a Prisma
  Client **extension** — `$extends(unthrownPrisma)` adds `try*` variants of
  **all seventeen** model delegate operations alongside the raw promise ones,
  each an `AsyncResult` whose error channel is exactly the P-codes that
  operation can raise: `UniqueConstraintViolation` P2002, `ForeignKeyViolation`
  P2003, `RecordNotFound` P2025, everything else `DriverError` with the cause
  preserved — `upsert` and the `*Many` batch mutations never carry P2025 (an
  upsert miss creates; zero batch matches is `Ok({ count: 0 })`). Also
  `$tryTransaction` (an interactive transaction whose callback
  speaks `AsyncResult` — an `Err` rolls back and re-surfaces typed; a defect
  rolls back and stays a defect, a throwing callback included) and
  `tryPaginate(...).withCursor(...)` (the
  `prisma-extension-pagination` cursor API with its unmerged #35 fix folded
  in). Qualification happens once inside the extension via the exported
  `qualifyPrismaError`; the raw methods stay as the escape hatch for batch
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
  `mapErr` into `errors.CODE(...)` at the endpoint is the Thesis-#3 triage
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
  `TaggedError` (match it on `code`, e.g. `.mapErr((matcher) => matcher.with({
code: "NOT_FOUND" }, …))`); non-inferable →
  `Defect`. Event-iterator (streaming) procedures are deliberately out of
  scope — the raw client is the escape hatch. Tested end-to-end against real
  oRPC machinery: `createRouterClient` in-process plus an
  `RPCHandler`/`RPCLink` loop through a custom `fetch` (real JSON
  serialization, where the defect-collapse to `INTERNAL_SERVER_ERROR`
  actually happens). **Deliberately outside the fixed version group** — its
  majors track oRPC's cadence, not the family's. Documented in the oRPC guide
  page.)
- `tools/tsconfig`, `tools/typedoc` → private shared config (`@unthrown/tsconfig`,
  `@unthrown/typedoc`)
- `docs` → `@unthrown/docs`, the VitePress site (guide + TypeDoc-generated API
  reference); deployed to GitHub Pages by `deploy-docs.yml`

Core depends on `ts-pattern` (it powers the error matchers). Never pull
`vitest` or any interop peer (`effect`, `neverthrow`, `@bloodyowl/boxed`,
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
   `keyof A extends never ? void : A` trick) and `tag(t)` (the `{ _tag: t }`
   ts-pattern pattern). A per-tag exhaustive fold is `match`'s `err` handler
   with the ts-pattern matcher (`matcher.with(tag("…"), …)`), not a dedicated
   `matchTags` — that former helper was folded into `match` when the matcher
   became the error-channel convention.
3. ✅ **`packages/vitest`** — Done. Custom matchers `toBeOk`, `toBeOkWith`,
   `toBeErr`, `toBeErrWith` (the error-value mirror of `toBeOkWith` — a deep
   compare of the `Err` value), `toBeErrTagged` (optional second arg also matches
   the tagged error's payload — exact for a plain object, partial for an
   asymmetric matcher like `expect.objectContaining`), `toBeDefect`, registered
   via `expect.extend`
   and augmenting Vitest's `Matchers` interface. They detect a thenable
   `AsyncResult` and await internally, so a test reads
   `await expect(asyncResult).toBeOk()`. A forgotten `await` is **loud**: the
   matchers track in-flight assertions and a module-registered `afterEach`
   (`failOnForgottenAwait`) fails the test at its end, naming the pending
   matchers — the abandoned assertion is reported exactly once, correctly
   attributed, and can never late-fire as an unhandled rejection.
4. ✅ **ts-pattern integration** — Done. `ts-pattern` is a core dependency: it
   powers the exhaustive error matchers (Thesis #5) and is re-exported as
   `match`/`P`, plus `tag(t)` (the `{ _tag: t }` pattern). Because `Result` is a
   discriminated union (Thesis #1), `match(result).with(P.…)` also matches a
   whole `Result` natively. (The former standalone `@unthrown/pattern` package
   was folded into core when the dependency was taken.)

Also shipped: a root `README` + `LICENSE`, per-package READMEs, and the VitePress
docs site (guide + generated API reference). Both the npm packages and the
GitHub Pages site are live (the release secrets / npm Trusted Publishers are
configured outside the repo).

## Toolchain & conventions

- **Stack:** pnpm (catalog) + turbo; build with **tsdown** (dual CJS/ESM + d.ts);
  lint/format with **oxlint** / **oxfmt**; **knip** for dead-code/deps; **vitest**
  (+ v8 coverage); **typedoc** (markdown) feeding **vitepress**; **changesets**
  for releases; **lefthook** + **commitlint** (conventional commits) on commit.
- **Gate (all must stay green):** `pnpm format --check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build`. CI mirrors these.
- TypeScript `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`;
  ESM-first; `moduleResolution: NodeNext` (relative imports use `.js`).
- **oxlint rules are binding:** no `interface` (use `type`), no `any` (use
  `unknown`). Genuine exceptions (e.g. the `vitest` `Matchers` augmentation, the
  `AsyncRes.then` thenable) carry a targeted `oxlint-disable` with a reason.
- Tests: Vitest. Every load-bearing invariant above gets an explicit test
  (`invariants.spec.ts` guards them 1:1); core holds 100% line/function coverage,
  enforced by thresholds in its `vitest.config.ts`.
- **Type-level tests:** `packages/core/src/types.test-d.ts` asserts the
  type-level behaviour the runtime can't (the conditional `all`/`allFromDict`
  shapes, `Exclude<R, Defect>` boundary inference, `flatTap`/`recoverErr` channel
  widening, the `this is …` guard narrowing, `match`'s `err`-matcher
  exhaustiveness (a missing tag does not compile; the folded type unions the
  branch returns), and the
  error-matcher semantics — narrowing, defect/throw-branch subtraction,
  `P._` catch-all, grouped patterns, `code`-discriminated and untagged unions,
  forced exhaustiveness (a missing case does not compile), the `E`-inference
  regression guard (`combine` still infers), and the `flatMapErr`/`flatTapErr`
  async-branch rejection) with a
  `Expect<Equal<…>>` helper plus `@ts-expect-error` for must-not-compile cases.
  They are checked by `tsc` via `tsconfig.test-d.json` (which relaxes
  `noUnusedLocals`), folded into the package's `typecheck` script — so a typing
  regression fails the gate. The file is excluded from the build, coverage,
  oxlint, and knip (it has no runtime).
- Public API carries full **TSDoc**; `pnpm --filter <pkg> build:docs` must stay
  typedoc-warning-free.
- One concept = one name. Resist convenience aliases.
- The core has **one runtime dependency, `ts-pattern`** (it powers the error
  matchers and is re-exported). Add no others — protect that minimalism.
