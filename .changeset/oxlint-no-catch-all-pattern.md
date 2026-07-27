---
"@unthrown/oxlint": minor
---

**New opt-in rule `unthrown/no-catch-all-pattern`.** Bans the ts-pattern
catch-all `P._` (and its alias `P.any`) wherever `P` is imported from `unthrown`
or `ts-pattern`, so every error case must be enumerated by name
(`.with(tag("A"), tag("B"), …, handler)`, grouping cases that share a handler).

It is **stricter than unthrown's own default** — the library documents `P._` as
the sanctioned catch-all — so, like `no-throw`, it stays out of the `recommended`
preset and is enabled explicitly. A deliberate wildcard carries a targeted
`oxlint-disable`. Resolves `P` by its imported name via scope analysis (a rename
still fires; a decoy does not); a namespace import (`ns.P._`) is a documented
limit.
