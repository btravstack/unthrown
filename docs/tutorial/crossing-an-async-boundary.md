# Crossing an async boundary

> **Tutorial.** The second lesson. You've written and folded sync `Result`s in
> [Getting started](./getting-started); now you'll bring a promise into the same
> world — safely — and handle it with one `match` at the edge.

Real programs cross async boundaries: they fetch, they query a database, they
read a file. This lesson turns a rejecting promise into a `Result` and shows why
the extra step it asks of you is worth it.

## Step 1 — Wrap a promise with `fromPromise`

Say you have a function that fetches a user and **rejects** on a 404:

```ts
declare function fetchUser(id: string): Promise<User>; // rejects with NotFoundError on a 404
```

Bring it into `unthrown` with `fromPromise`. It asks for a second argument,
`qualify`, and this is the heart of the lesson: **you must decide what each
rejection means.** Is it a modeled error, or an unexpected bug?

```ts
import { fromPromise, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {} // our modeled domain failure

const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);
// user: AsyncResult<User, NotFound>
```

Read the `qualify` line out loud: "if the rejection was a `NotFoundError`, model
it as `NotFound`; otherwise it's a bug — `defect(cause)`." The `defect` helper is
handed to you by the boundary; you never import it.

Notice the resulting type: `AsyncResult<User, NotFound>`. The bug branch
(`defect(cause)`) is **not** in the error type — defects are invisible to `E`.
There is no path here that leaves you with `unknown` to deal with. (The reasoning
is in [Qualification](../explanation/qualification) — but you don't need it to
proceed.)

## Step 2 — Chain, just like a sync Result

An `AsyncResult` has the **same methods** as a `Result`. Chain it exactly as you
did in lesson 1 — the callbacks stay synchronous:

```ts
const name = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
)
  .map((u) => u.name) // runs on success
  .map((n) => n.trim());
// still AsyncResult<string, NotFound>
```

## Step 3 — `await` collapses it to a `Result`

An `AsyncResult` is awaitable. `await` it, and you get back an ordinary `Result`
you can `match` — and it **never throws**, because every rejection was already
captured as an `Err` or a `Defect`:

```ts
const settled = await user; // Result<User, NotFound>
```

## Step 4 — One `match` at the edge

Put it together into a request handler. There is **no `try`/`catch`** anywhere: a
modeled `NotFound` lands in `err`, and anything unexpected — a network failure, a
bug in a `.map` — lands in `defect`:

```ts
const status = await user.match({
  ok: () => 200,
  err: (matcher) => matcher.with({ _tag: "NotFound" }, () => 404),
  defect: (cause) => {
    logger.error(cause);
    return 500; // everything unexpected
  },
});
```

`match` accepts the `AsyncResult` directly and resolves to a `Promise`, so you can
`await` the whole expression. (You could also `await user` first, then `match` the
plain `Result` — same result.)

## Step 5 — Add a second async step

To do more async work, you don't reach for an `async` callback — those are
deliberately not allowed, because a rejection inside one would skip the triage you
just did. Instead you re-enter through another boundary and compose with
`flatMap`:

```ts
const order = await fromPromise(loadCart(id), qualify).flatMap((cart) =>
  fromPromise(checkout(cart), qualify),
);
```

The extra `fromPromise` isn't ceremony — it's the same forced decision as Step 1,
guaranteeing the second call's failures are triaged too. (Why callbacks stay sync:
[The async model](../explanation/async-model).)

## What you built

You now know how to:

- bring a rejecting promise into `unthrown` with `fromPromise`, deciding per
  cause whether it's a modeled error or a defect;
- chain an `AsyncResult` with the same combinators as a sync `Result`;
- `await` it into a `Result` that never throws, and fold it with one `match`.

## Where to go next

- **Solve specific tasks:** the [How-to guides](../how-to/qualify-a-boundary)
  cover boundaries, tagged errors, do-notation, and framework integrations.
- **Understand the design:** [Qualification](../explanation/qualification) and
  [The async model](../explanation/async-model).
- **Look things up:** [Combinator reference](../reference/combinators).
