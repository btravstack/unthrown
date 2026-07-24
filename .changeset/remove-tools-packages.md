---
"unthrown": patch
"@unthrown/prisma": patch
"@unthrown/orpc": patch
---

Remove the local `tools/tsconfig` / `tools/typedoc` packages and consume the published `@btravstack/tsconfig` / `@btravstack/typedoc` config directly (every package now extends `@btravstack/*` and takes it from the catalog).
