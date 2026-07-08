# @unthrown/boxed

> [Boxed](https://boxed.cool) interop for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/interop)** ·
[API Reference](https://btravstack.github.io/unthrown/api/boxed/)

```sh
pnpm add @unthrown/boxed @bloodyowl/boxed
```

Boxed's `Result` has two channels (`Ok`/`Error`) and no defect channel. Coming
**in**, every Boxed result is an `Ok` or `Error` — never a `Defect`. Going
**out**, a `Defect` has nowhere to live, so `toBoxed` **forces** you to triage it
with `onDefect` — no defect is ever silently folded into your domain error type.

```ts
import { Ok } from "unthrown";
import { toBoxed, fromBoxed } from "@unthrown/boxed";
import { Result } from "@bloodyowl/boxed";

toBoxed(Ok(1), (cause) => ({ _tag: "Bug", cause })); // Result.Ok(1)
fromBoxed(Result.Ok(1)); // Result<number, never>
```

- `toBoxed(r, onDefect)` / `fromBoxed(r)` — sync `Result ↔ Result`.
- `toBoxedFuture(ar, onDefect)` / `fromBoxedFuture(future)` — async
  `AsyncResult ↔ Future<Result>`.

> Boxed's `Option` has no analogue here — per unthrown's design, absence is
> expressed with `T | undefined` or `Result<T, NotFound>` (see `fromNullable`),
> not a dedicated `Option` type.

`@bloodyowl/boxed` is a peer dependency. (Boxed was formerly published as
`@swan-io/boxed`, now deprecated in favour of this maintained scope.)

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
