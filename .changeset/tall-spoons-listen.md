---
"unthrown": minor
"@unthrown/vitest": minor
---

Close a boundary hole where an `async` function's rejection escaped
qualification, stop `toBeErrTagged` counting a message as payload, and name the
value in `NonExhaustiveError`.

**`fromThrowable` / `fromSafeThrowable` now reject an `async` `fn`.** These wrap a
**synchronous** function, so they only ever see a synchronous `throw`: an async
`fn` rejects long after the boundary has returned, and its rejection could never
reach `qualify`. It used to produce `Ok(<Promise>)` — un-triaged — and the
rejection then floated as an unhandled rejection, which terminates the process on
Node by default:

```ts
const f = fromThrowable(
  async () => {
    throw new Error("boom");
  },
  (cause, defect) => defect(cause),
);
f(); // before: Ok(<Promise>) + an unhandled rejection
// now:    Defect(TypeError: … `fn` returned a thenable …)
```

The orphaned rejection is adopted and silenced, so it cannot float. Reach for
`fromPromise` / `fromSafePromise` for async work.

This is caught at runtime rather than by the type system — the one thenable ban
in the library that is not a compile error. Putting `NotThenable` on `fn`'s return
also makes **generic** functions unassignable, so `fromSafeThrowable(structuredClone)`
would stop compiling with `T` collapsed to `unknown`; the phantom rest-tuple guard
`fromPromise` uses fares worse. The success type is therefore slightly over-stated
(`Result<Promise<T>, E>` is spellable but never inhabited) — the mirror of
`recoverErrCases`'s `never` under-stating the error channel.

**`toBeErrTagged`'s exact-payload form now ignores every reserved key.** The
documented way to set a `TaggedError`'s message is a subclass field —
`override message = "…"` — which lands as an own **enumerable** property, so it
leaked into the payload and failed an exact assertion on the very pattern the
library prescribes:

```ts
class HttpError extends TaggedError("HttpError")<{ status: number }> {
  override message = `http ${this.status}`;
}
expect(Err(new HttpError({ status: 500 }))).toBeErrTagged("HttpError", { status: 500 });
// before: failed — the payload was seen as { status: 500, message: "http 500" }
// now:    passes
```

The matcher now skips `_tag`, `name`, `message` and `stack` — exactly the keys
`TaggedErrorInstance` omits and the constructor types `?: never`, so none of them
can legitimately be payload. Assertions using `expect.objectContaining` are
unaffected (they were already tolerant of the extra key).

**`NonExhaustiveError` now names the value it could not match.** `JSON.stringify`
_returns_ `undefined` — it does not throw — for a function, a symbol, or
`undefined`, so the `String(input)` fallback never fired and the message read
"no pattern matched the value undefined" for exactly the rogue inputs this error
exists to describe. It now falls back correctly (`… the value function rogueFn() {}`).
