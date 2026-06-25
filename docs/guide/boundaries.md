# Boundaries & Qualification

The edges of your program — a throwing function, a rejecting promise, a nullable
third-party API — are where untyped failure enters. `unthrown` makes every such
boundary force a decision: is this failure a **modeled error** or a **defect**?

## `fromNullable` — absence is a modeled error

The sanctioned bridge for nullable values. `null` / `undefined` become a modeled
`Err`; anything else (including falsy `0`, `""`, `false`) becomes `Ok`:

```ts
import { fromNullable } from "unthrown";

fromNullable(map.get(key), () => "missing").unwrap();
```

This is why `unthrown` ships no `Option` type — absence is expressed with the
type system you already trust (`T | undefined`, `T | null`) or with
`Result<T, NotFound>` via `fromNullable`.

## `fromThrowable` — wrap a throwing function

`fromThrowable` wraps a synchronous function that might throw. You **must** pass
a `qualify` function that triages the thrown cause into a modeled error `E` or a
`defect`:

```ts
import { fromThrowable, defect } from "unthrown";

const parse = fromThrowable(JSON.parse, (cause) =>
  cause instanceof SyntaxError ? ("invalid_json" as const) : defect(cause),
);

parse("{ not json"); // Err("invalid_json")
parse("{}"); // Ok({})
```

A throw _inside_ `qualify` is itself treated as a defect.

## `fromPromise` — qualify every rejection

`fromPromise` wraps a promise (or a thunk returning one) as an
[`AsyncResult`](./async-results). Every rejection **must** be triaged:

```ts
import { fromPromise, defect } from "unthrown";

const user = fromPromise(fetchUser(id), (cause) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);
```

The boxed/neverthrow "original sin" is `fromPromise(p): AsyncResult<T, unknown>`
— a boundary that leaks `unknown` into your error type. `unthrown` closes it:
`qualify` is mandatory, so **there is no code path that yields `unknown` in
`E`**.

## `fromSafePromise` — when any rejection is a bug

If a promise should never fail in a _modeled_ way — its rejection would be a bug,
not an anticipated outcome — use `fromSafePromise`. Its error channel is `never`;
any rejection becomes a defect:

```ts
import { fromSafePromise } from "unthrown";

const config = fromSafePromise(loadTrustedConfig());
```

## The payoff: one handler at the edge

Because every boundary is qualified and every in-pipeline throw becomes a defect,
the edge of your program needs no `try`/`catch` — just one exhaustive `match`:

```ts
const status = await user.match({
  ok: () => 200,
  err: () => 404, // your modeled NotFound
  defect: (cause) => {
    logger.error(cause);
    return 500; // everything unexpected
  },
});
```

→ Continue to [Async Results](./async-results).
