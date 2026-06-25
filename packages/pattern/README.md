# @unthrown/pattern

> Thin [ts-pattern](https://github.com/gvergnaud/ts-pattern) integration for
> [unthrown](https://github.com/btravers/unthrown)'s `Result`.

📖 **[Documentation](https://btravers.github.io/unthrown/guide/pattern-matching)** ·
[API Reference](https://btravers.github.io/unthrown/api/pattern/)

```sh
pnpm add @unthrown/pattern ts-pattern
```

```ts
import { match } from "ts-pattern";
import { toMatchable, tag } from "@unthrown/pattern";

match(toMatchable(result))
  .with({ _kind: "Ok" }, ({ value }) => `ok: ${value}`)
  .with({ _kind: "Err", error: tag("Forbidden") }, ({ error }) => `403 ${error.user}`)
  .with({ _kind: "Err" }, () => "error")
  .with({ _kind: "Defect" }, () => "bug")
  .exhaustive();
```

- `toMatchable(result)` — adapt a `Result` into a `_kind`-discriminated union
  ts-pattern can match, exposing the ok / err / defect channels.
- `tag(t)` — sugar for the `{ _tag: t }` pattern; narrows to the matching
  `TaggedError` variant, including its payload.

For the everyday exhaustive case, `matchTags` in core is simpler. Reach for this
when you need ts-pattern's guards, nested patterns, or wildcards.

`ts-pattern` is a peer dependency.

## License

[MIT](../../LICENSE) © Benoit TRAVERS
