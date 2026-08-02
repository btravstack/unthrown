---
"unthrown": patch
"@unthrown/orpc": patch
---

Adopt a discarded thenable so its rejection can't float, and stop
`createResultClient`'s proxy from ever exposing a callable `then`.

**Core: the observers now adopt-and-silence a smuggled thenable.** `tap`,
`tapErrCases`, `tapDefect` and `tapFailure` throw their callback's return value
away, and the `Result`-returning combinators (`flatMap`, `flatTap`, `bind`,
`flatMapErrCases`, `flatTapErrCases`, `recoverDefect`) reject a non-`Result`
one. Either way a thenable that slipped past `NotThenable` — via a cast or a
raw-JS caller — was dropped mid-flight, so a later rejection floated unhandled
and took the process down on Node by default. Worse for an observer: its whole
job is to make a failure visible, and this was the one path where the failure
was invisible.

The boundaries already did exactly this for a thenable `qualify` and a thenable
`fn`; this is the same net on the combinator side. The observed result still
passes through unchanged — silencing does not change any outcome.

**`@unthrown/orpc`: `createResultClient` now answers `then` with `undefined`.**
The proxy's `get` trap wraps every object/function property, so on a client
whose own proxy answers _any_ key with a nested procedure, `rc.then` would be
callable and `await rc` would invoke it. oRPC's client proxy happens to guard
`then` today, but that is its invariant to change, not ours to depend on.
