# Migrate from Boxed

> **How-to.** Boxed (`@bloodyowl/boxed`) and unthrown agree on the core —
> failures as values, a `Result` you match on — so most of the `Result` surface
> maps row for row. The real work sits in the types Boxed has and unthrown
> deliberately does not: `Option`, `AsyncData`, and `Future`'s untriaged error
> channel. Do those on purpose, not by search-and-replace.

## API mapping

| Boxed                                                    | unthrown                                          | Notes                                                                            |
| -------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Result.Ok(v)` / `Result.Error(e)`                       | `Ok(v)` / `Err(e)`                                | free functions, not statics                                                      |
| `result.map(f)` / `result.flatMap(f)`                    | same                                              | callbacks must be synchronous                                                    |
| `result.mapError(f)`                                     | `result.mapErrCases((matcher) => …)`              | an exhaustive match — one `.with(…)` arm per case in `E`, not a single callback  |
| `result.match({ Ok, Error })`                            | `match({ ok, errCases: (matcher) => …, defect })` | the third channel is new — see below                                             |
| `result.getWithDefault(v)` / `getOr(v)`                  | `result.getOr(v)`                                 | still throws on a Defect (a bug is not an absent value)                          |
| `result.toUndefined()` / `toNull()`                      | `getOrUndefined()` / `getOrNull()`                | same recovery, `get…` spelling                                                   |
| `result.tapOk(f)` / `tapError(f)`                        | `tap(f)` / `tapErrCases((matcher) => …)`          | the error observer takes the same exhaustive matcher                             |
| `Result.fromExecution(fn)`                               | `fromThrowable(fn, qualify)`                      | wraps the **function**; `qualify` triages each throw into `E` or `defect(cause)` |
| `Result.fromNullable(v)` (+ `fromNull`, `fromUndefined`) | `fromNullable(v, onAbsent)`                       | absence gets a **named** error, not `undefined` in `E`                           |
| `Result.all([...])` / `allFromDict({...})`               | `all([...])` / `allFromDict({...})`               | same shapes; any `Defect` dominates                                              |
| `Future<Result<T, E>>`                                   | `AsyncResult<T, E>`                               | both never reject — the kinship that makes this migration natural                |
| `Future.fromPromise(p)`                                  | `fromPromise(p, qualify)`                         | Boxed hands you `Result<T, Error>`; `qualify` forces the triage instead          |
| `future.mapOk(f)` / `future.mapError(f)`                 | `asyncResult.map(f)` / `mapErrCases(…)`           | the `Ok`-suffix disappears — the combinators are channel-named already           |
| `future.flatMapOk(f)`                                    | `asyncResult.flatMap(f)`                          | `f` may return a `Result` or an `AsyncResult`                                    |
| `future.mapOkToResult(f)`                                | `flatMap(f)` — or `ensure(pred, onFail)`          | when `f` only gates its own argument, `ensure` is the named form                 |
| `future.mapErrorToResult(f)`                             | `flatMapErrCases((matcher) => …)`                 | fallback on the error channel, exhaustively                                      |
| `Future.all([...])`                                      | `allAsync([...])`                                 | `Future.allFromDict` → `allFromDictAsync`                                        |
| `Option`                                                 | —                                                 | deliberately no `Option` — see below                                             |
| `AsyncData` / `Deferred`                                 | —                                                 | request-lifecycle state, not error handling — see below                          |
| `Future.retry` / `Future.concurrent`                     | —                                                 | orchestrate with your async tooling **before** the `fromPromise` boundary        |

## Delta 1 — `Option` disappears

unthrown has no `Option` type, on purpose: absence is expressed with the type
system we already trust. Each `Option` in your code is one of three things —
decide which, per site:

```ts
// 1. Absence is a normal, expected shape → T | undefined
function findCached(sku: string): Item | undefined {
  return cache.get(sku) ?? undefined;
}

// 2. Absence is a failure the caller must handle → Result<T, NotFound>
function requireItem(sku: string): Result<Item, ItemNotFound> {
  return fromNullable(cache.get(sku), () => new ItemNotFound({ sku }));
}

// 3. A nullable third-party API crossing into a pipeline → fromNullable at the boundary
const port = fromNullable(process.env["PORT"], () => "port_unset" as const);
```

An `Option`-returning helper whose callers all fold with a default
(`getWithDefault`) is case 1 — the migration usually _deletes_ the combinator
chain, because with `T | undefined` a plain conditional does the folding.
`option.toResult(error)` sites are case 2 by definition. Resist inventing a
local `Option` to keep the shapes — the [design decision](../explanation/design-decisions)
is that two ways to spell absence is one too many.

## Delta 2 — the error channel is triaged, and defects get their own lane

Boxed's `Future.fromPromise` gives you `Result<T, Error>` — every rejection,
expected or not, lands in the error channel as `Error` (usually behind an
`as Error` cast). unthrown's boundary makes you decide, per cause:

```ts
// Boxed — everything is Error, the cast is load-bearing
Future.fromPromise(api.get(`/items/${sku}`)).mapError((e) => e as Error);

// unthrown — each rejection is triaged into a named case or the defect channel
fromPromise(api.get(`/items/${sku}`), (cause, defect) =>
  isHttpNotFound(cause) ? new ItemNotFound({ sku }) : defect(cause),
);
```

If a boundary's rejections really are all one anticipated failure, qualify them
all into one named case (`(cause) => new FetchFailed({ sku, cause })`) — ignoring
the injected `defect` helper is a legitimate "fully modeled" decision. What you
may not do is keep `E = Error`: the
[`no-ambiguous-error-type`](./lint-your-codebase#no-ambiguous-error-type) rule
holds the line, and everything that was "whatever, stick it in `Error`" now
belongs to [the defect channel](../explanation/the-defect-channel).

The payoff mirrors the [neverthrow migration](./migrate-from-neverthrow#delta-1--the-defect-channel):
a throw inside any combinator becomes a `Defect` and flows to `match`'s
mandatory `defect` arm, so the defensive `try`/`catch` around pipelines goes
away.

## Delta 3 — `AsyncData` has no target, and that's fine

`AsyncData` models a request's _lifecycle_ (`NotAsked` / `Loading` / `Done`),
which is UI state, not error handling — unthrown deliberately stays out of it.
Two honest options:

```ts
// Model it yourself — a small discriminated union, matchable natively
type ItemState =
  { tag: "NotAsked" } | { tag: "Loading" } | { tag: "Done"; result: Result<Item, FetchFailed> };
```

or keep using Boxed's `AsyncData` for view state while the data layer speaks
unthrown — the two compose fine, since the `Done` payload can hold an unthrown
`Result`. What should **not** survive is `AsyncData` used as an error-handling
device deep in the data layer. One caveat either way: a `Result` does not
survive `structuredClone`/JSON — fold it with `match` before persisting or
sending state over a wire.

## Migrate gradually with the bridge

`@unthrown/boxed` keeps a mixed codebase compiling while you migrate module by
module: `fromBoxed` / `fromBoxedFuture` lift a still-Boxed dependency into a
pipeline (never a `Defect` — Boxed has only two channels), and `toBoxed` /
`toBoxedFuture` serve a not-yet-migrated caller, with a **mandatory `onDefect`**
so a defect is never silently folded into the caller's `E`. See
[Interoperate with other libraries](./interoperate-with-libraries) for the
rules of that seam.

## What you can delete after migrating

- the `as Error` casts on `mapError` — `qualify` replaced them with a decision;
- `Option` wrapper helpers whose callers all folded with a default — `T | undefined`
  plus a conditional does it without a wrapper;
- defensive `try`/`catch` around combinator chains — the defect channel is the
  backstop now.

## Where to go next

- Why there is no `Option`: [Design decisions](../explanation/design-decisions).
- The channel Boxed doesn't have: [The Defect Channel](../explanation/the-defect-channel).
- The same migration from neverthrow: [Migrate from neverthrow](./migrate-from-neverthrow).
