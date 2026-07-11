# The Result pattern has a hole, and it's where your bugs hide

_Errors as values fixed the visibility problem in TypeScript. Most libraries left a second one wide open. Here's the gap, and a tiny library that closes it._

---

Errors-as-values is one of the better ideas to reach mainstream TypeScript. Instead of throwing an exception that the type system can't see, a function returns a `Result<T, E>` and failure becomes part of the type. `neverthrow`, `boxed`, `byethrow`, and `effect` all give you some version of it, and if you've adopted one you already know why it's worth it.

But most of them stop one step short, and that step is where a specific class of bug lives: the kind that looks like a domain error but isn't. This is a piece about that gap, why it matters, and how a small library called [`unthrown`](https://github.com/btravstack/unthrown) closes it.

## First, the part everyone agrees on

A thrown exception is invisible to the type system. Consider:

```ts
function fetchUser(id: string): User;
```

It promises a `User`. It says nothing about the `NotFoundError`, the `TimeoutError`, or the `TypeError` from a typo three lines deep. The compiler won't make you handle any of them. They surface later, at runtime, as a stack trace, usually in production.

Errors as values fix this. A function returns either an `Ok` carrying a value or an `Err` carrying a _modeled_ error, and the signature finally tells the truth:

```ts
import { Ok, Err, type Result } from "unthrown";

type AgeError = "not_a_number" | "negative";

function parseAge(input: string): Result<number, AgeError> {
  const n = Number(input);
  if (Number.isNaN(n)) return Err("not_a_number");
  if (n < 0) return Err("negative");
  return Ok(n);
}
```

You chain without checking at every step. Success combinators run only on `Ok`; an `Err` slides straight through:

```ts
parseAge("42")
  .map((n) => n + 1) // Ok(43)
  .flatMap((n) => (n >= 18 ? Ok(n) : Err("underage"))) // Ok(43), E widens to add "underage"
  .unwrap(); // 43
```

And at the edge, you fold every outcome into one value:

```ts
const message = parseAge(input).match({
  ok: (age) => `age is ${age}`,
  err: (e) => (e === "negative" ? "must be positive" : "not a number"),
});
```

Good so far. This is the standard pitch, and it's a good one. Now the gap.

## The gap: two kinds of failure, one channel

There are really _two_ kinds of failure, and they are not the same thing.

- **Anticipated** domain errors. "User not found." "Payment declined." You model these. Callers handle them. They belong in `E`.
- **Unexpected** failures. A thrown `TypeError`, an un-triaged promise rejection, a bug in a callback you wrote at 2am. These are not part of your domain. They are defects.

If a library folds both into the same `E`, a bug starts to look like a domain error. You write a `match` that "handles" `E`, and a `TypeError` quietly rides down the recovery path meant for a declined payment. You return a polite "payment declined" message for what was actually a null dereference. The type said you were safe. The runtime disagreed, and it did it silently.

This is the hole in `neverthrow`, `boxed`, and `byethrow`. They model errors as values, but they have no proper channel for the unexpected, and a `throw` inside a `.map` callback either escapes as a real exception or gets swept into `E`. Effect is the exception here, and I'll come back to it.

## How `unthrown` closes it: a defect channel

`unthrown` keeps a **third runtime state**, a `Defect`, that is **invisible to the type**. `Result<T, E>` still exposes only your anticipated errors in `E`. Anything unexpected becomes a defect that short-circuits straight to the edge, where you log it and return a 500.

```ts
const message = parseAge(input).match({
  ok: (age) => `age is ${age}`,
  err: (e) => (e === "negative" ? "must be positive" : "not a number"),
  defect: (cause) => {
    console.error(cause); // a bug slipped through: log it, don't leak it
    return "something went wrong";
  },
});
```

Three properties make this hold together.

**1. A throw inside any combinator becomes a defect.** A bug in a `.map` or `.flatMap` callback is captured, not rethrown. That's what lets an HTTP handler do a single `match({ ok, err, defect })` at the edge with _no surrounding try/catch_ anywhere in the pipeline.

**2. A defect can only be seen by `match` or `recoverDefect`.** It is never silently recovered by `unwrapOr`, `getOrNull`, or `recover`. A defect is a bug, not an absent value, so it refuses to be mistaken for one.

**3. Qualification is enforced at every boundary.** This is the strict one. When you cross an async or throwing boundary, you _must_ triage each failure into a modeled error or a defect. There is no code path that yields `unknown` in `E`.

```ts
import { fromPromise, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {}

// Every rejection MUST be triaged. `defect` is injected as the second argument.
const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);
```

If you've used `boxed`, you've felt the absence of this. Its `fromPromise` hands you an error typed `undefined`, so without an explicit `mapError` your whole error space silently collapses to `unknown`. `unthrown` makes that triage mandatory at the door, so `unknown` can never leak into `E`. Keeping `E` honest is the whole point: an `E` that has quietly widened to `unknown` or `Error` makes `match` exhaustiveness meaningless, because "handle the catch-all" always type-checks.

## What about Effect?

If you know Effect, you know it _does_ have a defect channel (`die`). Effect is extremely powerful and I'm not here to knock it. But it is heavy. It conflates error handling with context, runtime, dependency injection, and a great deal more. Adopting it is a decision about your whole architecture, not a utility you drop into one module.

`unthrown` borrows Effect's best idea, a defect channel distinct from modeled errors, and ships just that, in a library small enough to be _done_: zero runtime dependencies, ESM-first, dual CJS/ESM, fully typed.

|                                   | errors as values | defect channel | enforced qualification | weight |
| --------------------------------- | :--------------: | :------------: | :--------------------: | :----: |
| **throw**                         |        ❌        |       ❌       |           ❌           |  none  |
| **neverthrow / boxed / byethrow** |        ✅        |       ❌       |           ❌           | light  |
| **effect**                        |        ✅        |       ✅       |           ✅           | heavy  |
| **unthrown**                      |        ✅        |       ✅       |           ✅           | light  |

## The whole thing, end to end

A realistic slice: fetch a user across an async boundary, run some domain logic, and handle everything once at the edge.

```ts
import { Ok, Err, fromPromise, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {}
class Suspended extends TaggedError("Suspended") {}

function loadDashboard(id: string) {
  return fromPromise(fetchUser(id), (cause, defect) =>
    cause instanceof NotFoundError ? new NotFound() : defect(cause),
  )
    .flatMap((user) => (user.status === "suspended" ? Err(new Suspended()) : Ok(user)))
    .map((user) => renderDashboard(user));
}

// At the HTTP edge: one match, no try/catch.
app.get("/dashboard/:id", async (req, res) => {
  const result = await loadDashboard(req.params.id);
  result.match({
    ok: (html) => res.status(200).send(html),
    err: (e) => res.status(e._tag === "NotFound" ? 404 : 403).end(),
    defect: (cause) => {
      logger.error(cause); // a DB driver blew up, a null deref, anything
      res.status(500).end();
    },
  });
});
```

Every anticipated failure is in the type, so the `match` is exhaustive and the compiler will yell if you forget an arm. Every _unexpected_ failure, including a throw buried in `renderDashboard`, funnels into `defect`. No `try`. No `catch`. No bug wearing a domain error's clothing.

## Across the wire, too

The Express handler above folds the defect to a 500 by hand, and the types stop at the HTTP boundary. If your API layer is [oRPC](https://orpc.dev) (v2), the [`@unthrown/orpc`](https://btravstack.github.io/unthrown/guide/orpc) bridge carries the same three-way split across the network:

```ts
import { handlerResult } from "@unthrown/orpc/server";

const dashboard = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {}, SUSPENDED: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      loadDashboard(input.id).mapErr((e) =>
        e._tag === "NotFound" ? errors.NOT_FOUND() : errors.SUSPENDED(),
      ),
    ),
  );
```

`Ok` becomes the response. An `Err` is returned as a value, and oRPC v2 infers it end-to-end — the _client_ sees the typed error union. A defect still collapses to `INTERNAL_SERVER_ERROR`, so a bug never becomes an error your frontend is invited to handle. And on the client, every call is a `Result` again:

```ts
import { createResultClient } from "@unthrown/orpc/client";

const rc = createResultClient(client);

const view = await rc.dashboard({ id }).match({
  ok: (html) => html,
  err: (e) => (e.code === "NOT_FOUND" ? render404() : renderSuspended()),
  defect: () => renderOops(), // 500s, network failures, undeclared throws
});
```

One error vocabulary, browser to database — the same bridge exists for Prisma (`@unthrown/prisma`), where each query's `E` is exactly the constraint violations that query can raise.

## A note on the AI angle, since someone will ask

You'll see errors-as-values pitched lately as "essential now that AI writes your code." There's a real observation underneath the hype, so let me state the honest version.

A type error is a tighter correction loop than a runtime crash. It's local, specific, and available before anything runs. A thrown exception costs a full generate → run → observe → retry cycle just to _discover_ that something can fail. That's true for a human reading a red squiggle, and it happens to be true for a coding agent reading `tsc` output. An exhaustive `match` that fails to compile on a missing arm is exactly the kind of immediate, mechanical signal both benefit from, and the defect channel is what keeps that signal meaningful by refusing to let `E` degrade into a catch-all.

But that's an amplifier, not the reason. Errors as values were good engineering before any assistant was in the loop, and the defect channel earns its place because a bug shouldn't be able to impersonate a domain error, regardless of who typed it. If the AI framing does anything for you, treat it as a nice side effect of a decision you'd want to make anyway.

## Not here to bury anyone

`unthrown` isn't a replacement for `neverthrow`, and it isn't a verdict on Effect. It's the library we wanted and couldn't find: the Result pattern with a real defect channel, mandatory qualification at the boundaries, and nothing else. We built it, adopted it, and open-sourced it in case it's the shape you were missing too.

- **Repo:** https://github.com/btravstack/unthrown
- **Docs:** https://btravstack.github.io/unthrown/
- `pnpm add unthrown`

_Ordinary errors are unthrown: returned as values, not flung up the stack. Only a true defect ever throws, and only at `unwrap`._
