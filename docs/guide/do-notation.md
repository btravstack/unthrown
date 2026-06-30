# Do Notation

When several steps each depend on the values of the ones before, nesting
`flatMap` callbacks gets awkward. **Do notation** flattens that into a linear
chain that accumulates a named scope — without generators, and with the same
defect guarantees as every other combinator.

## `Do` · `bind` · `let`

Start a chain with `Do()` (an empty object scope), then grow it:

- **`bind(name, f)`** — `f` receives the scope so far and returns a `Result`. On
  `Ok`, its value is added to the scope under `name`; on `Err`/`Defect` the chain
  short-circuits. Error types **union** across binds.
- **`let(name, f)`** — the pure-value counterpart: `f` returns a plain value (not
  a `Result`), added under `name`.

```ts
import { Do } from "unthrown";

const view = Do()
  .bind("user", () => findUser(id)) // Result<User, NotFound>
  .bind("org", ({ user }) => findOrg(user.orgId)) // Result<Org, NotFound>
  .let("label", ({ user, org }) => `${user.name} @ ${org.name}`)
  .map(({ user, org, label }) => render(user, org, label));
// Result<View, NotFound>
```

Each step's callback is typed with everything bound so far, and the final value
is the accumulated object. (The scope is **readonly** — you don't mutate it
mid-chain.)

`Do` is capitalised because `do` is a reserved word.

## It's just a `Result`

A do-chain is an ordinary `Result` at every step — `bind`/`let` are methods on
the normal surface, so you can mix in `map`, `flatMap`, `match`, and the rest
freely, and a thrown callback still becomes a `Defect`:

```ts
import { Do, Ok } from "unthrown";

Do()
  .bind("n", () => Ok(2))
  .let("doubled", ({ n }) => n * 2)
  .match({
    ok: ({ n, doubled }) => `${n} → ${doubled}`,
    err: (e) => `failed: ${e}`,
    defect: (cause) => `bug: ${String(cause)}`,
  });
```

## Async

To sequence asynchronous steps, lift the chain with `toAsync()`. From there a
`bind` may return a `Result` **or** an `AsyncResult` (never a raw `Promise` — see
[Boundaries](./boundaries)):

```ts
import { Do, fromPromise } from "unthrown";

const profile = await Do()
  .toAsync()
  .bind("user", () => fromPromise(fetchUser(id), (c, defect) => defect(c)))
  .bind("posts", ({ user }) => fromPromise(fetchPosts(user.id), (c, defect) => defect(c)))
  .let("count", ({ posts }) => posts.length)
  .match({ ok: (s) => s, err: () => null, defect: () => null });
```

→ Continue to [The Defect Channel](./the-defect-channel).
