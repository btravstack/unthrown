# @unthrown/oxlint

> An [oxlint](https://oxc.rs/docs/guide/usage/linter) plugin that enforces
> [unthrown](https://github.com/btravstack/unthrown)'s conventions.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/lint-your-codebase)**

```sh
pnpm add -D @unthrown/oxlint oxlint
```

A small set of lint rules that keep unthrown code honest — turning the
library's theses into automated checks.

## Rules

| Rule                               | What it enforces                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unthrown/no-ambiguous-error-type` | The `E` in `Result<T, E>` / `AsyncResult<T, E>` must name a concrete domain error — no `unknown`, `any`, `Error`, `object`, bare `{}`, `void`, or primitives. (`never` is allowed.) This is [Thesis #1](https://btravstack.github.io/unthrown/explanation/why-unthrown): `E` is only the _anticipated_ failures.                                      |
| `unthrown/prefer-async-result`     | Prefer `AsyncResult<T, E>` over `Promise<Result<T, E>>` — a raw `Promise<Result>` can still reject. Autofixable — except on an `async` function's own return annotation and on a function _type_'s return position (the implementer may be `async`), where the rule reports without a fix since the rewrite would not compile.                        |
| `unthrown/no-unhandled-result`     | A `Result` / `AsyncResult` returned by a bare call (awaited or not) must not be dropped on the floor — it carries the error channel; dropping it silently discards failures. Bind it, return it, or eliminate it with `match` / a `get*` extractor.                                                                                                   |
| `unthrown/no-throw`                | **Opt-in** (not in `recommended`): no raw `throw` statements — errors are returned (`Err(...)`), only a true defect ever throws. `getOrThrow()` is the sanctioned extraction escape; a known-technical precondition throw lives in a plain helper wrapped once with `fromSafeThrowable`; a deliberate throw site carries a targeted `oxlint-disable`. |

The rules resolve import bindings via scope analysis (through the _imported_
name, so renamed imports resolve too), and only fire on unthrown's own
`Result` / `AsyncResult` — a `Result` from another library is left alone.

## Usage

Register the plugin and enable its rules in your `.oxlintrc.json`:

```json
{
  "jsPlugins": [{ "name": "unthrown", "specifier": "@unthrown/oxlint" }],
  "rules": {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/prefer-async-result": "error",
    "unthrown/no-throw": "error"
  }
}
```

The package's default export also exposes a `recommended` preset (an oxlint
config that registers the plugin and turns the recommended rules on —
`no-throw` stays an explicit opt-in) for setups that build their config
programmatically:

```ts
import unthrown from "@unthrown/oxlint";
// unthrown.recommended → { jsPlugins: [...], rules: { "unthrown/...": "error" } }
```

`oxlint` is a peer dependency. JS plugins require a recent oxlint (≥ 1.69).

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
