# Result & AsyncResult surface

> **Reference.** The shape of the two core types, the constructors and guards
> that produce and narrow them, and the aggregate helpers. For per-method
> signatures see the [combinator reference](./combinators) and the generated
> [API reference](/api/core/); for terminology, the [glossary](./glossary).

## Three runtime states, two type parameters

A `Result<T, E>` has **three** runtime states but only **two** type parameters:

| State      | Meaning                                 | Visible in the type? |
| ---------- | --------------------------------------- | -------------------- |
| **Ok**     | success carrying a `T`                  | yes (`T`)            |
| **Err**    | an _anticipated_ domain failure (`E`)   | yes (`E`)            |
| **Defect** | an _unmodeled_ failure (a bug, a panic) | **no** — invisible   |

The defect channel is explained on [its own page](../explanation/the-defect-channel).

A `Result` is a real **discriminated union** — each variant carries a `tag` of
`"Ok"` / `"Err"` / `"Defect"` plus its payload (`value` / `error` / `cause`) —
intersected with the shared method surface. So it matches **natively** (a
`switch` on `tag`, or `match(r).with({ tag: "Ok" }, …).exhaustive()`) **and**
chains fluently. The payload is reachable only after narrowing.

`AsyncResult<T, E>` shares that method surface as an awaitable wrapper typed
`Awaitable<Result<T, E>>` — a success-only thenable whose internal promise never
rejects. `await` collapses it to a `Result`. Its combinator callbacks are
synchronous; see [The async model](../explanation/async-model).

## The method surface

Every `Result` shares one method surface, grouped by the channel it touches:

- **success** (runs on `Ok`): `map`, `flatMap`, `ensure`, `tap`, `flatTap`, `as`,
  `discard`
- **do-notation** (runs on `Ok`): `bind`, `let` — accumulate a named scope; see
  [Sequence dependent steps](../how-to/sequence-dependent-steps)
- **error** (runs on `Err`): `mapErrCases`, `flatMapErrCases`, `recoverErrCases`, `tapErrCases`,
  `flatTapErrCases` — all take an **exhaustive matcher** over the error
- **defect** (the only door to a `Defect`): `recoverDefect`, `tapDefect`
- **failure** (runs on `Err` **or** `Defect`): `tapFailure` — observe either
  failing channel without consuming it
- **eliminate**: `match`, `get`, `getErr`, `getOr`, `getOrElse`, `getOrNull`,
  `getOrUndefined`, `getOrThrow`

A combinator only runs its callback on its own channel — the other states flow
through untouched:

```ts
import { Ok, Err, type Result } from "unthrown";

const two: Result<number, "boom"> = Ok(2);

two.map((n) => n + 1); // => Ok(3)
Err("boom").map((n) => n + 1); // => Err("boom") — the success callback is skipped
two.mapErrCases((m) => m.with("boom", (e) => `wrapped: ${e}`)); // => Ok(2) — the error branch is skipped
```

The `mapErrCases` above carries a real, exhaustive matcher; on an `Ok` it simply never
runs. (There is no error-channel identity — `mapErrCases((m) => m)` is not a no-op; see
[Exhaustive error matching](../explanation/exhaustive-error-matching#no-identity-on-the-error-channel).)

The full behavior grid and per-method signatures are in the
[combinator reference](./combinators). The fluent surface is also documented, method
by method, on the [`ResultMethods`](/api/core/#resultmethods) and
[`AsyncResultMethods`](/api/core/#asyncresultmethods) types.

## Constructors

The constructors are tree-shakeable free functions:

| Constructor       | Produces                 | Notes                                                        |
| ----------------- | ------------------------ | ------------------------------------------------------------ |
| `Ok(value)`       | `Result<T, never>`       | `Ok()` (no arg) constructs a `void` success                  |
| `Err(error)`      | `Result<never, E>`       |                                                              |
| `OkAsync(value)`  | `AsyncResult<T, never>`  | pre-lifted `Ok(value).toAsync()`; `OkAsync()` mirrors `Ok()` |
| `ErrAsync(error)` | `AsyncResult<never, E>`  | pre-lifted `Err(error).toAsync()`                            |
| `Do()`            | `Result<{}, never>`      | do-notation entry — an empty object scope                    |
| `DoAsync()`       | `AsyncResult<{}, never>` | pre-lifted `Do().toAsync()`; alias `AsyncResult.Do`          |

There is **no** `Defect` constructor — a defect-state `Result` arises only at
boundaries, and the qualify-time `defect` helper is injected, not exported. See
[Design decisions](../explanation/design-decisions#no-defect-constructor).

## Guards

`isOk` / `isErr` / `isDefect` narrow to `OkView` / `ErrView` / `DefectView`, in two
call styles that narrow identically — standalone functions and methods (the
methods are `this is …` predicates):

```ts
import { isOk } from "unthrown";

const r: Result<number, string> = Ok(7);

if (isOk(r)) r.value; // number (standalone function)
if (r.isErr()) r.error; // string (method — narrows too)
```

To narrow an **`unknown`** value at an untyped boundary, use the standalone
`isResult(x)`. It checks the value carries the `Result` prototype (an
`instanceof` check with a `Symbol.for("unthrown.Result")` brand fallback, so a
`Result` from another copy of the library still passes), so a plain look-alike
like `{ tag: "Ok" }` is **not** matched.

## The `Result` / `AsyncResult` facades

If you prefer a namespace over free functions, two companion objects alias the
same entry points — **grouped by what they return**, so each static lives in
exactly one place:

```ts
import { Result, AsyncResult } from "unthrown";

// Result.* — everything that yields a Result (sync)
Result.Ok(1);
Result.fromNullable(map.get(key), () => "absent");
Result.all([Result.Ok(1), Result.Ok(2)]);

// AsyncResult.* — everything that yields an AsyncResult
await AsyncResult.fromPromise(fetchUser(id), (c, defect) => defect(c));
await AsyncResult.all([
  AsyncResult.fromSafePromise(loadA()),
  AsyncResult.fromSafePromise(loadB()),
]);
```

The free functions remain the primary, tree-shakeable API; the companions are an
opt-in alias (a separate export — `import { Ok }` never pulls one in). Importing a
companion _value_ trades that tree-shaking for the namespace. Inside `AsyncResult`
the aggregates and pre-lifted entry points drop the `Async` suffix the free
functions carry (`AsyncResult.all` **is** `allAsync`; `AsyncResult.Ok` **is**
`OkAsync`) — the namespace already says async.

## Aggregating: `all` / `allFromDict`

`all` collects a **tuple/array** of `Result`s into a `Result` of all their
values; `allFromDict` takes a **record** for named results. Both short-circuit on
the first `Err`, and any `Defect` dominates (even over an earlier `Err`). Neither
is error accumulation.

```ts
import { all, allFromDict, Ok, type Result } from "unthrown";

all([Ok(1), Ok("two"), Ok(true)]).get(); // => [1, "two", true] (typed [number, string, boolean])
all([Ok(1), Ok(2)] as Result<number, never>[]).get(); // => number[] (dynamic array collapses)
allFromDict({ id: Ok(1), name: Ok("ada") }).get(); // => { id: 1, name: "ada" }
```

`allAsync` and `allFromDictAsync` are the asynchronous counterparts — same folding
rules, inputs resolved concurrently (order preserved), and (like every
`AsyncResult`) they never reject:

```ts
import { allAsync, fromSafePromise } from "unthrown";

const [a, b] = (
  await allAsync([fromSafePromise(loadA()), fromSafePromise(loadB())])
).get();
```

## Interop constructors

| Function            | Produces                  | Purpose                                        |
| ------------------- | ------------------------- | ---------------------------------------------- |
| `fromNullable`      | `Result<T, E>`            | `null`/`undefined` → modeled `Err`             |
| `fromThrowable`     | `(…) => Result<T, E>`     | wrap a throwing fn; mandatory `qualify`        |
| `fromSafeThrowable` | `(…) => Result<T, never>` | wrap a throwing fn; every throw a `Defect`     |
| `fromPromise`       | `AsyncResult<T, E>`       | wrap a promise; mandatory `qualify`            |
| `fromSafePromise`   | `AsyncResult<T, never>`   | wrap a promise; every rejection a `Defect`     |
| `fromExecutor`      | `AsyncResult<T, E>`       | wrap a callback API; settler names the variant |

Their tasks and signatures are covered in
[Qualify a boundary](../how-to/qualify-a-boundary).

## Where to go next

- Choose the right method: [Combinator reference](./combinators).
- The terms used above: [Glossary](./glossary).
- Every symbol, generated from source: [API reference](/api/core/).
