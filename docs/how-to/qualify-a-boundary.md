# Qualify a boundary

> **How-to.** Bring untyped failures — a nullable value, a throwing function, a
> rejecting promise — into a `Result`. For _why_ every boundary forces a triage
> decision, see [Qualification](../explanation/qualification).

The edges of your program are where untyped failure enters. Pick the constructor
that matches the shape of the edge.

| The edge is…                                 | use                 | error channel              |
| -------------------------------------------- | ------------------- | -------------------------- |
| a nullable value (`T \| null`)               | `fromNullable`      | your modeled `Err`         |
| a throwing function, some throws modeled     | `fromThrowable`     | `Exclude<qualify, Defect>` |
| a throwing function, every throw a bug       | `fromSafeThrowable` | `never`                    |
| a rejecting promise, some rejections modeled | `fromPromise`       | `Exclude<qualify, Defect>` |
| a rejecting promise, every rejection a bug   | `fromSafePromise`   | `never`                    |

## `fromNullable` — absence as a modeled error

`null` / `undefined` become a modeled `Err`; anything else (including falsy `0`,
`""`, `false`) becomes `Ok`:

```ts
import { fromNullable } from "unthrown";

const cache = new Map([["a", 1]]);

fromNullable(cache.get("a"), () => "missing"); // Ok(1)
fromNullable(cache.get("z"), () => "missing"); // Err("missing")
```

This is the sanctioned bridge for nullable third-party APIs — and the reason
`unthrown` ships no `Option` type (see
[Design decisions](../explanation/design-decisions#no-option-type)).

## `fromThrowable` — wrap a throwing function

Pass a `qualify` function that triages the thrown cause into a modeled error `E`
or a defect. Its **second argument is a `defect` helper** the boundary injects —
call it to mark a cause as unmodeled (you never import it):

```ts
import { fromThrowable } from "unthrown";

const parse = fromThrowable(JSON.parse, (cause, defect) =>
  cause instanceof SyntaxError ? ("invalid_json" as const) : defect(cause),
);

parse("{ not json"); // Err("invalid_json")
parse("{}"); // Ok({})
```

A throw _inside_ `qualify` is itself treated as a defect.

## `fromPromise` — qualify every rejection

`fromPromise` wraps a promise (or a thunk returning one) as an `AsyncResult`.
Every rejection **must** be triaged:

```ts
import { fromPromise, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {} // our modeled domain failure
class NotFoundError extends Error {} // what `fetchUser` rejects with on a 404

const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);
// AsyncResult<User, NotFound>
```

The error channel is inferred as `Exclude<R, Defect>` — the `Defect` arm of
`qualify`'s return is **subtracted**, never inferred into `E`. A `qualify` that
returns _only_ `defect(cause)` gives `AsyncResult<T, never>`. `qualify` must be
synchronous (an `async` one won't compile).

## `fromSafePromise` / `fromSafeThrowable` — when any failure is a bug

When a failure would be a bug, not an anticipated outcome, skip `qualify`. The
error channel is `never`; any failure becomes a defect:

```ts
import { fromSafePromise, fromSafeThrowable } from "unthrown";

const config = fromSafePromise(loadTrustedConfig()); // AsyncResult<Config, never>

// The row came from our own schema; a decode throw is a bug, not an outcome.
const decode = fromSafeThrowable((row: Row) => userSchema.parse(row));
decode(row); // Result<User, never>
```

These are the explicit, named form of the `(cause, defect) => defect(cause)` you
would otherwise spell out — reach for them only when "everything here is a defect"
is a **decision**, and keep `fromThrowable` / `fromPromise` wherever some failures
are anticipated.

## Recipe: bridge a nullable lookup

A cache or `Map` that returns `T | undefined` becomes a `Result` with a modeled
`NotFound`:

```ts
import { fromNullable, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound")<{ id: string }> {}

const fromCache = (id: string) =>
  fromNullable(cache.get(id), () => new NotFound({ id }));

fromCache("u_1").map((p) => p.name); // Result<string, NotFound>
```

## Recipe: wrap a throwing parser

Third-party code that throws is bridged once, at the boundary. The `qualify`
function triages each throw into a modeled error or a defect:

```ts
import { fromThrowable, TaggedError } from "unthrown";

class InvalidProfile extends TaggedError("InvalidProfile")<{ field: string }> {}

const parseProfile = fromThrowable(
  (raw: string) => JSON.parse(raw) as Profile,
  (cause, defect) =>
    cause instanceof SyntaxError
      ? new InvalidProfile({ field: "json" })
      : defect(cause),
);

parseProfile('{"name":"Ada"}'); // Result<Profile, InvalidProfile>
```

## The payoff: one handler at the edge

Because every boundary is qualified and every in-pipeline throw becomes a defect,
the edge of your program needs no `try`/`catch` — just one exhaustive `match`:

```ts
const status = await user.match({
  ok: () => 200,
  errCases: (matcher) => matcher.with({ _tag: "NotFound" }, () => 404), // your modeled NotFound
  defect: (cause) => {
    logger.error(cause);
    return 500; // everything unexpected
  },
});
```

## Bridging a callback API

`fromPromise` needs a promise. When the API you are bridging is callback- or
event-based, `fromExecutor` is the boundary — the `new Promise` of this library,
except that the settler takes a `Result`:

```ts
import { fromExecutor, Err, Ok } from "unthrown";

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

Because the settler names the variant, there is no `qualify` to write and no
`unknown` can reach `E`. The injected `defect` helper is how an unmodeled
failure reaches the defect channel — and it is the _only_ way from inside an
asynchronous callback, since a `throw` there runs in its own turn, long after
the executor body returned.

Two things to know. `T` and `E` cannot be inferred from the body, so supply them
explicitly or let them flow from an annotated target. And an executor that never
settles yields an `AsyncResult` that never resolves — the one hazard
`fromPromise` does not have, and exactly `new Promise`'s.

## Where to go next

- Fold that handler cleanly: [Handle results at the edge](./handle-results-at-the-edge).
- Give your errors a matchable shape: [Model errors](./model-errors).
- The design rationale: [Qualification](../explanation/qualification).
