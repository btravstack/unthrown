# Migrate from try/catch

> **How-to.** Convert throwing code to `Result` incrementally — one function at a
> time, no big-bang rewrite.

You don't need a design review to start. Wrap one function, see the shape at one
call site, and stop there until it's obviously worth doing again.

## Wrap a throwing function

Say you have a function that throws, called from a `try`/`catch`:

```ts
function loadConfig(text: string): Config {
  try {
    return JSON.parse(text) as Config; // throws SyntaxError on bad input
  } catch (cause) {
    console.error("invalid config", cause);
    return DEFAULT_CONFIG;
  }
}
```

Wrap the throwing function with `fromThrowable`. `qualify` decides which causes are
modeled and which are bugs — here a `SyntaxError` is expected, anything else is a
defect:

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
  return parseConfig(text).getOr(DEFAULT_CONFIG);
}
```

## Wrap a rejecting promise

Same move for a rejecting promise — wrap it with `fromPromise`:

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

The call site becomes an ordinary `Result`, `await`ed once:

```ts
const user = await getUser(id); // Result<User, "not_found">
user.match({
  ok: (u) => render(u),
  errCases: (matcher) => matcher.with("not_found", () => render404()), // the one modeled error
  defect: (cause) => render500(cause),
});
```

(New to boundaries? [Qualify a boundary](./qualify-a-boundary) covers the `from*`
family in full.)

## You don't have to convert the whole codebase

`Result` composes at whatever boundary you choose to draw it — no requirement that
every function up and down the stack returns one. `getOrThrow()` exists precisely so
you can re-enter throw-land at the edges you haven't converted yet, on purpose — it
throws the modeled error **as-is** (unlike `get()`, which only compiles once the
error channel is `never`):

```ts
// Only the read is converted. Everything downstream still expects a plain
// Config, or a thrown error — getOrThrow() is the deliberate seam.
function loadConfig(text: string): Config {
  return parseConfig(text).getOrThrow(); // throws "invalid_json" on bad input
}
```

Convert the parts where an untyped failure actually costs you something — a boundary
you keep getting wrong, a `catch` block that silently swallows a bug. Leave the rest
throwing until it earns the conversion.

## `try`/`catch` idioms → combinators

A `catch` block sees one opaque value; a matcher sees the **cases**. Each row
below names them — `parseConfig`'s channel is the single `"invalid_json"` case,
so that is what the arms spell out:

| `try`/`catch` idiom       | unthrown combinator                             | Example                                                                                   |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| catch-and-default         | `getOr(fallback)`                               | `parseConfig(text).getOr(DEFAULT_CONFIG)`                                                 |
| catch-and-rethrow-wrapped | `mapErrCases((matcher) => …)`                   | `parseConfig(text).mapErrCases((m) => m.with("invalid_json", (e) => new ConfigError(e)))` |
| catch-log-rethrow         | `tapErrCases((matcher) => …)`                   | `parseConfig(text).tapErrCases((m) => m.with("invalid_json", (e) => logger.warn(e)))`     |
| `finally` cleanup         | run before eliminating, or in every `match` arm | see below                                                                                 |

`catch-and-rethrow-wrapped` — turn a caught error into a modeled `Err`:

```ts
// before: throw new ConfigError(cause)
// after:  ConfigError becomes a modeled Err, not a throw
parseConfig(text).mapErrCases((matcher) => matcher.with("invalid_json", (e) => new ConfigError(e)));
```

`catch-log-rethrow` — log, keep the original error, still propagate as an `Err`:

```ts
parseConfig(text).tapErrCases((matcher) =>
  matcher.with("invalid_json", (e) => logger.warn("bad config", e)),
);
```

Add a second case to `qualify` later — say a `"missing_field"` — and every one of
these arms stops compiling until you say what it does. That is the trade a
`catch (cause)` block can never make.

`finally` has no combinator counterpart — a `Result` pipeline has no single point
that always runs on the way out, since `Ok`, `Err`, and `Defect` can each take a
different path. Do the cleanup either **unconditionally before** a combinator that
could short-circuit, or **inside every arm** of the terminal `match`:

```ts
const result = parseConfig(text).map((c) => apply(connection, c));
result.match({
  ok: (v) => {
    connection.close();
    return v;
  },
  errCases: (matcher) =>
    matcher.with("invalid_json", (e) => {
      connection.close();
      return handleErr(e);
    }),
  defect: (cause) => {
    connection.close();
    throw cause; // still a bug — let it bubble after cleanup
  },
});
```

## Where to go next

- The boundary constructors in full: [Qualify a boundary](./qualify-a-boundary).
- Fold the converted result: [Handle results at the edge](./handle-results-at-the-edge).
- Coming from neverthrow instead: [Migrate from neverthrow](./migrate-from-neverthrow).
