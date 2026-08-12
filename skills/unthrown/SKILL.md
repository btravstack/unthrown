---
name: unthrown
description: Write and review TypeScript that uses the unthrown library — errors as values via a Result type with a separate defect channel, exhaustive error matching, and qualified async boundaries. Use when the project depends on unthrown or any @unthrown/* package, when converting throw/try-catch code to errors as values, when working with Result/AsyncResult values, TaggedError, fromPromise/fromThrowable, mapErrCases-style combinators, or when testing with @unthrown/vitest or linting with @unthrown/oxlint.
---

# unthrown

Errors as values for TypeScript, with a separate **defect channel** for the
unexpected. Ordinary errors are _unthrown_ — returned as values;
only a true defect ever throws (at extraction). `getOrThrow` is the one
deliberate escape that throws a _modeled_ error — a test-and-script tool, not a
production one. Zero runtime dependencies; the
exhaustive matcher (`match` / `P`) is built in.

Full docs: https://btravstack.github.io/unthrown/

## Mental model (get this right first)

`Result<T, E>` is a **three-variant discriminated union**:

- `{ tag: "Ok", value: T }` — success.
- `{ tag: "Err", error: E }` — an **anticipated, modeled** failure. `E` lists
  only failures the caller is expected to handle.
- `{ tag: "Defect", cause: unknown }` — an **unmodeled** failure (a bug, an
  unqualified throw). A defect **never appears in `E`** — it travels in its own
  channel, flows through almost every combinator untouched, and is handled only
  at the edge (`match`'s `defect` arm) or by `recoverDefect`.

Three rules that follow:

1. **Never type `E` as `unknown`, `any`, `Error`, or a primitive keyword.** `E`
   is a union of concrete, nameable cases (string literals, `TaggedError`
   classes, `code`-discriminated objects).
2. **There is no `Option` type.** Use `T | undefined`, `Result<T, NotFound>`,
   or `fromNullable(value, () => err)` at nullable boundaries.
3. **A thrown callback never escapes a pipeline** — every combinator catches it
   and converts it to a `Defect`. So there is **no `try/catch` around Result
   pipelines, ever**; the `defect` arm of the final `match` is the catch.

## Construct and chain

```ts
import { Ok, Err, type Result } from "unthrown";

type AgeError = "not_a_number" | "negative";

function parseAge(input: string): Result<number, AgeError> {
  const n = Number(input);
  if (Number.isNaN(n)) return Err("not_a_number");
  if (n < 0) return Err("negative");
  return Ok(n);
}

const adult = parseAge(input)
  .map((n) => n + 1) // callback returns a value
  .flatMap((n) => (n >= 18 ? Ok(n) : Err("underage"))); // callback returns a Result
// Result<number, AgeError | "underage"> — flatMap unions the error channels
```

`Ok(v)` / `Err(e)` are plain functions (not classes — never `new`). `Ok()` with
no argument makes a `Result<void, never>`. There is deliberately **no `Defect`
constructor** — defects arise from throws and boundary triage only. Narrow with
`r.isOk()` / `r.isErr()` / `r.isDefect()` (type predicates) or a `switch` on
`r.tag`.

## Boundaries: every throw/rejection is triaged

Throwing or rejecting code enters through a boundary that forces a **triage
decision** via `qualify(cause, defect) => E | Defect` — decide per cause whether
it is a modeled error or a defect. `qualify` must be **synchronous** (an `async`
qualify does not compile). There is no path that puts `unknown` in `E`.

```ts
import {
  fromPromise,
  fromThrowable,
  fromSafeThrowable,
  fromSafePromise,
  fromExecutor,
  fromNullable,
} from "unthrown";

// Promise → AsyncResult; each rejection cause triaged
const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
);

// Throwing fn → wrapped fn returning Result (wraps the FUNCTION, not a call)
const parse = fromThrowable(
  (text: string) => JSON.parse(text) as unknown,
  (cause, defect) =>
    cause instanceof SyntaxError ? ("invalid_json" as const) : defect(cause),
);
parse("nope"); // => Err("invalid_json")

// "every throw here is a bug" → E = never, no qualify
const decode = fromSafeThrowable((row: Row) => schema.parse(row));
const cfg = fromSafePromise(loadConfig()); // async twin

// callback/event APIs: the settler takes a Result, so there is no qualify
const ready = fromExecutor<Server, PortInUse>((settle, defect) => {
  server.once("error", (c) => settle(defect(c)));
  server.listen(port, () => settle(Ok(server)));
});

// nullable APIs (the Option replacement)
fromNullable(map.get(key), () => "absent" as const); // Result<V, "absent">
```

`fromThrowable` / `fromSafeThrowable` wrap a **synchronous** function on both
sides: `qualify` is sync (an `async` one is a compile error), and so is `fn`. An
`async` `fn` rejects after the boundary has returned, so its rejection could
never be triaged — it becomes a `Defect` rather than an `Ok` wrapping a live
promise. Use `fromPromise` / `fromSafePromise` for async work.

The `Defect` arm of `qualify`'s return is **subtracted** from `E` — a
defect-only qualify yields `E = never`. The `defect` helper is **injected** as
the second argument; never import it.

## The error channel: matched exhaustively, never blanket-handled

The error combinators carry a `*Cases` suffix and take a **matcher callback**,
not a plain `(e) => …` callback (there is no `mapErr`). The callback receives a
match builder plus the injected `defect` helper and **returns the un-terminated
builder** — the combinator calls `.exhaustive()` itself. A missed case **does
not compile**; enriching `E` breaks every consuming site until each is handled.

```ts
import { P } from "unthrown";

result.mapErrCases(
  (matcher, defect) =>
    matcher
      .with(P.tag("RecordNotFound"), () => new ReadingNotFound(id)) // transform a case
      .with(P.tag("Unavailable"), (e) => defect(e.cause)), // deliberately defect a case
);
```

- The five: `mapErrCases` (transform `E`), `flatMapErrCases` (fallback
  `Result`), `recoverErrCases` (error → success value, `E` becomes `never`),
  `tapErrCases` / `flatTapErrCases` (observe; the error flows through).
- Match on **any structure**: `P.tag("X")` for `_tag`, plain literals
  (`.with("negative", …)`), object patterns (`.with({ code: "NOT_FOUND" }, …)`),
  `P.instanceOf`, `P.when`. Cases sharing a handler are **grouped**
  (`.with(P.tag("A"), P.tag("B"), handler)`), never wildcarded.
- **`P._` is an escape hatch, not the default.** It absorbs every future case —
  the exact hole the matcher closes. Legitimate only in a helper generic in `E`
  (nothing enumerable) or when `E` is a single non-union type; such sites carry
  an `oxlint-disable … unthrown/no-catch-all-pattern` comment with a reason.
- Never call `.exhaustive()` / `.otherwise()` yourself in these callbacks — you
  return the builder. `matcher.returnType<R>()` (called first) pins the output
  type when a signature decides it.
- A branch that returns `defect(cause)` or throws contributes nothing to the
  outgoing `E` (the `Defect` arm is subtracted).

## Eliminate at the edge

Fold all three channels once, at the edge — an HTTP adapter needs no
surrounding `try/catch`:

```ts
const message = result.match({
  ok: (age) => `age is ${age}`,
  errCases: (matcher) =>
    matcher
      .with("negative", () => "must be positive")
      .with("not_a_number", () => "not a number"),
  defect: (cause) => {
    logger.error(cause);
    return "something went wrong";
  },
});
```

Extractors (when a fold is overkill): `get()` compiles **only** on
`Result<T, never>`; `getErr()` only on `Result<never, E>` — empty the opposite
channel first. `getOr(fallback)` / `getOrElse(f)` / `getOrNull()` /
`getOrUndefined()` recover an `Err` to a fallback. **All of them panic
(rethrow the cause) on a Defect** — a defect is a bug, not an absent value.
`getOrThrow()` throws the modeled error as-is; it compiles only when `E` is
non-empty. Use it in **tests**, not production — fold with `recoverErrCases` +
`get` there (the opt-in `no-get-or-throw` rule enforces it). The
removed v4 names `unwrap*` / `orElse` / `recover` / `matchTags` do not exist.

## AsyncResult: sync callbacks, boundaries for async work

`AsyncResult<T, E>` is the awaitable twin — same combinators. Its **internal
promise never rejects**: `await asyncResult` always yields a `Result`. Three
deltas:

1. **Combinator callbacks are synchronous.** A raw `Promise` return does not
   compile (it would bypass qualification). Async work re-enters through a
   boundary and composes with `flatMap`:
   ```ts
   const status = await findUser(id) // Result<User, NotFound>
     .toAsync() // lift sync → AsyncResult
     .flatMap((u) => fromPromise(loadOrders(u.id), (c, d) => d(c)))
     .map((orders) => orders.length) // sync callback, stays async
     .match({
       ok: (n) => n,
       errCases: (m) => m.with(P.tag("NotFound"), () => 0),
       defect: () => -1,
     });
   ```
2. The `Result`-returning combinators (`flatMap`, `flatTap`, `bind`,
   `flatMapErrCases`, `flatTapErrCases`, `recoverDefect`) accept a callback
   returning a `Result` **or** an `AsyncResult` — mix sync and async steps.
3. Eliminators return a `Promise` — `await result.match({…})`, or `await` the
   `AsyncResult` first and match synchronously.

Pre-lifted constructors for the sync branch of an async function: `OkAsync(v)`
/ `ErrAsync(e)` (not `Ok(v).toAsync()`).

## TaggedError: the error convention

```ts
import { TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {} // empty payload → new NotFound()
class HttpError extends TaggedError("HttpError")<{ status: number }> {
  override message = `http ${this.status}`; // message: a class field, NEVER a payload field
}
new HttpError({ status: 500 }); // .status, ._tag, instanceof Error
```

The payload carries **only structured domain fields** — `name`, `message`, and
`stack` are reserved (`?: never`); `cause` is allowed (it is `Error.cause`).
Match with `P.tag("HttpError")`. `options.name` sets the display name when the
tag is namespaced (`TaggedError("pkg/NotFound", { name: "NotFound" })`).

## Mistakes agents make (habits from neverthrow/Effect/fp-ts)

| Habit                                                                          | In unthrown                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mapErr((e) => …)`, `orElse`, `andThen`                                        | Don't exist. `mapErrCases`/`flatMapErrCases` with the matcher; `flatMap`.                                                                                                                       |
| `r.unwrap()` / `unwrapOr(x)`                                                   | Removed. `get()` (needs `E = never`) / `getOr(x)`.                                                                                                                                              |
| `Option` / `Some` / `None`                                                     | No Option. `T \| undefined`, `Result<T, NotFound>`, `fromNullable`.                                                                                                                             |
| `try { pipeline } catch`                                                       | Never needed — throws become Defects; `match`'s `defect` arm is the catch.                                                                                                                      |
| `Result<T, unknown>` / `Result<T, Error>`                                      | Banned (lint: `no-ambiguous-error-type`). Model concrete cases.                                                                                                                                 |
| `async (v) => …` inside `map`/`flatMap`/matcher branches                       | Compile error by design. Use `fromPromise` + `flatMap`.                                                                                                                                         |
| `.with(P._, …)` as a default fallback                                          | Enumerate or group cases; `P._` only for generic-`E` helpers, with a lint-disable + reason.                                                                                                     |
| Constructing a Defect (`Defect(x)`)                                            | No constructor. `throw` (the net catches it) or the injected `defect` helper at triage sites.                                                                                                   |
| `message` in a TaggedError payload                                             | Reserved. `override message = …` on the class; context goes in typed fields.                                                                                                                    |
| `tap((v) => auditLog.record(v))` where the effect returns a Result/AsyncResult | Effect outcome silently dropped/floats. Use `flatTap` on the matching surface.                                                                                                                  |
| Serializing a Result (JSON, structuredClone)                                   | Unsupported by design. `match` at the boundary; re-enter via constructors on the other side.                                                                                                    |
| `throw` in app code for known failures                                         | Return `Err(...)`. `throw` is for genuine defects only.                                                                                                                                         |
| `getOrThrow()` in production code                                              | Throws the modeled error, ending errors-as-values at the last step. Fold with `recoverErrCases` + `get`. Fine in tests (the opt-in `no-get-or-throw` rule exempts them via oxlint `overrides`). |

## References

- **[references/api.md](references/api.md)** — the full combinator table
  (by-intent + per-channel behavior), matcher patterns (`P.*`), do-notation
  (`Do`/`bind`/`let`), aggregates (`all`/`allFromDict` + async), guards,
  facade namespaces (`Result.*`/`AsyncResult.*`), and utility types. Read when
  choosing a combinator or writing anything beyond the basics above.
- **[references/ecosystem.md](references/ecosystem.md)** — the `@unthrown/*`
  satellite packages: vitest matchers (`toBeOk`/`toBeErrTagged`/…), the seven
  oxlint rules, Prisma extension (`try*` delegates), Drizzle database
  (replaces the stock one — no `try*`), oRPC bridge,
  standard-schema validation, and the effect/neverthrow/boxed interop bridges.
  Read when tests, lint config, or one of those integrations is involved.
