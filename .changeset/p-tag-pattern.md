---
"unthrown": major
---

**`tag(t)` moves onto the pattern namespace as `P.tag(t)`; the standalone
`tag` export is removed.** `tag` is a pattern constructor, and every other one
already lives on `P` (`P._` / `P.any` / `P.instanceOf` / `P.when` / `P.union` /
`P.string` / `P.number`) — having exactly one of them sitting loose in the root
export was the odd one out. There is no alias: one concept, one name.

The type and the runtime behaviour are unchanged — it still produces the
`{ _tag: t }` object pattern, still narrows to the matching variant with its
payload, and still works in grouped patterns and inside `P.union`.

Migration is mechanical: drop `tag` from the import (keeping or adding `P`) and
prefix the call sites. (The `- import { tag } from "unthrown"` line below is the
v5-beta spelling; coming from 4.x the import was `@unthrown/pattern`, which is
gone — see the v5 upgrade guide.)

```diff
- import { tag } from "unthrown";
+ import { P } from "unthrown";

  result.mapErrCases((matcher) =>
    matcher
-     .with(tag("NotFound"), () => new ApiError({ status: 404 }))
-     .with(tag("Conflict"), tag("DriverError"), (e) => defect(e.cause)),
+     .with(P.tag("NotFound"), () => new ApiError({ status: 404 }))
+     .with(P.tag("Conflict"), P.tag("DriverError"), (e) => defect(e.cause)),
  );
```

`TaggedError` (and the `TaggedErrorConstructor` / `TaggedErrorInstance` types)
are untouched and still exported from the root — only the matcher pattern
moved.
