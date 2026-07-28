---
"@unthrown/effect": patch
"@unthrown/prisma": patch
"@unthrown/standard-schema": patch
---

Update stale v4 `match({ ok, err, defect })` doc examples to the v5
`{ ok, errCases, defect }` shape (including `fromSchemaAsync`'s `@example`,
which renders into the API reference).
