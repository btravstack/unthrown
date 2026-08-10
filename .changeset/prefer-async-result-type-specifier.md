---
"@unthrown/oxlint": patch
---

`prefer-async-result`: keep a types-only import types-only when the autofix adds
the `AsyncResult` specifier.

The fix inserted a bare `AsyncResult`, which is right for an
`import type { … }` declaration but wrong for a value declaration carrying an
inline `type` specifier. Adding a value specifier to
`import { type Result } from "unthrown"` makes the whole declaration
value-bearing, so under `verbatimModuleSyntax` TypeScript emits a runtime
`import "unthrown"` the file never had — an autofix quietly adding a runtime
dependency to a types-only module.

The inserted specifier now carries its own `type` qualifier unless the
declaration is already `import type { … }`, where repeating it would be a syntax
error:

```ts
// import type { Result } from "unthrown";
import type { Result, AsyncResult } from "unthrown";

// import { type Result } from "unthrown";
import { type Result, type AsyncResult } from "unthrown";
```
