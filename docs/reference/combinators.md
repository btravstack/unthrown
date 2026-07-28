# Combinator reference

> **Reference.** A complete, structured description of the method surface: what
> each combinator does, which channel it touches, and how it moves the type. For
> the reasoning behind the error-channel matcher, see
> [Exhaustive error matching](../explanation/exhaustive-error-matching). For each
> method's full signature and prose, see
> [`ResultMethods`](/api/core/#resultmethods) and
> [`AsyncResultMethods`](/api/core/#asyncresultmethods) in the API reference.

Every combinator runs its callback **only on its own channel** and turns a thrown
callback into a `Defect`. `Result` and `AsyncResult` expose the **same set** of
combinators with the same per-channel behavior; only their signatures differ (an
`AsyncResult` combinator returns an `AsyncResult`, its eliminators a `Promise`,
and its binds also accept an `AsyncResult`). The
[Result and AsyncResult](#result-and-asyncresult) section covers the deltas.

## By intent

The `→ Result<…>` half of each signature is the tell — it shows how the combinator
moves the channels: `flatMap` widens `E` to `E | E2`, `recoverErrCases` empties it to
`never`, `flatMapErrCases` widens the value to `T | U`. The error combinators take an
[exhaustive matcher](#the-error-channel) rather than a single callback;
the signatures below abbreviate its callback as `(matcher) => …`.

| I want to…                                     | use               | signature                                                    | channel      |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------ | ------------ |
| transform the success value                    | `map`             | `(v: T) => U` → `Result<U, E>`                               | Ok           |
| chain a `Result`-returning step                | `flatMap`         | `(v: T) => Result<U, E2>` → `Result<U, E \| E2>`             | Ok           |
| run a side effect, keep the value              | `tap`             | `(v: T) => void` → `Result<T, E>`                            | Ok           |
| run a **failable** side effect, keep the value | `flatTap`         | `(v: T) => Result<unknown, E2>` → `Result<T, E \| E2>`       | Ok           |
| validate a success / refine its type           | `ensure`          | `((v: T) => boolean, (v: T) => E2)` → `Result<T, E \| E2>`   | Ok           |
| sequence steps into a named scope              | `Do`/`bind`/`let` | `bind(k, (scope) => Result<U, E2>)` → `Result<{…}, E \| E2>` | Ok           |
| replace the value with a constant              | `as`              | `(value: U)` → `Result<U, E>`                                | Ok           |
| drop the value (success type becomes `void`)   | `discard`         | `()` → `Result<void, E>`                                     | Ok           |
| transform the error (matched)                  | `mapErrCases`     | `(matcher) => …` → `Result<T, E2>`                           | Err          |
| try a fallback that returns a `Result`         | `flatMapErrCases` | `(matcher) => …` → `Result<T \| U, E2>`                      | Err          |
| turn an error into a success value             | `recoverErrCases` | `(matcher) => …` → `Result<T \| U, never>`                   | Err          |
| run a side effect on the error                 | `tapErrCases`     | `(matcher) => …` → `Result<T, E>`                            | Err          |
| run a **failable** side effect on the error    | `flatTapErrCases` | `(matcher) => …` → `Result<T, E \| E2>`                      | Err          |
| recover from a defect (rare)                   | `recoverDefect`   | `(cause) => Result<U, E2>` → `Result<T \| U, E \| E2>`       | Defect       |
| observe a defect, e.g. log it                  | `tapDefect`       | `(cause) => void` → `Result<T, E>`                           | Defect       |
| observe **any** failure (error _or_ defect)    | `tapFailure`      | `(f: FailureView<E>) => void` → `Result<T, E>`               | Err + Defect |
| handle all three channels at the edge          | `match`           | `{ ok, errCases, defect }` → `R`                             | all          |
| combine an array of `Result`s                  | `all`             | `Result<T, E>[]` → `Result<T[], E>`                          | —            |
| combine a record of `Result`s                  | `allFromDict`     | `{ [k]: Result<T, E> }` → `Result<{ [k]: T }, E>`            | —            |

## Behavior at a glance

A combinator touches **only its own channel**; the other two flow through
untouched (`tapFailure` is the one combinator whose "own channel" spans both
failures). The `Defect` column is "passes ▸" everywhere except `recoverDefect`,
the observers (`tapDefect` / `tapFailure`), and `match`:

| method                            | on `Ok`  | on `Err`      | on `Defect` | resulting `E`   |
| --------------------------------- | -------- | ------------- | ----------- | --------------- |
| `map`                             | runs `f` | passes ▸      | passes ▸    | `E`             |
| `flatMap`                         | runs `f` | passes ▸      | passes ▸    | `E \| E2`       |
| `tap` / `flatTap`                 | runs `f` | passes ▸      | passes ▸    | `E` / `E \| E2` |
| `ensure`                          | runs `f` | passes ▸      | passes ▸    | `E \| E2`       |
| `mapErrCases`                     | passes ▸ | runs a branch | passes ▸    | `E2`            |
| `flatMapErrCases`                 | passes ▸ | runs a branch | passes ▸    | `E2`            |
| `recoverErrCases`                 | passes ▸ | branch → `Ok` | passes ▸    | `never`         |
| `tapErrCases` / `flatTapErrCases` | passes ▸ | runs a branch | passes ▸    | `E` / `E \| E2` |
| `recoverDefect`                   | passes ▸ | passes ▸      | runs `f`    | `E \| E2`       |
| `tapDefect`                       | passes ▸ | passes ▸      | runs `f`    | `E`             |
| `tapFailure`                      | passes ▸ | runs `f`      | runs `f`    | `E`             |
| `match`                           | `ok()`   | `errCases()`  | `defect()`  | —               |

::: tip `recoverErrCases`'s `never` under-describes the runtime
`recoverErrCases` empties only the **error** channel to `never` — a `Defect` can still be
present at runtime and flows past it untouched. See
[The Defect Channel](../explanation/the-defect-channel#recovererrcases-clears-the-error-channel-not-the-runtime).
:::

## The error channel

The error combinators — `mapErrCases`, `flatMapErrCases`, `recoverErrCases`, `tapErrCases`,
`flatTapErrCases` — do not take a single callback. Their callback receives a
built-in match builder over the
error (`match(error)`; the patterns are re-exported from `unthrown` as `P`), and
you **return the un-terminated builder** — the combinator calls `.exhaustive()`
for you:

```ts
import { P, tag } from "unthrown";

db.reading.tryFindUniqueOrThrow({ where: { id } }).mapErrCases(
  (matcher, defect) =>
    matcher
      .with(tag("RecordNotFound"), () => new ReadingNotFoundException(id))
      .with(tag("DriverError"), (e) => defect(e.cause)), // deliberate defect — the tag leaves E
);
```

A match that misses a case **does not compile** — there is no `.exhaustive()` to
forget, and no `.otherwise()` to slip in a fallback. The rationale is in
[Exhaustive error matching](../explanation/exhaustive-error-matching). The rules:

- **Match on anything, not just `_tag`.** The matcher matches by structure, so a
  `code`-discriminated union (the oRPC shape), a plain string, a guard
  (`.with({ code: "NOT_FOUND", id: "special" }, …)`), or grouped patterns
  (`.with(a, b, handler)` — one strategy for several cases) all work. `tag("X")`
  is sugar for the `{ _tag: "X" }` pattern, narrowing to the variant and its
  payload.
- **The outgoing `E` is the union of the branch returns.** A branch receives the
  narrowed variant **and the injected `defect` helper** (the same second argument
  `qualify` gets at a boundary): `defect(cause)` converts a case to a defect, and
  its `Defect` arm is subtracted from the outgoing `E` (`Exclude<O, Defect>`) —
  so defecting a case removes it from the modeled channel. A branch that `throw`s
  also becomes a defect, but `defect(...)` is the lint-clean, expression-position
  form.
- **…unless you declare it.** `matcher.returnType<R>()`, called directly after
  the matcher is handed to you, pins the output to `R`: every branch is checked
  against it (a mismatch is reported on that branch) and the outgoing channel is
  `R` rather than the union of the branch returns. Reach for it when a signature
  decides the type — most sharply in code generic in `E`. A `defect(…)` branch
  stays legal under a pin. See
  [Exhaustive error matching](../explanation/exhaustive-error-matching#declaring-the-output-returntype-r).
- **Cases that share a strategy are _grouped_, not wildcarded.** `.with(a, b, handler)`
  runs one handler for several patterns while keeping both named, so the union
  stays written out and a new case still breaks the build. This is the answer
  whenever you'd reach for "and everything else the same way".
- **`P._` is the catch-all of last resort.** One wildcard branch —
  `matcher.with(P._, (e) => wrap(e))` — makes any match exhaustive, which is
  exactly why it is not the default shape: it keeps compiling when `E` grows,
  and that is the guarantee the matcher exists to provide. Reserve it for the
  one place enumeration _cannot_ work — a helper still generic in `E` (see
  [Generic boundary helpers](../explanation/exhaustive-error-matching#generic-boundary-helpers-the-catch-all-is-the-only-form-that-compiles))
  — or for an `E` that is a single type with no cases to list. `@unthrown/oxlint`'s
  [`no-catch-all-pattern`](../how-to/lint-your-codebase#no-catch-all-pattern),
  in its recommended preset, enforces that.
- **There is no error-channel identity.** `mapErrCases((m) => m)` is not a no-op — it
  only type-checks when `E` is `never` and otherwise fails to compile (see
  [The Defect Channel](../explanation/the-defect-channel#no-identity-on-the-error-channel)).
  To pass the error through, observe it with `tapErrCases`, or re-emit each case
  by name (`.with(tag("NotFound"), (e) => e)…`).
- **Observers match exhaustively too.** `tapErrCases` and `flatTapErrCases` take the same
  builder; the error is observed and then flows through unchanged. Their branch
  returns are ignored (`tapErrCases`) or thread only a
  _new_ effect failure (`flatTapErrCases`) — the one exception being a branch that
  returns the injected `defect(cause)`, which in either observer behaves like the
  `throw` it stands for. `tapDefect` / `tapFailure` keep single
  callbacks — their payloads carry no discriminant to match.
- **A non-exhaustive match is a `Defect` if it ever slips past the types.** Only
  reachable outside the typed contract (a widened cast, a JS caller): the matcher
  throws `NonExhaustiveError`, which the combinator's throw-to-defect net turns
  into a `Defect`.

### Doing one thing for several errors

When several cases deserve the same handling — logging is the classic case —
**group** them in one arm. The handler is written once; the cases stay named, so
the day `E` grows the call site still lights up:

```ts
import { tag } from "unthrown";

// loadUser: (id: string) => Result<User, NotFound | Forbidden | DriverError>

// log whatever the error is, then let it flow through unchanged
loadUser(id).tapErrCases((matcher) =>
  matcher.with(tag("NotFound"), tag("Forbidden"), tag("DriverError"), (e) => logger.error(e)),
);
```

The same shape works for every error combinator — transform, recover, or fold at
the edge — and mixes freely with per-case arms:

```ts
// one case handled specially, the rest sharing a strategy
result.tapErrCases((matcher) =>
  matcher
    .with(tag("RateLimited"), (e) => metrics.rateLimit(e.retryAfter))
    .with(tag("NotFound"), tag("Forbidden"), (e) => logger.error(e)),
);

result.recoverErrCases((matcher) =>
  matcher.with(tag("NotFound"), tag("Forbidden"), () => fallback),
);

result.match({
  ok: (v) => v,
  errCases: (matcher) => matcher.with(tag("NotFound"), tag("Forbidden"), (e) => `failed: ${e}`),
  defect: (c) => `bug: ${c}`,
});
```

A `P._` branch would be shorter, and that is the trade it makes: it **keeps
compiling when you enrich `E`**, silently absorbing the new case. Grouping costs
one identifier per case and keeps the compiler on your side. Reach for `P._` only
where enumeration is impossible — see
[Generic boundary helpers](../explanation/exhaustive-error-matching#generic-boundary-helpers-the-catch-all-is-the-only-form-that-compiles).

## Result and AsyncResult

Every combinator above exists on **both** `Result` and `AsyncResult` — same names,
same channel behavior. `AsyncResult` (what you get from `fromPromise` /
`fromSafePromise`, or by lifting a sync `Result` with `.toAsync()`) differs in
exactly three ways:

- **Callbacks stay synchronous.** A raw `Promise` may never enter a combinator —
  that would skip qualification and silently become a defect. Do async work by
  re-entering a boundary and composing it with `flatMap`. (See
  [The async model](../explanation/async-model).)
- **The `Result`-returning combinators accept `Result` _or_ `AsyncResult`.**
  `flatMap`, `flatTap`, `flatMapErrCases`, `flatTapErrCases`, `bind`, and `recoverDefect` take
  a callback returning either, so you can mix sync and async steps in one chain.
- **Eliminators return a `Promise`.** `await result.match({ … })` /
  `await result.get()` — or `await` the `AsyncResult` first to collapse it to a
  `Result`, then match synchronously.

Use this table to move between the two:

| I have… and want to…                      | use                                                   |
| ----------------------------------------- | ----------------------------------------------------- |
| build an `AsyncResult` from a value/error | `OkAsync(v)` / `ErrAsync(e)` (no `Ok(v).toAsync()`)   |
| lift a sync `Result` into async           | `result.toAsync()` → `AsyncResult`                    |
| collapse an `AsyncResult` to a `Result`   | `await asyncResult`                                   |
| add an **async** step mid-chain           | `.flatMap((v) => fromPromise(work(v), qualify))`      |
| add a **sync** step to an async chain     | `.flatMap((v) => Ok(v + 1))` — a `Result` is accepted |
| combine async results                     | `allAsync` / `allFromDictAsync`                       |

```ts
// A chain that crosses an async boundary stays an AsyncResult to the end.
const status = await findUser(id) // Result<User, NotFound>  (sync)
  .toAsync() // AsyncResult<User, NotFound>
  .flatMap((user) => fromPromise(loadOrders(user.id), qualify)) // async step — adds LoadFailed to E
  .map((orders) => orders.length) // sync callback, still AsyncResult
  .match({
    ok: (n) => n,
    // the boundary widened E, so both cases are named here
    errCases: (matcher) => matcher.with(tag("NotFound"), () => 0).with(tag("LoadFailed"), () => -2),
    defect: () => -1,
  }); // await collapses it
```

## The pairs that are easy to confuse

**`map` vs `flatMap`** — does your callback return a plain value or a `Result`?
A `(value) => U` is `map`; a `(value) => Result<U, E2>` is `flatMap` (otherwise
you nest a `Result<Result<…>>`).

**`flatMap` vs `flatTap`** — both take a `Result`-returning callback. `flatMap`
**replaces** the value with the callback's; `flatTap` **discards** it and keeps
the original (a validation or write whose _outcome_ matters but whose _value_
you don't need). `tapErrCases`/`flatTapErrCases` are the same pair on the error channel.

**`tap` vs `flatTap`** — decided by what the _effect_ returns, not by what you do
with its value (both keep the original). An effect that cannot fail — logging, a
metric — is `tap`; an effect that returns a `Result`/`AsyncResult` **must** be
sequenced with `flatTap` on the matching surface, because a `tap` callback cannot
thread it.

::: warning A failable effect inside `tap` is silently dropped
`tap` ignores its callback's return value, so the effect's outcome is lost — in
one of two shapes:

- a **sync `Result`** returned from the callback compiles (a `Result` is not a
  thenable), but its `Err` is silently discarded;
- an **`AsyncResult`** is rejected at compile time (it is awaitable, so
  `NotThenable` catches it) — and the tempting "fix" of wrapping the call in
  braces compiles, but leaves the effect **floating**: never awaited, its
  `Err`/`Defect` unobserved.

```ts
.tap((user) => {
  auditLog.record(user); // AsyncResult — floats, never awaited
})
```

Sequence the effect instead. A `Result`-returning effect goes in `flatTap` on
either surface; an `AsyncResult`-returning one only in the **async** `flatTap`:

```ts
.flatTap((user) => auditLog.record(user))
```

:::

**`flatMapErrCases` vs `recoverErrCases`** — both run on `Err`. `recoverErrCases` produces a plain
success value (emptying the error channel to `never`); `flatMapErrCases` produces another
`Result` (which may still be an `Err`).

**`recoverErrCases` vs `recoverDefect`** — `recoverErrCases` handles a modeled `Err`;
`recoverDefect` is the only combinator that can **consume** a `Defect`. Neither is
the other's fallback — a defect flows past `recoverErrCases` untouched.

**`tapErrCases` + `tapDefect` vs `tapFailure`** — when the _same_ effect applies to
both failures (a shared logger, a metric, a rollback trigger), `tapFailure` runs
it once for either. Its callback receives the discriminated **failure variant**
(`FailureView<E>`, i.e. `ErrView | DefectView`) rather than a payload — so branch
on `failure.tag` when you need the typed `error`, or treat it opaquely. It only
_observes_: there is deliberately no `recoverFailure`.

## Eliminating a Result

Reach for an eliminator once you're done chaining:

- `match` — the default at the edge; fold all three channels into one value.
- `get` / `getErr` — extract; type-gated to compile only when the opposite
  channel is `never` (`get` needs `Result<T, never>`, `getErr` needs
  `Result<never, E>`), and _panicking_ (rethrowing the cause) on a defect.
- `getOr` / `getOrElse` / `getOrNull` / `getOrUndefined` — recover an `Err` to a
  fallback, but **re-throw a defect** (it's a bug, not an absent value).
- `getOrThrow` — extract `T`, but **throw the modeled error as-is** on `Err`
  (panicking on a defect). A deliberate escape hatch off errors-as-values: its
  point is to move a literal `throw` behind a method so a `no-throw` lint rule can
  ban raw throws. Prefer `match` / `recoverErrCases` / `flatMapErrCases` when the error can stay a
  value.

On an `AsyncResult` every eliminator returns a `Promise` — `await` it (an `Err` or
`Defect` still throws/rejects, exactly as above).

## Where to go next

- The type surface these methods live on: [Result and AsyncResult](./result-surface).
- Why the error channel is a matcher: [Exhaustive error matching](../explanation/exhaustive-error-matching).
- Full signatures and prose: [`ResultMethods`](/api/core/#resultmethods) in the API reference.
