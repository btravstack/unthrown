---
"@unthrown/oxlint": minor
---

**New rule `unthrown/no-catch-all-pattern`.** Bans the matcher catch-all `P._`
(and its alias `P.any`) wherever `P` is imported from `unthrown` or `ts-pattern`,
so every error case must be enumerated by name (`.with(tag("A"), tag("B"), …,
handler)`, grouping cases that share a handler).

Resolves `P` by its imported name via scope analysis (a rename still fires; a
decoy does not); a namespace import (`ns.P._`) is a documented limit. It is part
of the `recommended` preset — see the accompanying entry for what that flags and
for the one case (a helper generic in `E`) that keeps the catch-all behind a
targeted `oxlint-disable`.
