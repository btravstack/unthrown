---
"@unthrown/oxlint": minor
---

`prefer-async-result`: add the `AsyncResult` import as part of the autofix.

The rule withheld its fix whenever `AsyncResult` was not already imported, since
rewriting to a name that is not in scope produces code that does not compile.
The reasoning was right, but it made the autofix unavailable in the rule's most
common case: a file that imports `Result` — which is what trips the rule — and
has never needed `AsyncResult`. The diagnostic fired, `--fix` did nothing, and
the import had to be added by hand first.

The fix now emits both edits. The specifier is inserted after the **last
`ImportSpecifier`**, so it is indifferent to spacing and to whether the existing
specifiers carry per-specifier `type` qualifiers:

```ts
// before
import type { Result } from "unthrown";
type T = Promise<Result<User, NotFound>>;

// after --fix
import type { Result, AsyncResult } from "unthrown";
type T = AsyncResult<User, NotFound>;
```

Still withheld, each because the fix would not compile or would not mean what it
says: an `async` function's own return annotation and a function _type_'s return
position (both must stay a native `Promise`); a local binding already named
`AsyncResult` (adding a specifier would collide rather than resolve); and a
namespace import, which has no specifier list to extend — `U.AsyncResult` is
reachable, but rewriting to a qualified name is a different edit.
