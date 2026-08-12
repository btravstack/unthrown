---
"@unthrown/oxlint": minor
---

Restore the `no-throw` rule, removed in 5.4.0 (#227). It is unchanged and still
**opt-in** — not part of the `recommended` preset, since it bans a core language
statement.

The 5.4.0 removal reasoned that an unconditional `ThrowStatement` report belongs
in a `no-restricted-syntax` entry rather than a rule. **oxlint does not implement
`no-restricted-syntax`**, so that migration path does not exist: a codebase that
bans `throw` outright had no way left to enforce it. And because oxlint refuses
to parse a config naming an unknown rule, the upgrade did not degrade to a
warning — it failed the consumer's _entire_ lint run, every non-unthrown rule
included, on a minor.

Nothing to do to adopt: a config that still names `"unthrown/no-throw"` resolves
again, and existing `oxlint-disable-next-line unthrown/no-throw` comments point
at a rule that exists once more.

`prefer-ensure` stays removed. It flagged correct code that violates no thesis —
a report-only refactor suggestion, with a known false positive, that was not
paying for its AST analysis. Configs naming it should drop the entry.
