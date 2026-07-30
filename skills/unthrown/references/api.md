# unthrown API reference

Contents: [Combinators by intent](#combinators-by-intent) ·
[Per-channel behavior](#per-channel-behavior) ·
[Easy-to-confuse pairs](#easy-to-confuse-pairs) ·
[Matcher patterns](#matcher-patterns) ·
[Do-notation](#do-notation) · [Aggregates](#aggregates) ·
[Guards](#guards) · [Facade namespaces](#facade-namespaces) ·
[Utility types](#utility-types) · [Runtime facts](#runtime-facts)

## Combinators by intent

Same set on `Result` and `AsyncResult`. Error combinators abbreviate their
matcher callback as `(matcher) => …`.

| I want to…                                     | use               | signature                                                    | channel      |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------ | ------------ |
| transform the success value                    | `map`             | `(v: T) => U` → `Result<U, E>`                               | Ok           |
| chain a `Result`-returning step                | `flatMap`         | `(v: T) => Result<U, E2>` → `Result<U, E \| E2>`             | Ok           |
| run a side effect, keep the value              | `tap`             | `(v: T) => void` → `Result<T, E>`                            | Ok           |
| run a **failable** side effect, keep the value | `flatTap`         | `(v: T) => Result<unknown, E2>` → `Result<T, E \| E2>`       | Ok           |
| validate a success / refine its type           | `ensure`          | `((v: T) => boolean, (v: T) => E2)` → `Result<T, E \| E2>`   | Ok           |
| sequence steps into a named scope              | `Do`/`bind`/`let` | `bind(k, (scope) => Result<U, E2>)` → `Result<{…}, E \| E2>` | Ok           |
| replace the value with a constant              | `as`              | `(value: U)` → `Result<U, E>`                                | Ok           |
| drop the value (becomes `void`)                | `discard`         | `()` → `Result<void, E>`                                     | Ok           |
| transform the error (matched)                  | `mapErrCases`     | `(matcher) => …` → `Result<T, E2>`                           | Err          |
| try a fallback that returns a `Result`         | `flatMapErrCases` | `(matcher) => …` → `Result<T \| U, E2>`                      | Err          |
| turn an error into a success value             | `recoverErrCases` | `(matcher) => …` → `Result<T \| U, never>`                   | Err          |
| run a side effect on the error                 | `tapErrCases`     | `(matcher) => …` → `Result<T, E>`                            | Err          |
| run a **failable** side effect on the error    | `flatTapErrCases` | `(matcher) => …` → `Result<T, E \| E2>`                      | Err          |
| recover from a defect (rare)                   | `recoverDefect`   | `(cause) => Result<U, E2>` → `Result<T \| U, E \| E2>`       | Defect       |
| observe a defect (log it)                      | `tapDefect`       | `(cause) => void` → `Result<T, E>`                           | Defect       |
| observe **any** failure (error or defect)      | `tapFailure`      | `(f: FailureView<E>) => void` → `Result<T, E>`               | Err + Defect |
| handle all three channels at the edge          | `match`           | `{ ok, errCases, defect }` → `R`                             | all          |

Signatures are abbreviated to intent: a `=> void` return means the callback's
return value is ignored, and every callback not constrained to return a
`Result` is actually typed `(…) => R & NotThenable<R>` — a thenable/async
callback is a compile error (see [Utility types](#utility-types)).

`ensure` with a type-guard predicate narrows `T` to `U`. A `flatMap` whose
callback is just a predicate wearing a bind costume
(`flatMap((x) => c ? Ok(x) : Err(e))`) should be `ensure(c, () => e)` — it
names the intent and passes the same `Ok` through (the opt-in `prefer-ensure`
lint rule flags this).

There is deliberately **no** `recoverFailure` and no channel-moving operators
(`Err`→`Defect` erases the modeled type; `Defect`→`Err` would put `unknown` in
`E`). The deliberate `Err`→`Defect` form is a `defect(cause)` branch in an
error matcher.

## Per-channel behavior

A combinator touches only its own channel; the other two flow through.

| method                            | on `Ok` | on `Err`      | on `Defect` | resulting `E`   |
| --------------------------------- | ------- | ------------- | ----------- | --------------- |
| `map` / `tap`                     | runs    | passes        | passes      | `E`             |
| `flatMap` / `flatTap` / `ensure`  | runs    | passes        | passes      | `E \| E2`       |
| `mapErrCases` / `flatMapErrCases` | passes  | branch        | passes      | `E2`            |
| `recoverErrCases`                 | passes  | branch → `Ok` | passes      | `never`         |
| `tapErrCases` / `flatTapErrCases` | passes  | branch        | passes      | `E` / `E \| E2` |
| `recoverDefect`                   | passes  | passes        | runs        | `E \| E2`       |
| `tapDefect`                       | passes  | passes        | runs        | `E`             |
| `tapFailure`                      | passes  | runs          | runs        | `E`             |
| `match`                           | `ok()`  | `errCases()`  | `defect()`  | —               |

Caveat: `recoverErrCases`'s `never` empties only the **error** channel — a
`Defect` can still be present at runtime and flows past it untouched. Do not
read `Result<T, never>` as "cannot fail"; `get()` still panics on a defect.

## Easy-to-confuse pairs

- **`map` vs `flatMap`** — callback returns a plain value → `map`; returns a
  `Result` → `flatMap` (else you nest `Result<Result<…>>`).
- **`flatMap` vs `flatTap`** — `flatMap` replaces the value with the
  callback's; `flatTap` keeps the original and threads only the effect's error.
- **`tap` vs `flatTap`** — decided by what the effect returns. Cannot fail
  (logging, metric) → `tap`; returns `Result`/`AsyncResult` → `flatTap`
  (inside `tap` the effect's outcome is silently dropped or floats).
- **`flatMapErrCases` vs `recoverErrCases`** — recover produces a plain success
  value (`E` → `never`); flatMapErrCases produces another `Result` (may still
  be `Err`).
- **`recoverErrCases` vs `recoverDefect`** — modeled `Err` vs `Defect`;
  neither is the other's fallback.
- **`tapErrCases`+`tapDefect` vs `tapFailure`** — same effect for both failure
  kinds → `tapFailure`; its callback gets the discriminated variant
  (`ErrView | DefectView`), branch on `failure.tag`.

## Matcher patterns

`match(value)` / `P` are exported from `unthrown` (built in, no ts-pattern).
Inside error combinators the builder arrives as the callback's `matcher`
parameter — return it **un-terminated**. Standalone (e.g. matching a whole
`Result`) you terminate it yourself with `.exhaustive()`.

| pattern                             | matches                                             |
| ----------------------------------- | --------------------------------------------------- |
| `P.tag("X")`                        | `{ _tag: "X" }` — narrows to that variant + payload |
| a literal (`"negative"`, `404`)     | itself                                              |
| an object (`{ code: "NOT_FOUND" }`) | shallow structural match                            |
| `P.instanceOf(Cls)`                 | `instanceof`                                        |
| `P.when((x) => boolean)`            | guard (a type guard narrows)                        |
| `P.union(a, b)`                     | any of the sub-patterns                             |
| `P.string` / `P.number`             | any string / number                                 |
| `P._` (alias `P.any`)               | everything — escape hatch only (see SKILL.md)       |

- Group cases sharing a handler: `.with(P.tag("A"), P.tag("B"), handler)`.
- `matcher.returnType<R>()` — call directly after receiving the matcher; pins
  every branch to `R` and makes the match evaluate to `R`. Needed to write a
  `defect(…)` branch in `flatTapErrCases`.
- Deliberately unsupported: deep structural inversion, `P.select`, array
  patterns.
- Matching a whole `Result` works natively:
  `match(r).with({ tag: "Ok" }, ({ value }) => …).with({ tag: "Err" }, …).with({ tag: "Defect" }, …).exhaustive()`.
- `NonExhaustiveError` (exported) is thrown when a rogue value slips past the
  types with no matching arm; inside combinators the throw-to-defect net turns
  it into a `Defect`, in `match` it throws.

## Do-notation

`Do()` starts an empty object scope (`Ok({})`); `bind` sequences a
`Result`-returning step under a name; `let` binds a pure value. `DoAsync()`
(alias `AsyncResult.Do`) is the pre-lifted async twin — its `bind` also
accepts `AsyncResult`-returning callbacks.

```ts
import { Do } from "unthrown";

const r = Do()
  .bind("user", () => findUser(id)) // Result<User, NotFound>
  .bind("plan", ({ user }) => findPlan(user)) // errors union
  .let("label", ({ user, plan }) => `${user.name}/${plan.name}`)
  .map(({ label }) => label);
// Result<string, NotFound | PlanError>
```

Errors/defects short-circuit; a throw in a step becomes a `Defect`. There is
**no** generator (`gen`/`yield*`) do-notation — deliberately excluded.

## Aggregates

All four short-circuit on the first `Err`, any `Defect` dominates, and none
accumulate errors (deliberately excluded).

- `all([r1, r2])` — tuple in, positional tuple out
  (`Result<[A, B], E1 | E2>`); a dynamic `Result<T, E>[]` collapses to
  `Result<T[], E>`.
- `allFromDict({ a: ra, b: rb })` → `Result<{ a: A; b: B }, E>` — named
  parallel work without tupling.
- `allAsync` / `allFromDictAsync` — the `AsyncResult` twins; resolve
  concurrently, never reject. Facade: `AsyncResult.all` / `AsyncResult.allFromDict`.

## Guards

- Methods `r.isOk()` / `r.isErr()` / `r.isDefect()` and standalone
  `isOk(r)` / `isErr(r)` / `isDefect(r)` — all narrow (to
  `OkView`/`ErrView`/`DefectView`).
- `isResult(x)` — narrows `unknown` to `Result<unknown, unknown>`; survives
  dual-package/cross-realm copies (brand fallback). A structural
  `{ tag: "Ok" }` look-alike is **not** a Result.

## Facade namespaces

The free functions are primary (tree-shakeable). Two opt-in companion objects
group them **by what they return**:

- `Result.*`: `Ok`, `Err`, `Do`, `fromNullable`, `fromThrowable`,
  `fromSafeThrowable`, `all`, `allFromDict`, `isOk`/`isErr`/`isDefect`/`isResult`.
- `AsyncResult.*`: `Ok` (= `OkAsync`), `Err` (= `ErrAsync`), `Do`
  (= `DoAsync`), `fromPromise`, `fromSafePromise`, `all` (= `allAsync`),
  `allFromDict` (= `allFromDictAsync`).

Both are value + type companions — `Result<T, E>` / `AsyncResult<T, E>` are the
same names as types.

## Utility types

| type                                             | purpose                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `Result<T, E>` / `AsyncResult<T, E>`             | the public types                                                                                                    |
| `OkView<T, E>` / `ErrView<E, T>` / `DefectView`  | the narrowed variants                                                                                               |
| `FailureView<E, T = never>`                      | `ErrView \| DefectView` — what `tapFailure` receives (`T` is phantom; `FailureView<MyError>` is the usual spelling) |
| `OkOf<R>` / `ErrOf<R>`                           | extract a `Result`'s channels from a function return type                                                           |
| `AsyncOkOf<R>` / `AsyncErrOf<R>`                 | same for `AsyncResult`                                                                                              |
| `NotThenable<R>`                                 | compile-time ban on thenable callback returns                                                                       |
| `ErrMatcher<E>`                                  | the matcher-callback parameter type (parameter position only)                                                       |
| `TaggedErrorConstructor` / `TaggedErrorInstance` | type an `extends TaggedError(…)` site externally                                                                    |

`GetError` (exported) is the defensive wrong-variant error `get`/`getErr`
throw — reachable only via casts or raw JS.

## Runtime facts

- Result instances and both prototypes are `Object.freeze`d — variants cannot
  be forged by mutation.
- `get`/`getErr`/`getOr…` on a `Defect` rethrow the **original cause** with its
  original stack (they panic).
- A throw inside a failure **observer** (`tapErrCases`/`tapDefect`/
  `tapFailure`/`flatTapErrCases`) produces a `Defect` whose cause is
  `AggregateError([thrown, original])` — observing a failure never destroys it.
- An `AsyncResult`'s internal promise never rejects; `await` always yields a
  `Result`.
