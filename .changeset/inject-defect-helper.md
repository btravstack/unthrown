---
"unthrown": major
---

Stop exposing the `Defect` qualify-time marker; inject it into `qualify`
instead. `fromThrowable` / `fromPromise` now pass a `defect` helper as
`qualify`'s **second argument**, so domain code never imports it:

```ts
// before
import { fromPromise, Defect } from "unthrown";
fromPromise(fetchUser(id), (cause) =>
  cause instanceof NotFoundError ? ("not_found" as const) : Defect(cause),
);

// after
import { fromPromise } from "unthrown";
fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
);
```

`Defect` is no longer exported and `Result.Defect` is removed from the facade —
the marker was never a `Result` constructor (it returns the opaque qualify-time
marker), so grouping it with `Ok`/`Err` was misleading. The error-channel
inference (`Exclude<R, Defect>`) and all runtime behaviour are unchanged; this is
purely how the marker is obtained.

**Migration:** add `defect` as `qualify`'s second parameter and call `defect(c)`
where you previously called `Defect(c)`; drop the `Defect` import. For
`Result.Defect`, use the injected helper the same way.
