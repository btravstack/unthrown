# Combine parallel results

> **How-to.** Collect several _independent_ `Result`s into one. For _dependent_
> steps (each needs the previous value), use
> [do-notation](./sequence-dependent-steps) instead.

## Combine an array with `all`

`all` collects a tuple/array of `Result`s into a `Result` of all their values.
The first `Err` short-circuits; any `Defect` dominates (even over an earlier
`Err`). A fixed tuple keeps its positional types; a dynamic `Result<T, E>[]`
collapses to `Result<T[], E>`:

```ts
import { all, Ok, type Result } from "unthrown";

all([Ok(1), Ok("two"), Ok(true)]).get(); // => [1, "two", true] (typed [number, string, boolean])
all([Ok(1), Ok(2)] as Result<number, never>[]).get(); // => number[]
```

## Combine a record with `allFromDict`

For **named** parallel work, `allFromDict` takes a record instead — same rules, no
tupling:

```ts
import { allFromDict, Ok } from "unthrown";

allFromDict({ id: Ok(1), name: Ok("ada") }).get(); // => { id: 1, name: "ada" }
```

Both short-circuit on the first `Err` — this is **not** error accumulation (see
[Design decisions](../explanation/design-decisions#no-error-accumulation-validation)).

## Combine async results concurrently

`allAsync` and `allFromDictAsync` are the asynchronous counterparts — same folding
rules, inputs resolved **concurrently** (order preserved), and (like every
`AsyncResult`) they never reject:

```ts
import { allAsync } from "unthrown";

// loadProfile / loadPosts / loadFollowers each return an AsyncResult
const page = allAsync([loadProfile(id), loadPosts(id), loadFollowers(id)]);
// AsyncResult<[Profile, Post[], User[]], ProfileError>

page.map(([profile, posts, followers]) =>
  renderPage(profile, posts, followers),
);
```

Use `allFromDictAsync` to key the concurrent results by name instead of position.

## Where to go next

- Sequence _dependent_ steps: [Sequence dependent steps](./sequence-dependent-steps).
- The full aggregate surface: [Result & AsyncResult surface](../reference/result-surface#aggregating-all-allfromdict).
