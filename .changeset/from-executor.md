---
"unthrown": minor
---

Add `fromExecutor` — the callback-API boundary.

`fromPromise` needs a promise, so bridging a callback or event API meant two
nested wrappers, `fromSafePromise(new Promise((resolve) => …))`. `fromExecutor`
is the single boundary, and its settler takes a **`Result`**:

```ts
const startServer = (port: number) =>
  fromExecutor<Server, PortInUse>((settle, defect) => {
    server.once("error", (cause) =>
      isAddrInUse(cause)
        ? settle(Err(new PortInUse(port)))
        : settle(defect(cause)),
    );
    server.listen(port, () => settle(Ok(server)));
  });
```

Because the settler names the variant there is no `qualify` to write and no
`unknown` can reach `E`. The `defect` helper is injected alongside it — the only
route to the defect channel from inside an asynchronous callback, where a
`throw` runs in its own turn and would escape the boundary entirely.

An `async` executor is caught at runtime rather than by the types: its rejection
settles a `Defect` instead of floating unhandled — `new Promise` lets the same
mistake float.
