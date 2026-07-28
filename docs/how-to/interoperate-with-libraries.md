# Interoperate with other libraries

> **How-to.** Thin `to*` / `from*` bridges between `Result` / `AsyncResult` and
> the neighbours in the errors-as-values space. Nothing to learn beyond "which
> direction am I going."

| Package                                    | Peer dependency    | Bridges                    |
| ------------------------------------------ | ------------------ | -------------------------- |
| [`@unthrown/effect`](/api/effect/)         | `effect`           | `Exit`, `Either`, `Effect` |
| [`@unthrown/neverthrow`](/api/neverthrow/) | `neverthrow`       | `Result`, `ResultAsync`    |
| [`@unthrown/boxed`](/api/boxed/)           | `@bloodyowl/boxed` | `Result`, `Future<Result>` |

For [Standard Schema](https://standardschema.dev) validators (Zod, Valibot,
ArkType), see the dedicated
[Validate with Standard Schema](./validate-with-standard-schema) guide.

## The one rule: does the neighbour have a defect channel?

unthrown has **three** channels — `Ok`, `Err`, and the out-of-band `Defect`. Most
libraries have only two. That single difference decides every signature.

- **Coming _in_** (`from*`), a two-channel result is only ever an `Ok` or an
  `Err` — the bridge **never** produces a `Defect`.
- **Going _out_** (`to*`) to a two-channel type, a `Defect` has nowhere to live.
  Rather than silently fold it into your domain error, the bridge **forces** you to
  triage it with a mandatory `onDefect: (cause) => E`. There is no one-arg form.

```ts
import { Ok } from "unthrown";
import { toNeverthrow } from "@unthrown/neverthrow";

// onDefect is required — the compiler will not let you drop a defect.
toNeverthrow(Ok(1), (cause) => ({ _tag: "Bug", cause }));
```

## Effect — a genuine bijection

Effect is the exception: it _does_ have a defect channel (`Cause.die`), so
`Result ↔ Exit` round-trips losslessly.

```ts
import { Ok, Err, tag, TaggedError } from "unthrown";
import { toExit, fromEffect } from "@unthrown/effect";
import { Effect } from "effect";

class NotFound extends TaggedError("NotFound") {}
class Timeout extends TaggedError("Timeout") {}
type User = { name: string };

toExit(Ok(1)); // Exit.succeed(1)
toExit(Err("e")); // Exit.fail("e")  — a modeled Cause.fail
// a Defect would become Exit.die(cause)

// Run an Effect and collect its outcome; a die/interrupt becomes a Defect.
// Effect's error channel arrives as E, so name each of its cases:
declare const loadUser: Effect.Effect<User, NotFound | Timeout>;

await fromEffect(loadUser).match({
  ok: (user) => user.name,
  errCases: (matcher) =>
    matcher.with(tag("NotFound"), () => "missing").with(tag("Timeout"), () => "timed out"),
  defect: String,
});
```

`toEffect` also accepts an `AsyncResult`, and `toEither` — since `Either` has no
defect channel — takes the same mandatory `onDefect`.

## Async pairs

Every package mirrors its sync pair for the asynchronous types:

- `@unthrown/effect` — `fromEffect` returns an `AsyncResult`; `toEffect` accepts one.
- `@unthrown/neverthrow` — `toNeverthrowAsync` / `fromNeverthrowAsync` bridge
  `AsyncResult ↔ ResultAsync`.
- `@unthrown/boxed` — `toBoxedFuture` / `fromBoxedFuture` bridge
  `AsyncResult ↔ Future<Result>`.

On the way in, an _unexpected_ rejection inside the neighbour's async type becomes a
`Defect` — never a silently-swallowed error. (Boxed's `Future` has no failure
channel and never rejects, so for `fromBoxedFuture` this is a defensive guarantee
rather than a path you can actually hit.)

## Where to go next

- Why the `to*` triage is mandatory: [Qualification](../explanation/qualification).
- Validators as results: [Validate with Standard Schema](./validate-with-standard-schema).
