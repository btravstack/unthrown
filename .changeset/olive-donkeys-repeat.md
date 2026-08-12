---
"@unthrown/oxlint": major
---

Remove the `no-throw` and `prefer-ensure` rules. The plugin now ships six rules:
five in `recommended`, plus `no-get-or-throw` as the one opt-in.

`prefer-ensure` flagged a shape that violates no thesis — a `flatMap` gating its
own parameter is correct code with a better name available. Every other rule
flags a spelling unthrown considers _wrong_, and a report-only refactor
suggestion with a known false positive (a reassigned parameter) was not paying
for 300 lines of AST analysis.

`no-throw` reported every `ThrowStatement` unconditionally, with no binding to
resolve and no shape to match — a `no-restricted-syntax` entry rather than a
rule. The guidance it carried lives in the "Lint your codebase" guide and in
`no-get-or-throw`'s own message.

**Migrating:** remove `"unthrown/no-throw"` and `"unthrown/prefer-ensure"` from
your `.oxlintrc.json`. Neither was in the `recommended` preset, so configs using
the preset alone need no change. To keep banning `throw`, reach for oxlint's own
`no-restricted-syntax`.

Also: the `recommended` preset is now a plain object literal instead of a
`defineConfig(...)` call, which drops a runtime import of `oxlint` — a peer
dependency — from the plugin's module graph. The exported shape is unchanged.
