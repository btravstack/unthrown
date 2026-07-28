# Upgrade from 4.x to 5.0

> **How-to.** A checklist for moving an existing codebase from `unthrown@4.x` to
> `5.0`. Most of it is mechanical renames the compiler will point at; two changes
> are worth doing deliberately. Work top to bottom.

## At a glance

| Kind                   | 4.x                                                              | 5.0                                                                                       |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Renamed** (loud)     | `mapErr` / `flatMapErr` / `recoverErr` / `tapErr` / `flatTapErr` | `mapErrCases` / `flatMapErrCases` / `recoverErrCases` / `tapErrCases` / `flatTapErrCases` |
| **Renamed** (loud)     | `match({ ok, err, defect })`                                     | `match({ ok, errCases, defect })`                                                         |
| **Renamed export**     | `UnwrapError`                                                    | `GetError`                                                                                |
| **Removed** (aliases)  | `unwrap` / `unwrapErr` / `unwrapOr` / `unwrapOrElse`             | `get` / `getErr` / `getOr` / `getOrElse`                                                  |
| **Removed** (aliases)  | `orElse` / `recover`                                             | `flatMapErrCases` / `recoverErrCases`                                                     |
| **Removed**            | `matchTags` / the `TagHandlers` type                             | `match({ …, errCases: (m) => m.with(P.tag("…"), …) })`                                    |
| **Renamed** (loud)     | the standalone `tag("…")` export                                 | `P.tag("…")` — it lives in the pattern namespace with every other constructor             |
| **Changed, same name** | `getOrThrow()` on any `Result`                                   | gated to a **non-empty** error channel (use `get()` otherwise)                            |
| **Packaging**          | `ts-pattern` bundled as a dependency                             | the matcher is **built-in** — no dependency at all                                        |
| **Packaging**          | `@unthrown/pattern` (`match` / `P` / `tag`)                      | absorbed into core — import them from `unthrown`                                          |
| **New**                | —                                                                | `ensure`, `DoAsync`, and the built-in `match` / `P` / `NonExhaustiveError`                |

Everything except the two rows below is a compile error at the old call site, so
`pnpm typecheck` is your migration to-do list.

## 1. Nothing to install — the matcher is built-in

unthrown's exhaustive matcher is its own module (same `.with(…)` / `P`
call-site shape ts-pattern users know), exported as `match` / `P` /
`NonExhaustiveError`. There is **no dependency to install** alongside
`unthrown` — and no version of any third-party library can change what
"exhaustive" means.

(History, if you followed the betas: early v5 bundled `ts-pattern`, then
briefly declared it a peer; the built-in matcher replaced it. If you added
`ts-pattern` for unthrown's sake, you can remove it — unless your own code
imports it directly for other matching.)

One boundary to know: patterns built by the real `ts-pattern` library are
**not** accepted by unthrown's matchers (and vice versa). Import `P` / `match`
from `"unthrown"` at unthrown call sites; keep `ts-pattern` for your
own unrelated matching if you use it.

## 2. Rename the error-channel combinators

Every Err-channel combinator gained a `…Cases` suffix, because each takes a
matcher over the error's _cases_, not a plain `(error) => …` callback.
The old names no longer exist, so the compiler flags each site:

```diff
- result.mapErr((m) => m.with(tag("NotFound"), wrap))
+ result.mapErrCases((m) => m.with(P.tag("NotFound"), wrap))
```

The arm moved too — `tag(…)` is now `P.tag(…)`, a separate change covered in
[§7](#_7-tag-moved-onto-p).

Same for `flatMapErr` → `flatMapErrCases`, `recoverErr` → `recoverErrCases`,
`tapErr` → `tapErrCases`, `flatTapErr` → `flatTapErrCases`. See
[Exhaustive error matching](../explanation/exhaustive-error-matching) for why.

## 3. Rename `match`'s error handler — `err` → `errCases`

::: warning The one break the compiler almost missed
In 5.0 the `match` error handler receives the **matcher**, not the error value,
and its key is renamed `err` → `errCases` to match the combinators. That rename
is what makes the change **loud**: a leftover 4.x `err: (error) => …` handler
still satisfied the new matcher constraint whenever it threw (a throwing handler
returns `never`, which vacuously satisfies it), so it compiled and then threw the
_matcher object_ at runtime. The renamed key turns that into an
excess-property compile error instead.
:::

```diff
  result.match({
    ok: (value) => value,
-   err: (error) => handleError(error),
+   errCases: (matcher) => matcher.with(P._, (error) => handleError(error)),
    defect: (cause) => report(cause),
  })
```

The `P._` arm above is the **mechanical** port — a 4.x `err` callback was a
blanket handler, and one wildcard reproduces it exactly. Treat it as a way
station, not a destination: replace it with one arm per case in `E` (grouping
those that share a handler) so the site starts failing the build when the union
grows. That is the whole reason the handler changed shape. `@unthrown/oxlint`'s
[`no-catch-all-pattern`](./lint-your-codebase#no-catch-all-pattern), now in the
recommended preset, will point at every arm still waiting to be converted.

If your old `err` handler was `(error) => { throw error }`, prefer
[`getOrThrow()`](../reference/combinators) — the sanctioned single-throw
extractor — over re-throwing inside a match arm.

## 4. Replace the removed aliases

The `@deprecated` aliases from the 4.x line are gone (one concept, one name):

| Removed        | Use                                                    |
| -------------- | ------------------------------------------------------ |
| `unwrap`       | `get`                                                  |
| `unwrapErr`    | `getErr`                                               |
| `unwrapOr`     | `getOr`                                                |
| `unwrapOrElse` | `getOrElse`                                            |
| `orElse`       | `flatMapErrCases`                                      |
| `recover`      | `recoverErrCases`                                      |
| `matchTags`    | `match({ …, errCases: (m) => m.with(P.tag("…"), …) })` |

`UnwrapError` (the throw type of `get`/`getErr`) is renamed **`GetError`**.

## 5. Check the two behavioural gates

- **`getOrThrow()`** now compiles only when the error channel is **non-empty**.
  On a `Result<T, never>` there is nothing to throw, so the compiler steers you to
  `get()`. The diagnostic names the reason.
- **`get()` / `getErr()`** are unchanged, but if you were relying on `getOrThrow`
  as a universal extractor, split by channel state: `get()` when `E = never`,
  `getOrThrow()` when it isn't.

## 6. `@unthrown/pattern` is gone

`match` and `P` are now exported by `unthrown` itself, and the package's `tag`
helper is now `P.tag` (see the next section). Drop the `@unthrown/pattern`
dependency and re-point the imports:

```diff
- import { match, P, tag } from "@unthrown/pattern";
+ import { match, P } from "unthrown";
```

## 7. `tag` moved onto `P`

`tag(t)` builds the `{ _tag: t }` pattern — it is a pattern constructor, so it
now lives in the pattern namespace beside `P._`, `P.instanceOf`, `P.when` and
the rest. The standalone export is **removed**, not deprecated: one concept,
one spelling.

```diff
- import { tag } from "unthrown";
+ import { P } from "unthrown";

  result.mapErrCases((matcher) =>
    matcher
-     .with(tag("NotFound"), () => 404)
-     .with(tag("Conflict"), () => 409),
+     .with(P.tag("NotFound"), () => 404)
+     .with(P.tag("Conflict"), () => 409),
  );
```

The missing `tag` export is a compile error at every import site, and each call
site follows from it. Nothing about the pattern's behaviour changed.

## What you gained

- **`ensure`** — validate or refine a success in place (`Result<T, E | E2>`, or a
  type-guard narrowing `T`).
- **`DoAsync()`** — the pre-lifted async twin of `Do()`.
- **`match` / `P`** as first-class re-exports, so the error matcher is one
  import.
