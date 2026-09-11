---
"@unthrown/orpc": minor
---

Target `@orpc/*` `^2.0.0-beta.34`. beta.34 removed oRPC's returned-error
channel and the `inferable` flag outright (middleapi/orpc#1987): a value
returned from a handler — an `ORPCError` included — is now always the
success payload, so `@unthrown/orpc@0.2.0` broke on it (an `Err` either
failed output validation into a 500, or was served as a 200 whose body was
the error).

`handlerResult`'s `Err` branch now **throws** the `ORPCError` instead of
returning it: a code declared in the procedure's `.errors({...})` map still
reaches the client fully typed (`defined: true`), a `Defect` still rethrows
its cause. An `ORPCError` thrown with no matching `.errors()` entry is no
longer inferable at all — it is statically invisible on the client (`never`
in the error union) and always lands as a runtime `Defect`, even though its
`code`/`data` still survive on the wire.

On the client, `isInferableError` (removed in beta.34) is replaced by
`isDefinedError` (`error instanceof ORPCError && error.defined`).

**Breaking**: anyone on `@orpc/*` beta.33 or lower must upgrade to beta.34+
before taking this version. A procedure that relied on an _undeclared_
returned `ORPCError` staying typed on the client must now declare that code
via `.errors({...})`.
