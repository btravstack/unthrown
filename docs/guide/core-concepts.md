# Core Concepts

## Three runtime states, two type parameters

A `Result<T, E>` has **three** runtime states but only **two** type parameters:

| State      | Meaning                                 | Visible in the type? |
| ---------- | --------------------------------------- | -------------------- |
| **Ok**     | success carrying a `T`                  | yes (`T`)            |
| **Err**    | an _anticipated_ domain failure (`E`)   | yes (`E`)            |
| **Defect** | an _unmodeled_ failure (a bug, a panic) | **no** — invisible   |

The defect channel is the heart of the library and has [its own
page](./the-defect-channel). This page covers the everyday surface.

A `Result` is a real **discriminated union** — each variant carries a `tag` of
`"Ok"` / `"Err"` / `"Defect"` plus its payload (`value` / `error` / `cause`) —
so you can `switch` on it or [match it natively](./pattern-matching) with
`ts-pattern`. It also carries the full method surface below; the payload is only
reachable once you've narrowed to a variant.

## The method surface

Every `Result` shares one method surface, grouped by the channel it touches:

- **success** (runs on `Ok`): `map`, `flatMap`, `tap`, `flatTap`, `as`
- **do-notation** (runs on `Ok`): `bind`, `let` — accumulate a named scope; see
  [Do Notation](./do-notation)
- **error** (runs on `Err`): `mapErr`, `orElse`, `recover`, `tapErr`, `flatTapErr`
- **defect** (the only door to a `Defect`): `recoverDefect`, `tapDefect`
- **eliminate**: `match`, `unwrap`, `unwrapErr`, `unwrapOr`, `unwrapOrElse`,
  `getOrNull`, `getOrUndefined`

A combinator only runs its callback on its own channel — the other states flow
through untouched:

```ts
Ok(2).map((n) => n + 1); // Ok(3)
Err("e").map((n) => n + 1); // Err("e") — callback skipped
Ok(2).mapErr((e) => `${e}!`); // Ok(2) — callback skipped
```

`tap` and `flatTap` both run a side effect and keep the original value — the
difference is whether the effect can fail. `tap` takes a `void` callback;
`flatTap` takes a **`Result`-returning** one, discards its success value, and
threads its error (a validation or write whose _outcome_ matters but whose
_value_ you don't need):

```ts
Ok(user)
  .flatTap((u) => writeAudit(u)) // returns Result<void, WriteError>
  .map((u) => u.name);
// → still the original user on success; short-circuits to WriteError on failure
```

## Constructors and the `Result` / `AsyncResult` facades

The constructors and helpers are tree-shakeable free functions:

```ts
import { Ok, Err, fromNullable, all } from "unthrown";
```

If you prefer a namespace, two companion objects alias the same entry points —
**grouped by what they return**, so each static lives in exactly one place:

```ts
import { Result, AsyncResult, Defect } from "unthrown";

// Result.* — everything that yields a Result (sync)
Result.Ok(1);
Result.fromNullable(map.get(key), () => "absent");
Result.all([Result.Ok(1), Result.Ok(2)]);

// AsyncResult.* — everything that yields an AsyncResult
await AsyncResult.fromPromise(fetchUser(id), (c) => Defect(c));
await AsyncResult.all([AsyncResult.fromSafePromise(loadA()), AsyncResult.fromSafePromise(loadB())]);
```

The free functions remain the primary, tree-shakeable API; the companions are an
opt-in alias (a separate export — `import { Ok }` never pulls one in). Importing a
companion _value_ trades that tree-shaking for the namespace, since it references
every entry point; the library is small, so the cost is minor — but if you care
about it, prefer the free functions. Inside `AsyncResult` the aggregates drop the
`Async` suffix (`AsyncResult.all` **is** the free function `allAsync`) — the
namespace already says async.

## Guards that narrow

`isOk` / `isErr` / `isDefect` are type guards. After a successful guard, the
relevant field becomes accessible. They come in two styles that narrow
identically — standalone functions and methods (the methods are `this is …`
predicates):

```ts
import { isOk, isErr } from "unthrown";

const r: Result<number, string> = Ok(7);

// standalone function
if (isOk(r)) {
  r.value; // number
}

// method — narrows too
if (r.isErr()) {
  r.error; // string
}
```

To narrow an **`unknown`** value (e.g. at an untyped boundary) to a `Result` in
the first place, use the standalone `isResult(x)`. It checks the value carries
the `Result` prototype, so a plain look-alike like `{ tag: "Ok" }` is **not**
matched.

## Eliminating a Result

Once you are ready to leave the `Result` world, pick the right exit:

```ts
Ok(1).unwrap(); // 1            — throws on Err/Defect
Err("e").unwrapErr(); // "e"    — throws on Ok/Defect
Err("e").unwrapOr(0); // 0      — recovers an Err; rethrows a Defect
Err("e").getOrNull(); // null   — recovers an Err; rethrows a Defect
Ok(1).match({ ok, err, defect }); // fold all three channels
```

`unwrapOr`, `unwrapOrElse`, `getOrNull`, and `getOrUndefined` recover a modeled
`Err` but **rethrow a `Defect`** — a defect is a bug, not an absent value. See
[The Defect Channel](./the-defect-channel).

## Aggregating: `all` / `allFromDict`

`all` collects a **tuple/array** of `Result`s into a `Result` of all their
values. The first `Err` short-circuits; any `Defect` dominates (even over an
earlier `Err`). A fixed tuple keeps its positional types; a dynamic
`Result<T, E>[]` collapses to `Result<T[], E>`:

```ts
import { all, Ok, type Result } from "unthrown";

all([Ok(1), Ok("two"), Ok(true)]).unwrap(); // [1, "two", true] (typed [number, string, boolean])
all([Ok(1), Ok(2)] as Result<number, never>[]).unwrap(); // number[]
```

For **named** parallel work, `allFromDict` takes a record instead — same rules,
no tupling:

```ts
import { allFromDict, Ok } from "unthrown";

allFromDict({ id: Ok(1), name: Ok("ada") }).unwrap(); // { id: 1, name: "ada" }
```

Both short-circuit on the first `Err` — this is **not** error accumulation. If
you need every failure collected, that is a separate (deliberately unshipped)
concern.

`allAsync` and `allFromDictAsync` are the asynchronous counterparts — same
folding rules, inputs resolved concurrently (order preserved), and (like every
`AsyncResult`) they never reject:

```ts
import { allAsync, fromSafePromise } from "unthrown";

const [a, b] = (await allAsync([fromSafePromise(loadA()), fromSafePromise(loadB())])).unwrap();
```

→ Continue to [The Defect Channel](./the-defect-channel).
