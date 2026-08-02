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

| Rule                               | What it enforces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unthrown/no-ambiguous-error-type` | The `E` in `Result<T, E>` / `AsyncResult<T, E>` must name a concrete domain error — no `unknown`, `any`, `Error`, `object`, bare `{}`, `void`, or primitives. (`never` is allowed.) This is [Thesis #1](https://btravstack.github.io/unthrown/explanation/why-unthrown): `E` is only the _anticipated_ failures. Covers the matcher's `returnType<R>()` pin too, but only in `mapErrCases`, where the pin _is_ the new `E`.                                                                                                                                        |
| `unthrown/prefer-async-result`     | Prefer `AsyncResult<T, E>` over `Promise<Result<T, E>>` — a raw `Promise<Result>` can still reject. Autofixable — except on an `async` function's own return annotation and on a function _type_'s return position (the implementer may be `async`), where the rule reports without a fix since the rewrite would not compile.                                                                                                                                                                                                                                     |
| `unthrown/no-unhandled-result`     | A `Result` / `AsyncResult` returned by a bare call (awaited or not) must not be dropped on the floor — it carries the error channel; dropping it silently discards failures. Bind it, return it, or eliminate it with `match` / a `get*` extractor.                                                                                                                                                                                                                                                                                                                |
| `unthrown/no-catch-all-pattern`    | No `P._` / `P.any` catch-all in a matcher — enumerate every error case by name (`.with(P.tag("A"), P.tag("B"), …, handler)`, grouping cases that share a handler), so a new error can't be silently absorbed. This is unthrown's default position; `P._` is an escape hatch — a helper generic in `E`, or an `E` that is a single type rather than a union — and carries a targeted `oxlint-disable`. See [below](#the-catch-all-escape-hatch).                                                                                                                    |
| `unthrown/no-unused-matcher`       | A `…Cases` callback (the five error combinators, and `match`'s `errCases` handler) must use the matcher it was handed. The injected matcher is the only builder bound to the actual error — a builder sourced elsewhere satisfies the structural `ExhaustiveMatch` constraint but picks its branch from whatever value _it_ closed over: the wrong case is recovered silently, or nothing matches and the modeled error becomes a Defect. Also flags a second `match(...)` built inside the callback's own body (branch handlers are free to match their payload). |
| `unthrown/prefer-ensure`           | **Opt-in** (not in `recommended`): prefer `ensure` over a `flatMap` whose success branch returns its own parameter untouched — a predicate wearing a bind costume. `ensure` names the intent and passes the _same_ `Ok` through instead of allocating a fresh one. Report-only: the rewrite is not mechanical (a reversed ternary needs the condition negated, and a truthiness guard is not a `boolean` predicate).                                                                                                                                               |
| `unthrown/no-throw`                | **Opt-in** (not in `recommended`): no raw `throw` statements — errors are returned (`Err(...)`), only a true defect ever throws. `getOrThrow()` is the sanctioned extraction escape; a known-technical precondition throw lives in a plain helper wrapped once with `fromSafeThrowable`; a deliberate throw site carries a targeted `oxlint-disable`.                                                                                                                                                                                                              |

The rules resolve import bindings via scope analysis (through the _imported_
name, so renamed imports resolve too), and only fire on unthrown's own
`Result` / `AsyncResult` — a `Result` from another library is left alone. The one
check keyed on shape rather than an import is the `returnType<R>()` pin: it
requires the matcher parameter of a `mapErrCases` callback, a combination that is
unthrown's own vocabulary.

## Usage

Register the plugin and enable its rules in your `.oxlintrc.json`:

```json
{
  "jsPlugins": [{ "name": "unthrown", "specifier": "@unthrown/oxlint" }],
  "rules": {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-catch-all-pattern": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/no-unused-matcher": "error",
    "unthrown/prefer-async-result": "error",
    "unthrown/prefer-ensure": "error",
    "unthrown/no-throw": "error"
  }
}
```

The package's default export also exposes a `recommended` preset (an oxlint
config that registers the plugin and turns the recommended rules on — `no-throw`
and `prefer-ensure` are the two explicit opt-ins) for setups that build their
config programmatically:

```ts
import unthrown from "@unthrown/oxlint";
// unthrown.recommended → { jsPlugins: [...], rules: { "unthrown/...": "error" } }
```

`oxlint` is a peer dependency. JS plugins require a recent oxlint (≥ 1.69).

## The catch-all escape hatch

`no-catch-all-pattern` is on by default, so `P._` needs a reason wherever it
survives. Two cases are legitimate. The first is a helper **generic in `E`**: no
list of arms can prove exhaustiveness against an unresolved type parameter —
only the catch-all can, because it is a state transition to "nothing remains"
rather than a subtraction from `E`. The second is an **`E` that is a single
type** rather than a union of cases — a validator's issues array, say — where
one arm _is_ the enumeration. Keep the catch-all there, and say which it is:

```ts
import { P, type Result } from "unthrown";

const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
  result.mapErrCases((matcher) =>
    // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in `E`: no arm list can prove exhaustiveness
    matcher
      .returnType<ApiError>()
      .with(P._, (error) => new ApiError({ status: 500, error })),
  );
```

Everywhere the error union is concrete, name the cases instead — grouping the
ones that share a handler:

```ts
import { P } from "unthrown";

// E is `NotFound | Conflict | DriverError` — every member gets an arm:
result.mapErrCases((matcher) =>
  matcher
    .with(P.tag("NotFound"), () => new ApiError({ status: 404 }))
    .with(
      P.tag("Conflict"),
      P.tag("DriverError"),
      (e) => new ApiError({ status: 500, error: e }),
    ),
);
```

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
