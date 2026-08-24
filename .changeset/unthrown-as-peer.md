---
"@unthrown/boxed": minor
"@unthrown/effect": minor
"@unthrown/neverthrow": minor
"@unthrown/standard-schema": minor
"@unthrown/orpc": minor
"@unthrown/prisma": minor
"@unthrown/drizzle": minor
---

`unthrown` is a peerDependency now, not a dependency. As a dependency the
package manager was free to give each companion its own copy whenever the
app's copy did not satisfy the subtree — and two copies diverge in both type
(structurally incompatible `Result`/`AsyncResult` across versions) and
runtime identity (`isResult` compares across copies). As a peer an
application installs exactly one `unthrown`, and an unmet range fails loudly
at install instead of silently forking the tree. npm ≥7 and pnpm
auto-install peers, so most installs are unchanged; add `unthrown` to your
dependencies explicitly if your setup does not.
