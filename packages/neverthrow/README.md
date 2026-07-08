# @unthrown/neverthrow

> [neverthrow](https://github.com/supermacro/neverthrow) interop for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/interop)** ·
[API Reference](https://btravstack.github.io/unthrown/api/neverthrow/)

```sh
pnpm add @unthrown/neverthrow neverthrow
```

neverthrow has two channels (`Ok`/`Err`) and no defect channel. Coming **in**,
every neverthrow result is an `Ok` or `Err` — never a `Defect`. Going **out**, a
`Defect` has nowhere to live, so `toNeverthrow` **forces** you to triage it with
`onDefect` — no defect is ever silently folded into your domain error type.

```ts
import { Ok } from "unthrown";
import { toNeverthrow, fromNeverthrow } from "@unthrown/neverthrow";
import { ok as ntOk } from "neverthrow";

toNeverthrow(Ok(1), (cause) => ({ _tag: "Bug", cause })); // neverthrow Ok(1)
fromNeverthrow(ntOk(1)); // Result<number, never>
```

- `toNeverthrow(r, onDefect)` / `fromNeverthrow(r)` — sync `Result ↔ Result`.
- `toNeverthrowAsync(ar, onDefect)` / `fromNeverthrowAsync(ra)` — async
  `AsyncResult ↔ ResultAsync`. An unexpected rejection inside a `ResultAsync`
  becomes a `Defect` on the way in.

`neverthrow` is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
