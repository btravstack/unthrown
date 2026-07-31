# Qualification at the boundary

> **Explanation.** This page is about _why_ every boundary forces a triage
> decision. For the concrete API — `fromThrowable`, `fromPromise`,
> `fromNullable`, and the `fromSafe*` pair — see
> [Qualify a boundary](../how-to/qualify-a-boundary).

The edges of your program — a throwing function, a rejecting promise, a nullable
third-party API — are where **untyped failure** enters. Everything inside a
`Result` pipeline is already triaged into `Ok` / `Err` / `Defect`; the boundary
is the one place a raw `unknown` shows up. `unthrown`'s position is that this is
exactly where the decision must be forced: is this failure a **modeled error**
or a **defect**?

## The original sin: `unknown` in `E`

Most errors-as-values libraries spell their promise boundary like this:

```ts
fromPromise(p): AsyncResult<T, unknown>;
```

That single `unknown` is the leak. It flows into your error type, and from there
into every consumer. You reach for a `match` or a `mapErrCases`, discover the error is
`unknown`, and now you either cast it (a lie the compiler can't check) or widen
`E` to `unknown` all the way up. The type that was supposed to be a precise
contract quietly became "something went wrong."

`unthrown` closes this by making `qualify` **mandatory**:

```ts
fromPromise(p, (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);
```

`qualify` receives the raw `cause` and a `defect` helper the boundary injects.
Every branch must end in one of two places: a **modeled error** (which enters
`E`) or `defect(cause)` (which does not). There is no third option, and there is
no code path that yields `unknown` in `E`.

## `Exclude<R, Defect>` — the defect arm is subtracted

The error channel is inferred as `Exclude<R, Defect>`, where `R` is `qualify`'s
return type. The `Defect` arm is **subtracted**, never inferred into `E`:

- a `qualify` returning `NotFound | Defect` yields `AsyncResult<T, NotFound>`;
- a `qualify` returning _only_ `defect(cause)` yields `AsyncResult<T, never>` —
  not `AsyncResult<T, Defect>`.

This is what keeps the defect channel out-of-band. Modeled failures are in the
type; the unmodeled ones are routed to the invisible third state. The
subtraction is sound because `Defect` is `unique symbol`-branded — no domain
error is ever assignable to it, so there is no way to accidentally smuggle a real
error into the defect arm or vice versa.

## `qualify` is synchronous — on purpose

`qualify` must be synchronous. Its return type intersects `NotThenable`, so an
`async qualify` does not compile. This is not an arbitrary restriction: if
`qualify` could be async, its returned `Promise` would land in `E`
**un-triaged** — the exact leak the boundary exists to prevent. A thenable that
slips past the types at runtime is turned into a `Defect` (never `Err(Promise)`),
and the orphaned thenable is adopted-and-silenced so a later rejection can't
float unhandled.

The same rule is why an `AsyncResult`'s combinator callbacks are synchronous —
a raw `Promise` may never enter a combinator, because its rejection would
silently become a defect and skip the triage. Async work re-enters only through
`fromPromise` / `fromSafePromise` and composes via `flatMap`. That story has its
own page: [The async model](./async-model).

## When _every_ failure is a bug: `fromSafe*`

Sometimes "everything here is a defect" is the correct, deliberate decision — a
promise that should never fail in a _modeled_ way, a function whose every throw
is a bug. For those, `fromSafePromise` / `fromSafeThrowable` skip `qualify`
entirely and give `E = never`; any failure becomes a defect.

These are escape hatches from qualification, not shortcuts. They are the
_named_, explicit form of the `(cause, defect) => defect(cause)` you would
otherwise write out — an on-the-record "I decided this is all defects", not a
convenience that quietly drops the triage. Keep `fromThrowable` / `fromPromise`
wherever some failures are genuinely anticipated.

## Sync boundaries are sync on both sides

`fromThrowable` / `fromSafeThrowable` wrap a **synchronous** function, and that
applies to `fn` as much as to `qualify`. A synchronous boundary only ever sees a
synchronous `throw`, so an `async` `fn` rejects long after the boundary has
returned — its rejection could never reach `qualify`. Rather than hand back an
`Ok` wrapping a live promise whose rejection escapes triage (and then floats as an
unhandled rejection), the boundary produces a **defect**:

```ts
const bad = fromSafeThrowable(async () => fetchUser(id));
bad(); // => Defect(TypeError: … `fn` returned a thenable …)

const good = fromSafePromise(() => fetchUser(id)); // AsyncResult<User, never>
```

Reach for `fromPromise` / `fromSafePromise` for async work. (This one is caught at
runtime rather than by the type system: banning a thenable return at compile time
would also reject generic functions, so `fromSafeThrowable(structuredClone)` would
stop compiling.)

## The payoff

Because every boundary is qualified and every in-pipeline throw becomes a defect,
the interior of your program never handles a raw `unknown`, and its edge needs no
`try`/`catch` — just one exhaustive `match` that folds `Ok` / `Err` / `Defect`
into a response. The forced triage at the boundary is what makes that single
handler trustworthy: every failure has already been sorted into "modeled" or
"bug" before it arrives.

## Where to go next

- Do it: [Qualify a boundary](../how-to/qualify-a-boundary).
- The state the defect arm routes to: [The Defect Channel](./the-defect-channel).
- Why async callbacks stay synchronous: [The async model](./async-model).
