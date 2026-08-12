---
"unthrown": patch
---

Fix a `fromExecutor` hang: a non-`Result` whose `then` getter throws, handed to
`settle` from asynchronous code, left the `AsyncResult` unsettled forever.

`settle` runs in the caller's own turn, outside the `try` that guards the
executor body, so the thenable probe on the value about to be discarded was the
one unguarded `isThenable` call in the library. A hostile `then` getter — a
Proxy `get` trap, or a throwing accessor — escaped into that turn as an
unhandled error _before_ `resolve` was reached, so the promise behind the
`AsyncResult` never settled and every `await` on it hung.

The probe now goes through the internal `silenceIfThenable` helper, which is
total: the value is dropped without adopting it and the `TypeError` Defect the
boundary already documents is always reached. Reachable only from a cast or a
raw-JS caller, since `settle` is typed to take a `Result`.
