# Recipes: retry, timeout, concurrency

> **How-to.** Short, copyable answers to "how do I…" questions the core
> surface answers without a dedicated combinator: retrying, timing out,
> limiting concurrency, traversing a list, and handing a `Result` to a
> framework that expects throws or promises.

`unthrown` has no `.retry()`, `.timeout()` or scheduler, on purpose: the core
stays small enough to be finished, and each of these is a few lines over the
public surface. The recipes below share this setup:

```ts
import { setTimeout as sleep } from "node:timers/promises";
import { fromSafePromise, TaggedError, type AsyncResult } from "unthrown";

class RateLimited extends TaggedError("RateLimited") {}
class NotFound extends TaggedError("NotFound")<{ id: string }> {}

type User = { id: string; name: string };
declare function loadUser(
  id: string,
): AsyncResult<User, RateLimited | NotFound>;

// A delay that cannot fail: a rejected timer would be a bug, hence a Defect.
const delay = (ms: number) => fromSafePromise(sleep(ms));
```

## Retry with backoff

Every retry helper takes a **thunk** (`() => AsyncResult`), not an
`AsyncResult`: an `AsyncResult` starts its work the moment it is built, so the
only way to run the work again is to build it again.

**Retry a modeled `Err`** with `flatMapErrCases`. Name the cases: the
retryable one loops, the others pass through unchanged.

```ts
import { ErrAsync, P } from "unthrown";

const retryRateLimited = <T>(
  run: () => AsyncResult<T, RateLimited | NotFound>,
  attempts = 3,
  backoffMs = 100,
): AsyncResult<T, RateLimited | NotFound> =>
  run().flatMapErrCases((matcher) =>
    matcher
      .with(P.tag("RateLimited"), (e) =>
        attempts <= 1
          ? ErrAsync(e)
          : delay(backoffMs).flatMap(() =>
              retryRateLimited(run, attempts - 1, backoffMs * 2),
            ),
      )
      .with(P.tag("NotFound"), (e) => ErrAsync(e)),
  );

const user = retryRateLimited(() => loadUser("42"));
```

**Retry a `Defect`** — a dropped connection, a deadlock — with
`recoverDefect`. A cause that is not transient is rethrown, and the pipeline's
own throw-to-defect net keeps it a defect with its original value:

```ts
const retryTransient = <T, E>(
  run: () => AsyncResult<T, E>,
  isTransient: (cause: unknown) => boolean,
  attempts = 3,
  backoffMs = 100,
): AsyncResult<T, E> =>
  run().recoverDefect((cause) => {
    if (attempts <= 1 || !isTransient(cause)) throw cause;
    return delay(backoffMs).flatMap(() =>
      retryTransient(run, isTransient, attempts - 1, backoffMs * 2),
    );
  });
```

The [Drizzle guide](./use-with-drizzle) applies the defect form to
serialization failures and deadlocks.

## Time out or cancel

There is no `.timeout()` because it could not keep its promise: an
`AsyncResult` is already running when you hold it, and nothing in the
`AsyncResult` can stop the work underneath. Racing it against a timer would
only stop _waiting_ — the request would still complete, and its side effects
still land. Cancellation has to reach the work itself, so it goes in **at the
boundary**, through the API's own `AbortSignal`, and the resulting rejection is
triaged like any other:

```ts
import { fromPromise } from "unthrown";

class TimedOut extends TaggedError("TimedOut")<{ ms: number }> {}
class Cancelled extends TaggedError("Cancelled") {}

const fetchJson = (url: string, ms: number, signal?: AbortSignal) =>
  fromPromise(
    fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(ms)])
        : AbortSignal.timeout(ms),
    }).then((res) => res.json() as Promise<unknown>),
    (cause, defect) => {
      if (cause instanceof DOMException && cause.name === "TimeoutError")
        return new TimedOut({ ms });
      if (cause instanceof DOMException && cause.name === "AbortError")
        return new Cancelled();
      return defect(cause);
    },
  );
// AsyncResult<unknown, TimedOut | Cancelled>
```

`AbortSignal.timeout` rejects with a `TimeoutError`; a caller's
`controller.abort()` rejects with an `AbortError`. Whether either is modeled or
a defect is your triage decision, as at any boundary.

## Limit concurrency

`allAsync` runs everything at once. To cap it, run each thunk through a limiter
such as [`p-limit`](https://github.com/sindresorhus/p-limit), which deals in
promises: lift its promise back with `fromSafePromise` and flatten the `Result`
it carries (next recipe):

```ts
import pLimit from "p-limit";
import { allAsync } from "unthrown";

const limit = pLimit(4);

const limited = <T, E>(run: () => AsyncResult<T, E>): AsyncResult<T, E> =>
  fromSafePromise(limit(async () => await run())).flatMap((r) => r);

const users = allAsync(
  ["1", "2", "3"].map((id) => limited(() => loadUser(id))),
);
// AsyncResult<User[], RateLimited | NotFound> — at most 4 in flight
```

The `async` arrow never rejects: awaiting an `AsyncResult` always yields a
`Result`.

## Turn a `Promise<Result>` into an `AsyncResult`

A library that already hands you `Promise<Result<T, E>>` needs no `qualify`
for the `Result` inside — only for a rejection of the promise itself:

```ts
import type { Result } from "unthrown";

declare const pending: Promise<Result<User, NotFound>>;

const lifted = fromSafePromise(pending).flatMap((r) => r);
// AsyncResult<User, NotFound> — a rejection becomes a Defect
```

If the promise can reject with something you model, use `fromPromise(pending,
qualify)` in place of `fromSafePromise`.

## Traverse a list

**Concurrently** — map to `AsyncResult`s and gather them; all start at once:

```ts
const everyone = allAsync(["1", "2"].map((id) => loadUser(id)));
// AsyncResult<User[], RateLimited | NotFound>
```

**Sequentially** — each step starts only after the previous one succeeded,
because `loadUser` is called _inside_ `flatMap`:

```ts
import { OkAsync } from "unthrown";

const traverse = <A, T, E>(
  xs: readonly A[],
  f: (x: A) => AsyncResult<T, E>,
): AsyncResult<T[], E> =>
  xs.reduce<AsyncResult<T[], E>>(
    (acc, x) => acc.flatMap((done) => f(x).map((t) => [...done, t])),
    OkAsync([]),
  );

const inOrder = traverse(["1", "2"], loadUser);
```

Both stop at the first `Err`. To collect every `Err` instead, use
[`validateAllAsync`](./combine-parallel-results).

## Run inside a Temporal activity

A [Temporal](https://temporal.io) activity reports failure by throwing, and
Temporal retries it by default. Fold the `Result` at that edge: a modeled
`Err` is a business outcome that retrying will not change, so throw it as
**non-retryable**; a `Defect` is rethrown as-is so the activity's retry policy
applies:

```ts
import { ApplicationFailure } from "@temporalio/common";

class CardDeclined extends TaggedError("CardDeclined")<{ reason: string }> {}
type Receipt = { id: string };
declare function charge(orderId: string): AsyncResult<Receipt, CardDeclined>;

export async function chargeActivity(orderId: string): Promise<Receipt> {
  return (await charge(orderId)).match({
    ok: (receipt) => receipt,
    errCases: (matcher) =>
      matcher.with(P.tag("CardDeclined"), (e) => {
        throw ApplicationFailure.nonRetryable(e.reason, e._tag);
      }),
    defect: (cause) => {
      throw cause;
    },
  });
}
```

A sequence of activities that must be undone on failure is a saga —
[`@unthrown/saga`](../api/saga/) is pure control flow, so it also replays
deterministically inside a workflow.

## Use with TanStack Query

A query function signals failure by rejecting; TanStack Query then retries it
and exposes it as `error`. Decide per channel what that should mean:

```ts
import { useQuery } from "@tanstack/react-query";

const useUser = (id: string) =>
  useQuery({
    queryKey: ["user", id],
    queryFn: async () =>
      (await loadUser(id)).match({
        ok: (user) => ({ found: true as const, user }),
        errCases: (matcher) =>
          matcher
            .with(P.tag("NotFound"), () => ({ found: false as const }))
            .with(P.tag("RateLimited"), (e) => {
              throw e; // transient: let TanStack Query retry it
            }),
        defect: (cause) => {
          throw cause; // a bug: surfaces as the query's error
        },
      }),
  });
```

An outcome the UI renders (`NotFound`) becomes **data**; what retrying can fix,
or what is a bug, becomes the query's **error**. Returning the `Result` itself
as data also works, but it opts out of retries and cannot be persisted or
dehydrated for SSR — a `Result` does not survive serialization.

In a test or a throwaway script, `queryFn: async () => (await loadUser(id)).getOrThrow()`
is the short form; see
[Handle results at the edge](./handle-results-at-the-edge#extract-instead-of-matching)
for why it stays out of production code.

## Trace or log failures

Observers run a side effect on a failure without consuming it. Mark a span
failed on either channel with `tapFailure`:

```ts
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { OkAsync, type AsyncResult } from "unthrown";

const tracer = trace.getTracer("users");

const traced = <T, E>(
  name: string,
  run: () => AsyncResult<T, E>,
): AsyncResult<T, E> => {
  const span = tracer.startSpan(name);
  // Called inside `flatMap`, so a synchronous throw from `run` is a Defect the
  // observers below still see — called bare, it would skip them and leak the span.
  return OkAsync()
    .flatMap(run)
    .tapFailure((failure) => {
      span.setStatus({ code: SpanStatusCode.ERROR, message: failure.tag });
      if (failure.tag === "Defect") span.recordException(String(failure.cause));
      span.end();
    })
    .tap(() => span.end());
};
```

The observers are covered in [Observe and log failures](./observe-failures).
