---
"unthrown": patch
---

**`getOrThrow()`'s never-channel gate now explains itself.** When the error
channel is already empty (`E = never`) `getOrThrow()` is unnecessary — there is
nothing to throw, so `get()` is the tool. The gate previously surfaced as an
opaque `The 'this' context of type '…' is not assignable to method's 'this' of
type 'never'`. The `never` receiver now carries a message, so the diagnostic
reads:

> unthrown: getOrThrow is unnecessary here — the Err channel is empty (E =
> never), so there is nothing to throw. Use get() instead.

Behaviour is unchanged; only the compile-time message improves.
