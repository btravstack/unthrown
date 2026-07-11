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
const r = Ok(1).map(() => {
  throw new Error("boom");
});

r.isDefect(); // => true
```

This is what makes "no `try`/`catch` at the edge" real: a bug in a `.map`
becomes a defect, short-circuits the pipeline, and is handled once at `match`.

## A defect flows through almost everything

A defect passes through **every** method untouched — _except_ `match` and
`recoverDefect`. The success and error combinators never see it:

```ts
const d = Ok(1).map(() => {
  throw boom;
});

d.map((n) => n + 1); // still a Defect — callback skipped
d.mapErr((e) => e); // still a Defect — callback skipped
d.recoverErr(() => 0); // still a Defect — see below
```

That last line is the crucial one.

## `recoverErr` clears the error channel, not the runtime

`recoverErr` turns an `Err` into an `Ok`, so its type is `Result<T | U, never>`. But
`never` describes only the **error** channel — a defect can still be present at
runtime:

```ts
const recovered = d.recoverErr(() => 99);
// type: Result<number, never>
recovered.isDefect(); // => true — `never` does NOT mean "total"
```

A defect is a bug; you should not be able to accidentally "recover" it into a
success. So the recovering eliminators **rethrow** on a defect:

```ts
d.getOr(0); // throws the original cause
d.getOrNull(); // throws the original cause
d.getOrElse(() => 0); // throws the original cause
```

They recover a modeled `Err`, never an unmodeled defect.

::: warning `getOr` / `getOrNull` still throw on a defect
It's tempting to read `getOr(0)` as "always give me a value." It doesn't — it
supplies the fallback for a modeled `Err` but **rethrows a defect** (a bug is not
an absent value). If you must not throw, handle the defect explicitly first with
`match` or `recoverDefect`.
:::

## `get` is asymmetric

`get()` / `getErr()` are **type-gated**: `get()` only compiles when the
error channel is `never` (`Result<T, never>`), `getErr()` only when the success
channel is `never` (`Result<never, E>`). Calling `.get()` on a still-fallible
`Result<T, E>` is a compile error, not a runtime throw — so the `Err` case can't
reach either eliminator in well-typed code. The remaining wrong-variant throw
(`UnwrapError`) is a defensive runtime guard for unsound edges (e.g. a cast), not
something you should hit normally.

A `Defect`, though, is invisible to the type system — `never` on the error
channel says nothing about it (see above). So on a `Defect`, `get()` /
`getErr()` **rethrow the original cause** with its original stack — so an
unhandled defect reaches the global handler looking like the real failure, not
wrapped in library noise.

```ts
try {
  d.get();
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
d.recoverDefect((cause) => (cause instanceof RangeError ? Err("out_of_range") : Err("unknown")));
```

Use `tapDefect` to observe a defect's cause (e.g. logging) without changing it.

Recovering a defect should feel awkward — usually you don't. You let it bubble
to the edge, log it, and return a 500.

## Producing a defect on purpose

Sometimes a condition is _anticipated_ but still not a domain outcome — a
required config value is missing, a "can't happen" branch is reached. You want
the defect channel (the edge's 500), not an `Err` that every caller must
thread through `E`.

There is deliberately **no** `Defect(...)` constructor for this. The primitive
already exists — it is `throw`. The throw → defect rule at the top of this page
is not merely a safety net for accidental bugs; it is the _sanctioned syntax_
for declaring one:

```ts
// Inside a pipeline: just throw. The combinator converts it.
pipeline.tap(() => {
  if (!config.apiKey) throw new MissingConfigError();
});
```

And if you find yourself wanting to _mint_ a defect mid-chain, the failure
usually happened somewhere earlier — put the boundary at its origin instead:

```ts
// An ordinary function that throws on a bug — perfectly idiomatic JS.
function requireConfig(key: string): string {
  const value = process.env[key];
  if (value === undefined) throw new MissingConfigError(key);
  return value;
}

// Wrapped ONCE at its boundary: every throw is a defect, by decision.
const readConfig = fromSafeThrowable(requireConfig);

readConfig("API_KEY").toAsync().flatMap(callTheApi);
```

For the residual case — you hold a cause in hand and need to _start_ a chain in
defect state — the documented idiom is
`fromSafeThrowable(() => { throw cause })()` (add `.toAsync()` for an
`AsyncResult`).

::: info Why no constructor?
Once minting a defect is one frictionless call, "I don't feel like modeling
this error" starts flowing into the defect channel — and the discipline that
makes `E` trustworthy erodes. The friction is a forcing function: either model
the failure as an `Err`, or throw at its true origin. This was weighed and
decided in [#77](https://github.com/btravstack/unthrown/issues/77).
:::

→ Continue to [Boundaries & Qualification](./boundaries).
