# @unthrown/effect

> [Effect](https://effect.website) interop for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/interoperate-with-libraries)** ·
[API Reference](https://btravstack.github.io/unthrown/api/effect/)

```sh
pnpm add @unthrown/effect 'effect@^4.0.1' unthrown
```

Effect is the one neighbour that shares unthrown's three-channel shape: an
`Exit<A, E>` is a success or a `Cause`, and a `Cause` distinguishes a modeled
failure (`Cause.fail` ↔ `Err`) from an unexpected one (`Cause.die` ↔ `Defect`).
So `Result ↔ Exit` is a genuine **bijection**.

```ts
import { toExit, fromEffect, toResult } from "@unthrown/effect";
import { Effect } from "effect";
import { Ok, Err, P, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {}

toExit(Ok(1)); // Exit.succeed(1)
toExit(Err("e")); // Exit.fail("e")        — a modeled Cause.fail

const load = (id: string): Effect.Effect<string, NotFound> =>
  id === "1" ? Effect.succeed("value") : Effect.fail(new NotFound());

// Run an Effect and collect its outcome (die/interrupt become a Defect):
await fromEffect(load("1")).match({
  ok: (value) => value,
  // the error channel, matched exhaustively — every case named
  errCases: (matcher) => matcher.with(P.tag("NotFound"), () => "missing"),
  defect: String,
});
```

- `toExit` / `fromExit` — the bijection: `Ok↔succeed`, `Err↔Cause.fail`,
  `Defect↔Cause.die`. On the way back a die/interruption becomes a `Defect`, and
  a `Defect` **dominates** a modeled failure in a composite cause (same rule as
  `all`).
- `toResult` / `fromResult` — Effect’s `Result` has no defect channel, so `toResult(r,
  onDefect)` **forces** you to triage the defect into `E` (Thesis #3). `fromResult`
  never yields a `Defect`.
- `toEffect` / `fromEffect` — `toEffect` lifts a `Result` **or** `AsyncResult`
  into an `Effect<T, E>` (`Defect → Effect.die`); `fromEffect` runs an
  environment-free `Effect<T, E>` to an `AsyncResult<T, E>`.

`effect` is a peer dependency at `^4.0.1`. Node.js `^20.19.0 || >=22.12.0` is required
so the CommonJS entry can load Effect's ESM distribution.

## Migrating from Effect 3

Effect 4 renamed `Either` to `Result`. Replace `toEither` / `fromEither` with
`toResult` / `fromResult`, and use Effect's `Result.succeed` / `Result.fail`
where you previously used `Either.right` / `Either.left`. `toResult` still
requires `onDefect`. The Exit and Effect bridge names stay the same.

Applications staying on Effect 3 should keep `@unthrown/effect` 5.x.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
