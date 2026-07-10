---
"unthrown": minor
---

Rename several operators for channel-suffix consistency, keeping the old names as
**deprecated, runtime-identical aliases** (no breaking change; the aliases are
slated for removal in a future major):

- `orElse` → **`flatMapErr`** — it is `flatMap` on the error channel, so it now
  follows the `…Err` convention (like `mapErr` / `flatTapErr`).
- `recover` → **`recoverErr`** — pairs with `recoverDefect`.
- The extractor family unifies under `get…`: `unwrap` → **`get`**, `unwrapErr` →
  **`getErr`**, `unwrapOr` → **`getOr`**, `unwrapOrElse` → **`getOrElse`** (joining
  the existing `getOrNull` / `getOrUndefined` / `getOrThrow`).

Both `Result` and `AsyncResult` gain the new names; each deprecated alias just
delegates to its replacement (the gated `unwrap`/`unwrapErr` keep their `this`
type-gate). Editors will surface the old names with a deprecation strike-through
and point at the replacement.
