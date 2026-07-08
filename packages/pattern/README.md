# @unthrown/pattern

> Thin [ts-pattern](https://github.com/gvergnaud/ts-pattern) integration for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/pattern-matching)** ·
[API Reference](https://btravstack.github.io/unthrown/api/pattern/)

```sh
pnpm add @unthrown/pattern ts-pattern
```

A `Result` is a discriminated union (`{ tag: "Ok" | "Err" | "Defect" }`), so
ts-pattern matches it **natively** — narrowing, selection, and `.exhaustive()`
all work. This package is just pattern-constructor sugar.

```ts
import { match } from "ts-pattern";
import * as P from "@unthrown/pattern";

match(result)
  .with(P.Ok(), ({ value }) => `ok: ${value}`)
  .with(P.Err(P.tag("Forbidden")), ({ error }) => `403 ${error.user}`)
  .with(P.Err(), () => "error")
  .with(P.Defect(), () => "bug")
  .exhaustive();
```

- `P.Ok(sub?)` / `P.Err(sub?)` / `P.Defect(sub?)` — match a channel; pass a
  sub-pattern to constrain or select the payload: a literal, or any `ts-pattern`
  pattern (e.g. `ts-pattern`'s own `P.string` / `P.select()`, imported from
  `ts-pattern`). (Or skip the sugar and match `{ tag: "Ok", … }` directly.)
- `P.tag(t)` — sugar for `{ _tag: t }`; nested in `P.Err(...)` it narrows to the
  matching `TaggedError` variant, including its payload.

For the everyday exhaustive case, `matchTags` in core is simpler. Reach for this
when you need ts-pattern's guards, nested patterns, or wildcards.

`ts-pattern` is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
