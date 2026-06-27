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

- **success** (runs on `Ok`): `map`, `flatMap`, `tap`, `as`
- **error** (runs on `Err`): `mapErr`, `orElse`, `recover`, `tapErr`
- **defect** (the only door to a `Defect`): `recoverDefect`, `tapDefect`
- **eliminate**: `match`, `unwrap`, `unwrapErr`, `unwrapOr`, `unwrapOrElse`,
  `getOrNull`, `getOrUndefined`

A combinator only runs its callback on its own channel — the other states flow
through untouched:

```ts
ok(2).map((n) => n + 1); // Ok(3)
err("e").map((n) => n + 1); // Err("e") — callback skipped
ok(2).mapErr((e) => `${e}!`); // Ok(2) — callback skipped
```

## Constructors and the `Result` facade

The constructors and helpers are tree-shakeable free functions:

```ts
import { ok, err, fromNullable, all } from "unthrown";
```

If you prefer a namespace, a `Result` companion object aliases the same entry
points — handy for discoverability:

```ts
import { Result } from "unthrown";

Result.ok(1);
Result.fromNullable(map.get(key), () => "absent");
Result.all([Result.ok(1), Result.ok(2)]);
```

The free functions remain the primary, tree-shakeable API; `Result.*` is a
zero-cost alias (a separate export — `import { ok }` never pulls it in).

## Guards that narrow

`isOk` / `isErr` / `isDefect` are type guards. After a successful guard, the
relevant field becomes accessible. They come in two styles that narrow
identically — standalone functions and methods (the methods are `this is …`
predicates):

```ts
import { isOk, isErr } from "unthrown";

const r: Result<number, string> = ok(7);

// standalone function
if (isOk(r)) {
  r.value; // number
}

// method — narrows too
if (r.isErr()) {
  r.error; // string
}
```

## Eliminating a Result

Once you are ready to leave the `Result` world, pick the right exit:

```ts
ok(1).unwrap(); // 1            — throws on Err/Defect
err("e").unwrapErr(); // "e"    — throws on Ok/Defect
err("e").unwrapOr(0); // 0      — recovers an Err; rethrows a Defect
err("e").getOrNull(); // null   — recovers an Err; rethrows a Defect
ok(1).match({ ok, err, defect }); // fold all three channels
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
import { all, ok, type Result } from "unthrown";

all([ok(1), ok("two"), ok(true)]).unwrap(); // [1, "two", true] (typed [number, string, boolean])
all([ok(1), ok(2)] as Result<number, never>[]).unwrap(); // number[]
```

For **named** parallel work, `allFromDict` takes a record instead — same rules,
no tupling:

```ts
import { allFromDict, ok } from "unthrown";

allFromDict({ id: ok(1), name: ok("ada") }).unwrap(); // { id: 1, name: "ada" }
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
