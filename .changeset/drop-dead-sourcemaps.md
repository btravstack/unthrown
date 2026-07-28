---
"unthrown": patch
"@unthrown/vitest": patch
"@unthrown/effect": patch
"@unthrown/neverthrow": patch
"@unthrown/boxed": patch
"@unthrown/standard-schema": patch
"@unthrown/oxlint": patch
"@unthrown/prisma": patch
"@unthrown/orpc": patch
---

Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
`src/`, so the published maps were dead-ends (silently broken go-to-definition
and stack mapping). Each package now sets `declarationMap: false`; consumers
land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
