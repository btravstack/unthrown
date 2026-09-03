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

| Rule                               | What it enforces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unthrown/no-ambiguous-error-type` | The `E` in `Result<T, E>` / `AsyncResult<T, E>` must name a concrete domain error — no `unknown`, `any`, `Error`, `object`, bare `{}`, `void`, or primitives. (`never` is allowed.) This is [Thesis #1](https://btravstack.github.io/unthrown/explanation/why-unthrown): `E` is only the _anticipated_ failures. Covers the matcher's `returnType<R>()` pin too, but only in `mapErrCases`, where the pin _is_ the new `E`.                                                                                                                                                                                                                                                                          |
| `unthrown/prefer-async-result`     | Prefer `AsyncResult<T, E>` over `Promise<Result<T, E>>` — a raw `Promise<Result>` can still reject. Autofixable, and the fix **adds the `AsyncResult` specifier** to an existing `unthrown` import when the name is not already in scope. Withheld on an `async` function's own return annotation and on a function _type_'s return position (the implementer may be `async`, so the rewrite would not compile), when the name `AsyncResult` is already bound to something else, and when there is no specifier list to extend (a namespace import).                                                                                                                                                 |
| `unthrown/no-unhandled-result`     | A `Result` / `AsyncResult` returned by a bare call (awaited or not) must not be dropped on the floor — it carries the error channel; dropping it silently discards failures. Bind it, return it, or eliminate it with `match` / a `get*` extractor.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `unthrown/no-async-result-race`    | No sibling `AsyncResult` construction while an earlier one is still unconsumed. An `AsyncResult` is **eager** — constructing it starts the work — so the readable spelling of a sequence, each step in its own `const` and then chained, is a silent **race**: it type-checks, it returns a `Result`, and it runs the steps concurrently. Sequence with `flatTap` (a later step needs only the earlier one's success) or `DoAsync().bind(...)` (it needs the value).                                                                                                                                                                                                                                 |
| `unthrown/no-catch-all-pattern`    | No `P._` catch-all in a matcher (nor ts-pattern's `P.any` alias) — enumerate every error case by name (`.with(P.tag("A"), P.tag("B"), …, handler)`, grouping cases that share a handler), so a new error can't be silently absorbed. This is unthrown's default position; `P._` is an escape hatch — a helper generic in `E`, or an `E` that is a single type rather than a union — and carries a targeted `oxlint-disable`. See [below](#the-catch-all-escape-hatch).                                                                                                                                                                                                                               |
| `unthrown/no-unused-matcher`       | A `…Cases` callback (the five error combinators, and `match`'s `errCases` handler) must use the matcher it was handed. The injected matcher is the only builder bound to the actual error — a builder sourced elsewhere satisfies the structural `ExhaustiveMatch` constraint but picks its branch from whatever value _it_ closed over: the wrong case is recovered silently, or nothing matches and the modeled error becomes a Defect. Also flags a second `match(...)` built inside the callback's own body (branch handlers are free to match their payload).                                                                                                                                   |
| `unthrown/no-throw`                | **Opt-in** (not in `recommended`): no raw `throw` statements — errors are returned (`Err(...)`), only a true defect ever throws. A modeled failure → `return Err(...)`; a failure genuinely unmodeled here → `recoverErrCases` + `get` (routing the case to the injected `defect(...)`); a known-technical precondition throw → a plain helper wrapped once with `fromSafeThrowable`; a deliberate throw site carries a targeted `oxlint-disable`. oxlint ships no `no-restricted-syntax`, so this rule is the only way to enforce the ban.                                                                                                                                                          |
| `unthrown/prefer-pre-lifted`       | **Opt-in** (not in `recommended`): no `.toAsync()` on a freshly constructed `Ok(...)` / `Err(...)` — `OkAsync(value)` and `ErrAsync(error)` are what unthrown ships for that, and the fresh literal is built only to be thrown away. The **receiver** is the whole test, which is what makes it safe where the removed `prefer-ensure` was not: `.toAsync()` on a `Result` that already exists (a variable, a call's return, a ternary, `fromNullable(...)`) is the combinator doing its job and is never reported. Autofixable — the pre-lifted name with the arguments untouched, `Ok()` and `Ok(undefined)` collapsing to `OkAsync()`, and the specifier added to the existing `unthrown` import. |
| `unthrown/no-get-or-throw`         | **Opt-in** (not in `recommended`): no `getOrThrow()` — it throws the modeled error, abandoning errors-as-values at the last step. Fold the error channel instead: `recoverErrCases((matcher, defect) => …)` empties `E`, so `.get()` compiles. Matched as a **zero-argument** member call, so Effect's one-argument `Option.getOrThrow(o)` is left alone. `getOrThrow()` is right in a **test** — exempt those files with an oxlint `overrides` entry rather than a rule option. Pairs with `no-throw`: with both on, there is no escape left.                                                                                                                                                       |

Most rules resolve import bindings via scope analysis (through the _imported_
name, so renamed imports resolve too), and only fire on unthrown's own
`Result` / `AsyncResult` — a `Result` from another library is left alone. A few
are keyed on a **name or shape** instead — unthrown's own vocabulary, needing
no `Result` binding to resolve: `no-get-or-throw` (a zero-argument
`.getOrThrow()` member call), `no-unused-matcher` (the `…Cases` method names),
and the `returnType<R>()` pin on a `mapErrCases` callback's own matcher
parameter. `no-throw` is keyed on the language statement itself — it reports
every `throw`, with nothing to resolve at all. `prefer-pre-lifted` resolves the
constructor through scope like the first group, but keys on the **receiver**
rather than a type annotation.

## Usage

Register the plugin and enable its rules in your `.oxlintrc.json`:

```json
{
  "jsPlugins": [{ "name": "unthrown", "specifier": "@unthrown/oxlint" }],
  "rules": {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-catch-all-pattern": "error",
    "unthrown/no-get-or-throw": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/no-throw": "error",
    "unthrown/no-unused-matcher": "error",
    "unthrown/prefer-async-result": "error"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.spec.ts"],
      "rules": { "unthrown/no-get-or-throw": "off" }
    }
  ]
}
```

The package's default export also exposes a `recommended` preset (an oxlint
config that registers the plugin and turns the recommended rules on —
`no-throw` and `no-get-or-throw` are the two explicit opt-ins) for setups that
build their config programmatically:

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
