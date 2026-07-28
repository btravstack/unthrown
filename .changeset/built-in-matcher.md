---
"unthrown": major
---

**The exhaustive matcher is now built-in — the `ts-pattern` peer dependency is
removed.** `match`, `P`, and the new `NonExhaustiveError` are unthrown's own
(`Matcher` / `PatternMatcher` / `UniversalPattern` types included), keeping the
exact call-site shape: `.with(pattern, …patterns, handler)`, `P.tag(t)`, grouped
patterns, and `P._` / `P.any` / `P.instanceOf` / `P.when` / `P.union` /
`P.string` / `P.number`. Most code needs **no changes** beyond deleting
`ts-pattern` from your dependencies (if you only added it for unthrown).

Why: exhaustiveness is unthrown's central promise, and delegating it to a peer
meant the guarantee could vary with whichever ts-pattern version a consumer
resolved (ts-pattern changed exhaustiveness semantics in a minor, 5.8). The
built-in matcher computes exhaustiveness with plain `Exclude` over a tracked
`Remaining` parameter — shallow, fast, stable — and gives readable diagnostics
(a non-exhaustive builder's `.exhaustive` is a branded object naming the
unhandled cases).

**Fixes #145:** the catch-all arm is a state transition to `Remaining = never`
(not a deferred `Exclude`), so `.with(P._, …)` is provably exhaustive even when
the error type is an **unresolved generic** — a boundary helper generic in `E`
can now use `match` / the `…Cases` combinators. Tag arms alone remain correctly
unprovable over a generic `E`.

Breaking edges:

- Patterns built by the real `ts-pattern` library are no longer accepted by
  unthrown's matchers (and unthrown's `P` is not ts-pattern's). Import `match` /
  `P` from `"unthrown"` at unthrown call sites; keep `ts-pattern` for unrelated
  matching if your own code uses it.
- Deliberately unsupported patterns: deep structural inversion, `P.select`,
  array patterns, and the other ts-pattern-only `P.*` members. The supported
  vocabulary is the error channel's: literals, (nested) object discriminants
  (`{ _tag }` / `{ code }`), `instanceOf`, guards, unions, primitive
  wildcards, and the catch-all.
- A rogue unmatched value now throws unthrown's own `NonExhaustiveError`
  (exported from core), not ts-pattern's.
