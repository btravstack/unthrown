# Migration

## `unthrown@4.x` → `5.0`

The full, worked guide lives in the docs:
**[Upgrade from 4.x to 5.0](https://btravstack.github.io/unthrown/how-to/upgrade-to-v5)**.
The headline breaking surface, so you have it up front:

- **Error combinators renamed** with a `…Cases` suffix (each takes an exhaustive
  matcher): `mapErr` → `mapErrCases`, `flatMapErr` → `flatMapErrCases`,
  `recoverErr` → `recoverErrCases`, `tapErr` → `tapErrCases`,
  `flatTapErr` → `flatTapErrCases`.
- **`match`'s error handler renamed** `err` → `errCases` (it takes the matcher,
  not the error value). This one was a _silent_ runtime break in the first betas —
  a leftover `err:` handler that threw compiled and then threw the matcher object;
  the renamed key makes it an excess-property compile error.
- **Removed 4.x aliases:** `unwrap` / `unwrapErr` / `unwrapOr` / `unwrapOrElse`
  (use `get` / `getErr` / `getOr` / `getOrElse`), `orElse` / `recover` (use
  `flatMapErrCases` / `recoverErrCases`), and `matchTags` / the `TagHandlers` type
  (use `match({ …, errCases: (m) => m.with(tag("…"), …) })`).
- **Renamed export:** `UnwrapError` → `GetError`.
- **`getOrThrow()`** is now gated to a non-empty error channel; on a
  `Result<T, never>` use `get()`.
- **The matcher is built-in** — nothing to install alongside `unthrown`. (The
  early v5 betas took `ts-pattern` as a peer; the built-in matcher replaced it,
  keeping the same `.with(…)` / `tag` / `P` call-site shape.)
- **`@unthrown/pattern` was absorbed into core** — import `match` / `P` / `tag`
  from `unthrown`.
- **New:** `ensure`, `DoAsync`, and the `match` / `P` / `tag` re-exports.
