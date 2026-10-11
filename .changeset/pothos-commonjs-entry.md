---
"@unthrown/pothos": patch
---

Fix the CommonJS entry: `require("@unthrown/pothos")` threw `registerPlugin is not a function`, because the bundler's Node interop made the default import of `@pothos/core` its whole module. The build now loads both CommonJS entries, so this fails `pnpm build` if it recurs.
