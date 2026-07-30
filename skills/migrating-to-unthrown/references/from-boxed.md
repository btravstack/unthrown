# Boxed (@bloodyowl/boxed) → unthrown

Apply mechanically; the judgment calls live in SKILL.md's decide-once list.

## Mapping table

| Boxed                                        | unthrown                                          | Notes                                                                                       |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Result.Ok(v)` / `Result.Error(e)`           | `Ok(v)` / `Err(e)`                                | free functions, not statics                                                                 |
| `result.map(f)` / `flatMap(f)`               | same                                              | callbacks must be synchronous                                                               |
| `result.mapError(f)`                         | `mapErrCases((matcher) => …)`                     | exhaustive — one arm per case; no blanket callback                                          |
| `result.match({ Ok, Error })`                | `match({ ok, errCases: (matcher) => …, defect })` | the `defect` arm is new and mandatory                                                       |
| `result.getWithDefault(v)` / `getOr(v)`      | `getOr(v)`                                        | panics on a Defect                                                                          |
| `result.toUndefined()` / `toNull()`          | `getOrUndefined()` / `getOrNull()`                |                                                                                             |
| `result.tapOk(f)` / `tapError(f)`            | `tap(f)` / `tapErrCases((matcher) => …)`          |                                                                                             |
| `result.isOk()` / `isError()`                | `isOk()` / `isErr()`                              | plus `isDefect()`                                                                           |
| `Result.fromExecution(fn)`                   | `fromThrowable(fn, qualify)`                      | every-throw-modeled needs an explicit qualify; every-throw-a-bug is `fromSafeThrowable(fn)` |
| `Result.fromPromise(p)`                      | `fromPromise(p, qualify)`                         | triage per cause instead of `E = Error`                                                     |
| `Result.fromNullable/fromNull/fromUndefined` | `fromNullable(v, onAbsent)`                       | absence gets a named error                                                                  |
| `Result.fromPredicate` / `fromOption`        | `ensure(pred, onFail)` / see Option tree          |                                                                                             |
| `Result.all([...])` / `allFromDict({...})`   | `all([...])` / `allFromDict({...})`               | same shapes; async: `allAsync` / `allFromDictAsync`                                         |
| `Future<Result<T, E>>`                       | `AsyncResult<T, E>`                               | both never reject                                                                           |
| `Future.fromPromise(p)` (+ `.mapError` cast) | `fromPromise(p, qualify)`                         | the `as Error` cast becomes a triage decision                                               |
| `future.mapOk(f)` / `mapError(f)`            | `map(f)` / `mapErrCases(…)`                       | the `Ok` suffix disappears                                                                  |
| `future.flatMapOk(f)`                        | `flatMap(f)`                                      | `f` may return `Result` or `AsyncResult`                                                    |
| `future.mapOkToResult(f)`                    | `flatMap(f)` — or `ensure(pred, onFail)`          | when `f` only gates its own argument, `ensure` (invert the condition)                       |
| `future.mapErrorToResult(f)`                 | `flatMapErrCases(…)`                              |                                                                                             |
| `Future.all` / `allFromDict`                 | `allAsync` / `allFromDictAsync`                   |                                                                                             |
| `future.get()` / `onResolve`                 | `await asyncResult` then handle the `Result`      |                                                                                             |
| `Option`                                     | — (decision tree below)                           |                                                                                             |
| `AsyncData` / `Deferred`                     | — (see below)                                     |                                                                                             |
| `Future.retry` / `Future.concurrent`         | —                                                 | orchestrate before the `fromPromise` boundary with plain async tooling                      |

## The Option decision tree

Per `Option` site, exactly one of three (apply the same choice to a helper's
whole caller-set, not per caller):

1. **Absence is a normal shape** (all callers fold with a default) →
   `T | undefined`. The combinator chain usually _deletes_ into a plain
   conditional; `Option.fromNullable(x).flatMap(guard)` becomes
   `x != null && guard ? x : undefined`.
2. **Absence is a failure callers must handle** (`option.toResult(e)` sites are
   this by definition) → `Result<T, NotFound>` via
   `fromNullable(v, () => new NotFound({ … }))`.
3. **A nullable third-party value entering a pipeline** → `fromNullable` at the
   boundary.

Do not build a local `Option` to preserve shapes; `match({ Some, None })`
becomes a conditional (case 1) or an `errCases` arm (case 2).

## AsyncData / Deferred

Request-lifecycle state, not error handling — no unthrown target, by design.
Per the decide-once list, either hand-roll the union
(`{ tag: "NotAsked" } | { tag: "Loading" } | { tag: "Done"; result: Result<…> }`
— matchable with unthrown's structural `match(state).with({ tag: "Done" }, …)`)
or keep Boxed's `AsyncData` in the view layer with an unthrown `Result` inside
`Done`. A `Result` does not survive `structuredClone`/JSON — fold with `match`
before persisting state.

## The seam (untouched Boxed callers)

Same shape as the neverthrow seam (SKILL.md): serve legacy callers via
`toBoxed(result, onDefect)` / `toBoxedFuture(asyncResult, onDefect)` from
`@unthrown/boxed` — `onDefect` mandatorily folds a defect into the legacy `E`,
reproducing the old everything-in-`Error` behavior; quarantine and delete when
the last Boxed caller migrates. Incoming Boxed values lift with `fromBoxed` /
`fromBoxedFuture` (never a Defect). `Option` has no bridge — it crosses as
`toUndefined()` at the seam.
