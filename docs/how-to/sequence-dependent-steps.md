# Sequence dependent steps with do-notation

> **How-to.** When several steps each depend on the values of the ones before,
> `Do` / `bind` / `let` flatten nested `flatMap` callbacks into a linear chain
> that accumulates a named scope — with the same defect guarantees as every other
> combinator.

## Build a scope with `Do` · `bind` · `let`

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
is the accumulated object. The scope is **readonly** — you don't mutate it
mid-chain. `Do` is capitalised because `do` is a reserved word.

## It's just a `Result`

A do-chain is an ordinary `Result` at every step — `bind`/`let` are methods on the
normal surface, so you can mix in `map`, `flatMap`, `match`, and the rest freely,
and a thrown callback still becomes a `Defect`:

```ts
import { Do, Ok, Err, tag, TaggedError } from "unthrown";

class TooSmall extends TaggedError("TooSmall") {}
declare const input: number;

Do()
  .bind("n", () => (input >= 2 ? Ok(input) : Err(new TooSmall())))
  .let("doubled", ({ n }) => n * 2)
  .match({
    ok: ({ n, doubled }) => `${n} → ${doubled}`,
    errCases: (matcher) => matcher.with(tag("TooSmall"), () => "too small"),
    defect: (cause) => `bug: ${String(cause)}`,
  });
```

## Go async

To sequence asynchronous steps, lift the chain with `toAsync()` (or start from
`DoAsync()`). From there a `bind` may return a `Result` **or** an `AsyncResult`
(never a raw `Promise` — see [Qualify a boundary](./qualify-a-boundary)):

```ts
import { Do, fromPromise, tag, TaggedError } from "unthrown";

class UserNotFound extends TaggedError("UserNotFound") {}
declare class MissingRowError extends Error {}

const profile = await Do()
  .toAsync()
  .bind("user", () =>
    fromPromise(fetchUser(id), (c, defect) =>
      c instanceof MissingRowError ? new UserNotFound() : defect(c),
    ),
  )
  .bind("posts", ({ user }) => fromPromise(fetchPosts(user.id), (c, defect) => defect(c)))
  .let("count", ({ posts }) => posts.length)
  .match({
    ok: (s) => s,
    errCases: (matcher) => matcher.with(tag("UserNotFound"), () => null),
    defect: () => null,
  });
```

Because binds **union** their error types, adding a failable step also adds a
case to `E` — and the `errCases` matcher at the end stops compiling until that
new case is named. Enumerating the arms is what makes the chain self-auditing.

## When to reach for named functions instead

If a chain grows long enough that `Do` feels heavy, that is usually a sign the
steps deserve named functions composed with `flatMap`. `unthrown` deliberately
ships no generator (`gen` / `safeTry`) do-notation — the reasoning is in
[Design decisions](../explanation/design-decisions#no-generator-do-notation-gen-safetry).

## Where to go next

- Combine _independent_ (not dependent) results: [Combine parallel results](./combine-parallel-results).
- The combinators you can mix in: [Combinator reference](../reference/combinators).
