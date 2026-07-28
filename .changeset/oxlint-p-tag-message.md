---
"@unthrown/oxlint": patch
---

Update `no-catch-all-pattern`'s diagnostic and documentation to spell the
recommended form as `.with(P.tag("A"), P.tag("B"), …, handler)`, following
core's move of the `tag` pattern constructor onto the `P` namespace. No rule
behaviour, name, or option changed — only the guidance text a developer reads
when the rule fires.
