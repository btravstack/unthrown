---
"unthrown": minor
---

**Breaking, released as a minor.** Remove four matcher patterns from `P`:
`P.any`, `P.string`, `P.number` and `P.union`. Code using any of them stops
compiling; the rewrites are mechanical and listed below.

`P.any` was a bare alias for `P._` — two names for one concept, the same
duplication the `unwrap*` / `orElse` aliases were removed for in v5. The other
three had no use the remaining surface does not already cover: a primitive-type
wildcard is `P.when` with a `typeof` guard, and grouping patterns under one
handler is what a `.with(a, b, handler)` arm does. None of the four appeared
anywhere in the library, its satellites, or the runnable `examples/` packages
outside their own tests.

`P` now carries `_`, `tag`, `instanceOf` and `when`.

**Migrating:**

```ts
// P.any → P._
matcher.with(P._, handler);

// P.string / P.number → P.when with a typeof guard
matcher.with(
  P.when((v): v is string => typeof v === "string"),
  handler,
);

// P.union(a, b) → a grouped arm, which is the same thing
matcher.with(P.tag("A"), P.tag("B"), handler);
```

`@unthrown/oxlint`'s `no-catch-all-pattern` still reports `P.any`: the rule also
covers a `P` imported straight from `ts-pattern`, where the alias remains.
