# From try/catch

You don't need a design review to start using `unthrown` — wrap one function,
see the shape at one call site, and stop there until it's obviously worth
doing again.

## The smallest possible migration

Say you have a function that throws, called from a `try`/`catch`:

```ts
function parseConfig(text: string): Config {
  return JSON.parse(text) as Config; // throws SyntaxError on bad input
}

function loadConfig(text: string): Config {
  try {
    return parseConfig(text);
  } catch (cause) {
    console.error("invalid config", cause);
    return DEFAULT_CONFIG;
  }
}
```

Wrap the throwing function with `fromThrowable`. `qualify` decides which
causes are modeled and which are bugs — here, a `SyntaxError` is expected;
anything else is a defect:

```ts
import { fromThrowable } from "unthrown";

const parseConfig = fromThrowable(
  (text: string) => JSON.parse(text) as Config,
  (cause, defect) => (cause instanceof SyntaxError ? ("invalid_json" as const) : defect(cause)),
);
// (text: string) => Result<Config, "invalid_json">
```

The call site drops its `try`/`catch` for a combinator:

```ts
function loadConfig(text: string): Config {
  return parseConfig(text).unwrapOr(DEFAULT_CONFIG);
}
```

The same move works for a rejecting promise. Before:

```ts
async function getUser(id: string): Promise<User> {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new NotFoundError(id);
    return (await res.json()) as User;
  } catch (cause) {
    console.error(cause);
    throw cause; // rethrown — every caller still needs its own try/catch
  }
}
```

Wrap the promise with `fromPromise`:

```ts
import { fromPromise } from "unthrown";

function getUser(id: string) {
  return fromPromise(
    fetch(`/api/users/${id}`).then((res) => {
      if (!res.ok) throw new NotFoundError(id);
      return res.json() as Promise<User>;
    }),
    (cause, defect) => (cause instanceof NotFoundError ? ("not_found" as const) : defect(cause)),
  ); // AsyncResult<User, "not_found">
}
```

And the call site becomes an ordinary `Result`, `await`ed once:

```ts
const user = await getUser(id); // Result<User, "not_found">
user.match({
  ok: (u) => render(u),
  err: () => render404(),
  defect: (cause) => render500(cause),
});
```

## You don't have to convert the whole codebase

`Result` composes at whatever boundary you choose to draw it — there's no
requirement that every function up and down the call stack returns one.
`unwrap()` exists precisely so you can re-enter throw-land at the edges you
haven't converted yet, on purpose:

```ts
// Only the read is converted. Everything downstream still expects a plain
// Config, or a thrown error — and that's fine, unwrap() is the deliberate seam.
function loadConfig(text: string): Config {
  return parseConfig(text).unwrap(); // throws UnwrapError("invalid_json") on bad input
}
```

Convert the parts of the codebase where an untyped failure actually costs you
something — a boundary you keep getting wrong, a `catch` block that silently
swallows a bug. Leave the rest throwing until it earns the conversion. A
`Result` two layers deep in a call chain that's `unwrap()`'d immediately by
its only caller isn't buying you anything yet.

## `try`/`catch` idioms → combinators

Once you've wrapped a boundary, most of what you used to do inside a `catch`
block has a direct combinator equivalent:

| `try`/`catch` idiom       | unthrown combinator                             | Example                                               |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| catch-and-default         | `unwrapOr(fallback)`                            | `parseConfig(text).unwrapOr(DEFAULT_CONFIG)`          |
| catch-and-rethrow-wrapped | `mapErr(f)`                                     | `parseConfig(text).mapErr((e) => new ConfigError(e))` |
| catch-log-rethrow         | `tapErr(f)`                                     | `parseConfig(text).tapErr((e) => logger.warn(e))`     |
| `finally` cleanup         | run before eliminating, or in every `match` arm | see below                                             |

`catch-and-default`:

```ts
// before
try {
  return parseConfig(text);
} catch {
  return DEFAULT_CONFIG;
}
// after
parseConfig(text).unwrapOr(DEFAULT_CONFIG);
```

`catch-and-rethrow-wrapped`:

```ts
// before
try {
  return parseConfig(text);
} catch (cause) {
  throw new ConfigError(cause);
}
// after — ConfigError becomes a modeled Err, not a throw
parseConfig(text).mapErr((e) => new ConfigError(e));
```

`catch-log-rethrow`:

```ts
// before
try {
  return parseConfig(text);
} catch (cause) {
  logger.warn("bad config", cause);
  throw cause;
}
// after — logs, keeps the original error, still propagates as an Err
parseConfig(text).tapErr((e) => logger.warn("bad config", e));
```

`finally` has no combinator counterpart, because a `Result` pipeline has no
single point that always runs on the way out — `Ok`, `Err`, and `Defect` can
each take a different path through the chain. Do the cleanup either
**unconditionally before** the pipeline reaches a combinator that could
short-circuit, or **inside every arm** of the terminal `match`:

```ts
const connection = openConnection();
try {
  return parseConfig(text).map((c) => apply(connection, c));
} finally {
  connection.close();
}

// after — one exit point still closes the connection on every channel
const result = parseConfig(text).map((c) => apply(connection, c));
result.match({
  ok: (v) => {
    connection.close();
    return v;
  },
  err: (e) => {
    connection.close();
    return handleErr(e);
  },
  defect: (cause) => {
    connection.close();
    throw cause; // still a bug — let it bubble after cleanup
  },
});
```

→ Continue to [Core Concepts](./core-concepts).
