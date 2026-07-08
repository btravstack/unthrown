# @unthrown/effect

> [Effect](https://effect.website) interop for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/interop)** ·
[API Reference](https://btravstack.github.io/unthrown/api/effect/)

```sh
pnpm add @unthrown/effect effect
```

Effect is the one neighbour that shares unthrown's three-channel shape: an
`Exit<A, E>` is a success or a `Cause`, and a `Cause` distinguishes a modeled
failure (`Cause.fail` ↔ `Err`) from an unexpected one (`Cause.die` ↔ `Defect`).
So `Result ↔ Exit` is a genuine **bijection**.

```ts
import { Ok, Err } from "unthrown";
import { toExit, fromEffect, toEither } from "@unthrown/effect";
import { Effect } from "effect";

toExit(Ok(1)); // Exit.succeed(1)
toExit(Err("e")); // Exit.fail("e")        — a modeled Cause.fail

// Run an Effect and collect its outcome (die/interrupt become a Defect):
await fromEffect(Effect.succeed(1)).match({ ok, err, defect: String });
```

- `toExit` / `fromExit` — the bijection: `Ok↔succeed`, `Err↔Cause.fail`,
  `Defect↔Cause.die`. On the way back a die/interruption becomes a `Defect`, and
  a `Defect` **dominates** a modeled failure in a composite cause (same rule as
  `all`).
- `toEither` / `fromEither` — `Either` has no defect channel, so `toEither(r,
onDefect)` **forces** you to triage the defect into `E` (Thesis #3). `fromEither`
  never yields a `Defect`.
- `toEffect` / `fromEffect` — `toEffect` lifts a `Result` **or** `AsyncResult`
  into an `Effect<T, E>` (`Defect → Effect.die`); `fromEffect` runs an
  environment-free `Effect<T, E>` to an `AsyncResult<T, E>`.

`effect` is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
