# The Defect Channel

A **defect** is a failure you did not model — a thrown `TypeError`, an
un-triaged promise rejection, a bug in a callback. It is the third runtime state
of a `Result`, and it is **invisible to the type**: it never appears in `E`.

This is the idea that sets `unthrown` apart. A defect is a value (not a thrown
exception), so errors-as-values stays uniform — but it behaves very differently
from a modeled `Err`.

## Throw → defect

Any value thrown by a callback inside a combinator is **caught and converted to
a defect**, never allowed to escape:

```ts
const r = ok(1).map(() => {
  throw new Error("boom");
});

r.isDefect(); // true
```

This is what makes "no `try`/`catch` at the edge" real: a bug in a `.map`
becomes a defect, short-circuits the pipeline, and is handled once at `match`.

## A defect flows through almost everything

A defect passes through **every** method untouched — _except_ `match` and
`recoverDefect`. The success and error combinators never see it:

```ts
const d = ok(1).map(() => {
  throw boom;
});

d.map((n) => n + 1); // still a Defect — callback skipped
d.mapErr((e) => e); // still a Defect — callback skipped
d.recover(() => 0); // still a Defect — see below
```

That last line is the crucial one.

## `recover` clears the error channel, not the runtime

`recover` turns an `Err` into an `Ok`, so its type is `Result<T | U, never>`. But
`never` describes only the **error** channel — a defect can still be present at
runtime:

```ts
const recovered = d.recover(() => 99);
// type: Result<number, never>
recovered.isDefect(); // true — `never` does NOT mean "total"
```

A defect is a bug; you should not be able to accidentally "recover" it into a
success. So the recovering eliminators **rethrow** on a defect:

```ts
d.unwrapOr(0); // throws the original cause
d.getOrNull(); // throws the original cause
d.unwrapOrElse(() => 0); // throws the original cause
```

They recover a modeled `Err`, never an unmodeled defect.

## `unwrap` is asymmetric

- On an `Err`, `unwrap()` throws an `UnwrapError` carrying your `E`.
- On a `Defect`, `unwrap()` **rethrows the original cause** with its original
  stack — so an unhandled defect reaches the global handler looking like the real
  failure, not wrapped in library noise.

```ts
try {
  d.unwrap();
} catch (e) {
  e === boom; // true — same instance, original stack
}
```

## The only door: `recoverDefect`

When you genuinely need to handle a defect — say, to convert a third-party
library's thrown error back into a modeled one — use `recoverDefect`. It is the
only combinator that can observe a defect, and it re-enters the modeled world by
returning a `Result`:

```ts
d.recoverDefect((cause) => (cause instanceof RangeError ? err("out_of_range") : err("unknown")));
```

Use `tapDefect` to observe a defect's cause (e.g. logging) without changing it.

Recovering a defect should feel awkward — usually you don't. You let it bubble
to the edge, log it, and return a 500.

→ Continue to [Boundaries & Qualification](./boundaries).
