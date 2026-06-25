# @unthrown/pattern

> Thin [ts-pattern](https://github.com/gvergnaud/ts-pattern) integration for
> [unthrown](https://github.com/btravers/unthrown)'s `Result`.

📖 **[Documentation](https://btravers.github.io/unthrown/guide/pattern-matching)** ·
[API Reference](https://btravers.github.io/unthrown/api/pattern/)

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
  .with(P.ok(), ({ value }) => `ok: ${value}`)
  .with(P.err(P.tag("Forbidden")), ({ error }) => `403 ${error.user}`)
  .with(P.err(), () => "error")
  .with(P.defect(), () => "bug")
  .exhaustive();
```

- `P.ok(sub?)` / `P.err(sub?)` / `P.defect(sub?)` — match a channel; pass a
  sub-pattern (a literal, `P.string`, `P.select()`, …) to constrain or select the
  payload. (Or skip the sugar and match `{ tag: "Ok", … }` directly.)
- `P.tag(t)` — sugar for `{ _tag: t }`; nested in `P.err(...)` it narrows to the
  matching `TaggedError` variant, including its payload.

For the everyday exhaustive case, `matchTags` in core is simpler. Reach for this
when you need ts-pattern's guards, nested patterns, or wildcards.

`ts-pattern` is a peer dependency.

## License

[MIT](../../LICENSE) © Benoit TRAVERS
