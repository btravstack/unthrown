---
"unthrown": patch
---

Fix false exhaustiveness for widened and union-typed value patterns. Such patterns still match at runtime, but no longer remove every possible value from the remaining cases. Use literal patterns, `as const`, or `P.tag` to prove coverage.
