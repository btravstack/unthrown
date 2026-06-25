# unthrown — Design Memory

A handoff record of the design conversation that produced `unthrown`. It captures
not just the decisions but the reasoning and the alternatives that were rejected,
so the intent survives into future work. The distilled, always-on rules live in
`CLAUDE.md`; this document is the context behind them.

---

## 1. What and why

`unthrown` is a small TypeScript library for **explicit errors as values**, with
a separate **defect channel** for the unexpected.

It was started because the existing options each fail a specific requirement:

- **boxed** — no defect channel for unexpected errors; doesn't enforce
  error qualification when a value comes from a promise; ships an `Option` type,
  which is an unwanted second way to express absence when the type system already
  has `undefined` / `null` / `Result<T, NotFound>`.
- **neverthrow** — also no proper unexpected-error channel; maintenance concerns.
- **effect** — too heavy; conflates error handling with context, runtime, etc.

The name encodes the thesis: ordinary errors are _unthrown_ — returned as values,
not thrown. The one thing that still throws is a true defect, and only at
`unwrap`. The name was chosen over absolutist alternatives (`nothrow`,
`infaillible`) precisely because it stays accurate given the defect channel: it
claims only that _modeled_ errors are values, which is exactly true.

---

## 2. Core design decisions (in order, with rationale)

### 2.1 The defect channel — erase it from the type

`Result<T, E>` where `E` is **only the anticipated domain failures**. A defect is,
by definition, a failure you did not model; if it appears in `E` you've modeled it
and it's no longer a defect. So: **three runtime states (Ok | Err | Defect), two
type parameters (T, E)**. `Defect` is a value, not a thrown exception, so
errors-as-values stays uniform — one `match({ ok, err, defect })` at the edge maps
to 2xx / 4xx / 5xx with no `try/catch`.

The asymmetry is deliberate (mirrors Effect's `die`): `Defect` short-circuits
through `map`/`flatMap` like `Err`, but `mapErr`/`recover`/`orElse` **cannot**
touch it — only `recoverDefect` can. Recovering from a defect should be awkward,
because usually you don't: you let it bubble to the edge, log, return 500.

### 2.2 No `Option`

Decided. Absence is `T | undefined`, `T | null`, or `Result<T, NotFound>`.
`fromNullable(value, onAbsent)` is the sanctioned bridge for nullable third-party
APIs so nobody is stranded at the boundary reaching for an `Option` we didn't ship.

### 2.3 Qualification enforced at boundaries

The boxed/neverthrow original sin is `fromPromise(p): AsyncResult<T, unknown>`.
Instead, `fromPromise` / `fromThrowable` take a mandatory
`qualify: (cause: unknown) => E | Defect`. The caller is _obligated_ to triage
every failure into "domain error" or "defect". There is no code path that yields
`unknown` in `E`. (`qualify` combinators like `byInstance` / a Zod-driven
`byShape` can come later to cut boilerplate.)

### 2.4 sync/async unification — **AsyncResult wrapper** (chosen)

Considered: a thenable `AsyncResult` wrapper with full method parity (neverthrow
style) vs plain `Promise<Result<T,E>>` vs Effect's single unified type.
**Chose the AsyncResult wrapper** for chaining ergonomics, accepting the doubled
method surface / test matrix as the cost.

It is typed `Awaitable<Result<T,E>>` — a **success-only thenable**, not a full
`PromiseLike`. Because the internal promise never rejects (§4.5), there is no
rejection channel to advertise: `Awaitable` exposes only `then(onfulfilled)`, so
`await` yields a `Result` and can never throw. At runtime it stays a thenable
(the only way `await` collapses it), and its `then` still forwards `onrejected`
so a hypothetical internal rejection settles the await rather than hanging. The
narrowing also means an `AsyncResult` is not structurally a `PromiseLike`, which
nudges callers away from treating it as a raw promise (e.g. dropping it into
`Promise.all`).

### 2.5 `TaggedError` convention (chosen)

Errors follow a `TaggedError` convention like Effect's `Data.TaggedError`: a class
extending `Error` with a `_tag` discriminant, built by a factory using TS
instantiation expressions (4.7+) and the `keyof A extends never ? void : A` trick
so a payload-less error constructs with no args. **Core `Result<T, E>` stays
generic in `E`** (unconstrained, so primitive errors still work); only the
tag-aware utilities require `E extends { _tag: string }`. This keeps layering
clean.

### 2.6 The load-bearing decision — combinators **catch** throws (confirmed)

A value thrown by a callback inside any combinator is **caught and converted to a
`Defect`**, never allowed to escape. This is what makes "no `try/catch` at the
edge" real: a bug in a `.map` becomes a defect, short-circuits, and is handled at
`match`. (V8 hasn't deopted non-throwing `try/catch` in years, so this is a
semantics choice, not a perf one.) The rejected alternative was leaving throws raw
so defects enter only via boundary `qualify`.

### 2.7 One word for the defect channel — **"defect"** (revised)

The surface originally mixed two words for the same concept: `defect`/`Defect`/
`recoverDefect`/`tapDefect`/`match.defect` on one side, and `panic`/`isPanic`/
`PanicView` plus a `panic()` constructor on the other. That split was an
inconsistency, not a distinction worth keeping — it cut across the API (you'd
_construct_ with `defect()` but _guard_ with `isPanic()`). **Standardized on
"defect"** everywhere: `isPanic`→`isDefect`, `PanicView`→`DefectView`, the
internal state tag `"panic"`→`"defect"`. "Panic" now survives only as the
metaphor for the one place a defect actually throws (`unwrap`). This matches the
thesis wording ("separate defect channel", "only a true defect ever throws") and
Effect's "defect" framing; the noun also fits errors-as-values better than the
verb "panic". The rarely-used public `panic()` constructor was **dropped** (a
defect Result is reached via `qualify` or a combinator throw, not hand-built),
and the qualify-marker guard was renamed `isDefectMarker` (internal) to free
`isDefect` for the Result state guard. `Defect` (the type) now names both the
qualify-time marker and the runtime state — the same dual role `Err`/`err` plays.

### 2.8 `Result` type vs `Res` class, and the static-builder facade

`Result<T, E>` is a **type** (a lens) and `Res` is the **class** implementing it.
The split is load-bearing: `Res._state` must be readable at runtime by
module-mates (`AsyncRes`, `all`) yet absent from the public type, so users can't
branch on `._state.tag` or reach `.value` without a guard. A single public class
can't hide its own field; the type/class separation is what makes "check before
you access" enforceable, keeps the third state invisible to the type, and lets
`recover` return `Result<T | U, never>` while a defect may still be present at
runtime. Builders stay **free functions** (`ok`, `err`, …) because they
tree-shake (there is a `bundle-size` CI gate) where static methods on a class
would not. To answer the discoverability/namespacing cost, a `Result` **companion
object** (`Result.ok`/`err`/`defect`/`from*`/`all`/`is*`) is exported alongside —
value and type share the name. It is additive and zero-cost when unused (a
separate export, tree-shaken if you only `import { ok }`); the free functions
remain primary. A single-class redesign (static builders, `#private` state) was
considered and rejected: it loses builder tree-shaking, forces `all`/the async
bridge into statics, and still needs a separate `AsyncResult` class.

### 2.9 No raw `Promise` in `AsyncResult` combinators (revised)

`AsyncResult` methods originally accepted async callbacks (`map(f: (v) => U |
Promise<U>)`, `flatMap(f: (v) => … | Promise<Result>)`, etc.). That quietly
opened a **second, un-qualified async boundary**: a `Promise` returned from a
combinator could reject, and the rejection became a defect — with no `qualify`
triage, defeating Thesis #3 (qualification at every boundary). **Removed every
raw `Promise` from `AsyncResult` callbacks**: combinator callbacks are now
synchronous, and the binds (`flatMap`/`orElse`/`recoverDefect`) accept only
`Result | AsyncResult`. The single sanctioned way a `Promise` enters the Result
world is the interop layer (`fromPromise` with `qualify`, or `fromSafePromise` =
all-defect). Async composition is `flatMap(v => fromPromise(work(v), qualify))` —
more verbose than `map(async …)`, but that verbosity _is_ the forced triage. The
implementation mirror: sync-callback methods dropped their `async`/`await`; the
binds keep `await` only to collapse a returned `AsyncResult` to a `Result`.

---

## 3. Method surface

`Result<T, E>` and `AsyncResult<T, E>` share one surface. `AsyncResult` is an
awaitable wrapper with method parity, typed `Awaitable<Result<T,E>>` (a
success-only thenable, not a full `PromiseLike` — see 2.4); its combinator
callbacks are synchronous (no raw `Promise` — see 2.9); `await` collapses it to a
`Result`.

- success: `map`, `flatMap`, `tap`, `as`
- error: `mapErr`, `orElse`, `recover`, `tapErr`
- defect: `recoverDefect`, `tapDefect`
- eliminate: `match`, `unwrap`, `unwrapErr`, `unwrapOr`, `unwrapOrElse`,
  `getOrNull`, `getOrUndefined`
- guards: methods `isOk`/`isErr`/`isDefect` (boolean); standalone
  `isOk`/`isErr`/`isDefect` narrow to `OkView`/`ErrView`/`DefectView`
- constructors: `ok`, `err`, `defect`
- interop: `fromNullable`, `fromThrowable`, `fromPromise`, `fromSafePromise`
- aggregate: `all` (first `Err` wins; any `Defect` dominates)
- facade: a `Result` companion object aliasing the standalone entry points
  (`Result.ok`/`err`/`defect`/`from*`/`all`/`is*`); free functions stay primary
  (see 2.8)

**Deliberately excluded:** `gen`/do-notation (the single heaviest possible
addition; deferred — revisit only if sequential code genuinely demands it, and it
complicates defect semantics because a `throw` inside the generator needs a
defined meaning), accumulation/`Validation`, and convenience aliases (`andThen`,
etc.). The durability strategy is a small surface that can be "done" — a fourth
single-maintainer Result lib inherits the same bus-factor risk that motivated
leaving neverthrow, so resisting scope creep is the moat.

---

## 4. Runtime invariants (must be guarded by tests)

1. **Throw → defect** in every combinator (see 2.6).
2. **A `Defect` flows through every method untouched except `match()` and
   `recoverDefect()`.** Hence `unwrapOr` / `unwrapOrElse` / `getOrNull` /
   `getOrUndefined` still throw on a `Defect` — they recover the modeled `Err`,
   not an unmodeled bug.
3. **`unwrap()` is asymmetric:** `Err` → throws `UnwrapError` carrying `E`;
   `Defect` → rethrows the original `cause` with original stack.
4. **`recover` returns `Result<T | U, never>`; `never` = the error channel is
   emptied, not that a `Defect` can't be present.** The one intentional spot where
   the type under-describes the runtime. Don't read it as "total".
5. **An `AsyncResult`'s internal promise never rejects** — every rejection/throw
   becomes `Err` (via `qualify`) or `Defect`. `await` always yields a `Result`.

---

## 5. Utilities & package layout

- `packages/core` → `unthrown` — **zero runtime dependencies** (protect this).
  Includes `matchTags`, a zero-dep exhaustive fold whose handler object is
  `{ Ok, Defect } & { [K in E["_tag"]]: (e: Extract<E, {_tag: K}>) => R }` — miss
  a tag and it won't compile, no `.exhaustive()` to forget.
- `packages/pattern` → `@unthrown/pattern` — peerDep `ts-pattern`. **Thin**
  integration: tagged unions already match natively in ts-pattern, so this is just
  a `P.tag(tag)` sugar + an adapter exposing ok/err/defect. It's the _richer_
  layer (guards, nested patterns); `matchTags` covers the everyday case.
- `packages/vitest` → `@unthrown/vitest` — peerDep `vitest`. Matchers: `toBeOk`,
  `toBeOkWith`, `toBeErr`, `toBeErrTagged`, `toBeDefect`. **Augment the `Matchers`
  interface (Vitest 3.2+** unifies `expect.extend` / `expect().*` / `expect.*`;
  pre-3.2 augment `Assertion` + `AsymmetricMatchersContaining`). Async matchers
  detect a thenable `AsyncResult` and await internally, so tests read
  `await expect(asyncResult).toBeOk()` — document the required `await` loudly, a
  forgotten one makes the assertion silently pass. Note: custom matchers assert at
  runtime but won't narrow `T` like a type guard — that's why core also exposes
  `isOk`/`isErr`/`isDefect` guards.

Never pull `ts-pattern` or `vitest` into core.

---

## 6. Naming exploration (how we got to `unthrown`)

npm's single-word namespace is exhausted; every bare common word was taken.
Explored three registers, checking npm + GitHub availability for each:

- **Pattern/mechanism register:** `ecluse` (a canal lock — the qualification
  boundary; Breton resonance) and `aiguillage` (railway switch — railway-oriented
  programming is _the_ metaphor for Result). Set aside as too mechanism-focused.
- **Concern-as-adjective register:** `manifeste` (errors made manifest + a
  manifesto for explicit errors) and `limpide` (transparent — see straight through
  to every failure). Strong, but adjectives.
- **Concept-as-promise register:** `unthrown` — names the behavioral promise, is
  English (consistent with the `amqp-contract` / `temporal-contract` OSS brand),
  and is _accurate_ about the defect channel where the absolutist options
  overclaim. **Chosen.**

`unthrown` is free on npm and `github.com/unthrown` was free as an org (project
lives at `github.com/btravers/unthrown`). The `@unthrown` npm scope is a separate
claim from the unscoped package — publish placeholders on both early, since the
util packages depend on the scope existing and names get sniped.

---

## 7. Implementation status

- **`packages/core` — written, split into focused modules, and fully tested.**
  - Compiles clean under `strict` + `exactOptionalPropertyTypes` +
    `noUncheckedIndexedAccess` on TypeScript 6.
  - Source layout (see §2.8): `types.ts` (public types), `defect.ts` (the
    `Defect` marker plumbing), `core.ts` (the `Res`/`AsyncRes` engine +
    `UnwrapError`), `constructors.ts` (`ok`/`err` + guards), `interop.ts`
    (`from*`/`qualify`/`all`), `facade.ts` (the `Result` companion object), and
    `index.ts` (curated re-exports). `core.ts` is the only module the rest depend
    on and is never re-exported, keeping `Res._state` hidden.
  - **Vitest suite: 98 tests across 7 `*.spec.ts` files**, 100% line/function
    coverage (branches 90% — the remainder is the deliberately-unreachable
    defensive `then` rejection path). `invariants.spec.ts` guards each
    load-bearing invariant from §4 / CLAUDE.md 1:1; the other specs cover the
    full surface (sync `Result`, `AsyncResult`, constructors/guards, interop,
    `all`, facade). Coverage thresholds in `vitest.config.ts` lock this in.
  - Internal representation: a single `Res` class over a `State` discriminated
    union; `AsyncRes` wraps a `Promise<Res>` constructed never to reject.
    `Res._state` is public-at-runtime but absent from the `Result` type;
    `value`/`error`/`cause` getters back only the narrowed guard views. Pass-
    through branches use `as unknown as Result<…>` casts, confined to provably-
    non-`ok` states.

---

## 8. Roadmap (suggested order)

1. ✅ **Scaffold the workspace** — done (pnpm + turbo + tsdown, oxlint/oxfmt,
   knip, changesets, CI). Publishing the names to npm remains a manual step.
2. ✅ **`packages/core/src/tagged.ts`** — done. `TaggedError` factory +
   `matchTags`, fully tested and TSDoc'd.
3. ✅ **`packages/vitest`** — done. The matchers above (`expect.extend` +
   `Matchers` augmentation), thenable-aware, fully tested.
4. **`packages/pattern`** — the thin ts-pattern layer.

Throughout: Vitest, one concept = one name, core stays dependency-free, and every
invariant in §4 gets an explicit test (seed them from the 13 smoke checks).
