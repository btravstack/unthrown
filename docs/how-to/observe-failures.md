# Observe and log failures

> **How-to.** Run a side effect — a log line, a metric, an audit write — on a
> success or a failure **without changing the `Result`**. Each channel has its
> observer; pick by what you watch and whether the effect itself can fail.

| Watch…                 | effect cannot fail | effect returns a `Result` |
| ---------------------- | ------------------ | ------------------------- |
| the success value      | `tap`              | `flatTap`                 |
| the modeled error      | `tapErrCases`      | `flatTapErrCases`         |
| the defect             | `tapDefect`        | —                         |
| either failure channel | `tapFailure`       | —                         |

The examples share this setup:

```ts
import { P, TaggedError, type AsyncResult } from "unthrown";

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Timeout extends TaggedError("Timeout")<{ ms: number }> {}
class AuditUnavailable extends TaggedError("AuditUnavailable") {}

type User = { id: string; name: string };
declare function loadUser(id: string): AsyncResult<User, NotFound | Timeout>;
declare function recordAudit(
  event: string,
): AsyncResult<void, AuditUnavailable>;
declare const log: {
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
```

## Watch the success value

`tap` runs a plain side effect and passes the value through. `flatTap` runs a
**failable** one — its callback returns a `Result` or `AsyncResult`, the
original value is kept, and the effect's error joins `E`:

```ts
const user = loadUser("42")
  .tap((u) => log.info("loaded", u.id))
  .flatTap((u) => recordAudit(`read ${u.id}`));
// AsyncResult<User, NotFound | Timeout | AuditUnavailable>
```

Returning a `Result` from `tap` would silently drop its outcome, which is why
`flatTap` exists. An `async` callback does not compile in either: async work
enters through a boundary (`fromPromise`) and composes with `flatTap`.

## Watch the modeled error

`tapErrCases` takes the same exhaustive matcher as the other error combinators
— every case named — and discards what the branches return; the `Err` passes
through unchanged:

```ts
const logged = loadUser("42").tapErrCases((matcher) =>
  matcher
    .with(P.tag("NotFound"), (e) => log.info("no such user", e.id))
    .with(P.tag("Timeout"), (e) => log.error("user lookup timed out", e.ms)),
);
// AsyncResult<User, NotFound | Timeout> — unchanged
```

`flatTapErrCases` is its failable twin: each branch returns a `Result`, the
original error still passes through, and the effect's own error joins `E`.

## Watch the defect

A defect flows past every success and error combinator. `tapDefect` is the one
place besides `match` and `recoverDefect` that sees it — without consuming it:

```ts
const reported = loadUser("42").tapDefect((cause) =>
  log.error("bug in user lookup", cause),
);
```

## Watch either failure

When the effect is the same for both failure channels — one error log, one
"it went KO" metric — `tapFailure` runs it on an `Err` **or** a `Defect`. Its
callback receives the failure variant, so it narrows on `tag`:

```ts
const observed = loadUser("42").tapFailure((failure) => {
  if (failure.tag === "Err") log.info("modeled failure", failure.error._tag);
  else log.error("defect", failure.cause);
});
```

There is deliberately no `recoverFailure`: recovering a defect stays the
separate, explicit `recoverDefect`.

## When an observer throws

A throw inside `tap` becomes a `Defect` with the thrown value as its cause. A
throw inside a **failure** observer (`tapErrCases`, `tapDefect`, `tapFailure`,
`flatTapErrCases`) becomes a `Defect` whose cause is
`AggregateError([thrown, original])` — a broken logger never erases the
failure it was logging. Returning the injected `defect(cause)` from a
`tapErrCases` branch takes the same route: it is the expression form of a
`throw`.

## Validate or drop the value

Two neighbours that often sit in the same pipeline:

- `ensure(predicate, onFail)` keeps the value when the predicate holds and turns
  it into `Err(onFail(value))` otherwise — a validation step, not an observer.
- `discard()` drops the value, leaving `Result<void, E>` — handy at the end of
  a pipeline that ran only for its effects.

```ts
class Banned extends TaggedError("Banned") {}

const done = loadUser("42")
  .ensure(
    (u) => u.name !== "mallory",
    () => new Banned(),
  )
  .flatTap((u) => recordAudit(`checked ${u.id}`))
  .discard();
// AsyncResult<void, NotFound | Timeout | Banned | AuditUnavailable>
```

## Factor an observer into a helper

A callback pulled out of the pipeline needs to name its parameter's type. The
exported helper types exist for that:

- `ErrMatcher<E>` — the matcher an error combinator hands its callback;
- `Settle<T, E>` — the settler a `fromExecutor` executor receives;
- `OkOf<R>` / `ErrOf<R>` (and `AsyncOkOf` / `AsyncErrOf`) — a `Result`'s
  channels, derived from a function's return type.

```ts
import type { ErrMatcher, ErrOf } from "unthrown";

type LoadError = ErrOf<Awaited<ReturnType<typeof loadUser>>>; // NotFound | Timeout

const logLoadError = (matcher: ErrMatcher<LoadError>) =>
  matcher
    .with(P.tag("NotFound"), (e) => log.info("no such user", e.id))
    .with(P.tag("Timeout"), (e) => log.error("user lookup timed out", e.ms));

const first = loadUser("1").tapErrCases(logLoadError);
const second = loadUser("2").tapErrCases(logLoadError);
```

The helper stays exhaustive: add a case to `LoadError` and it stops compiling
until the new case is named.

## Where to go next

- The full per-channel table: [Combinator reference](../reference/combinators).
- Tracing, retries and other recipes: [Recipes](./recipes).
