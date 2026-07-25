# Tagged Errors

`unthrown` keeps the core `Result<T, E>` generic in `E` — a primitive string or
union works fine. But for real domains, the recommended convention is a
**tagged error**: a class extending `Error` with a `_tag` discriminant, in the
style of Effect's `Data.TaggedError`.

## `TaggedError`

`TaggedError(tag)` builds a base class you extend. Supply a payload with an
instantiation expression; omit it for a payload-less error:

```ts
import { TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {}
class Forbidden extends TaggedError("Forbidden")<{ user: string }> {}

new NotFound()._tag; // "NotFound"
new Forbidden({ user: "bob" }).user; // "bob"
```

The class extends `Error` (so `instanceof Error` holds and stacks work) and the
`_tag` is authoritative (a payload can't overwrite it).

### Defining the message

`message` is **not** a payload field — it's the human string owned by `Error`,
not structured data, so it's reserved (a payload `message` is a compile error,
like `name`). Set it the standard way, **once per subclass**, with `override
message`:

```ts
class TicketNotFound extends TaggedError("TicketNotFound")<{ ticketId: string }> {
  override message = "ticket not found";
}

new TicketNotFound({ ticketId: "t1" }).message; // "ticket not found"
```

The field may interpolate the payload via `this` — the base populates the
payload fields before the subclass field initialiser runs:

```ts
class InvalidState extends TaggedError("InvalidState")<{ got: string; want: string }> {
  override message = `expected ${this.want}, got ${this.got}`;
}
```

Keeping the message off the payload is deliberate: the contextual detail that
used to get baked into a per-call string (`` `no manager for ${id}` ``) lives in
**typed fields** instead — greppable, matchable, and defined once per error type
rather than drifting across call sites. For a message that needs real branching,
set `this.message` in a constructor override.

### Namespacing the tag without renaming the error

`_tag` is the discriminant `match`'s error matcher (and `tag(t)`) dispatches on;
`Error.name` is the
human-facing label in stack traces and logs. By default they're the same, but a
second `options.name` argument decouples them — so you can namespace a tag for
collision-safety without that prefix leaking into the display name:

```ts
class RetryableError extends TaggedError("@my-lib/RetryableError", {
  name: "RetryableError",
}) {
  override message = "boom";
}

const e = new RetryableError();
e._tag; // "@my-lib/RetryableError" — namespaced discriminant
e.name; // "RetryableError"          — clean stack-trace label
```

A tagged union of these makes a precise error type:

```ts
type ApiError = NotFound | Forbidden;

function authorize(id: string): Result<User, ApiError> {
  // ...
}
```

## Matching a tagged error union with `match`

To fold a `Result` whose error is a tagged union straight to a value, use
`match`. Its `ok` and `defect` handlers are plain callbacks; its **`err` handler
receives the ts-pattern error matcher** — the same exhaustive matcher the error
combinators use — so you add one branch per tag with `tag(t)` and **return the
un-terminated builder** (`match` calls `.exhaustive()` for you):

```ts
import { P, tag } from "unthrown";

const status = authorize(id).match({
  ok: () => 200,
  defect: (cause) => {
    logger.error(cause);
    return 500;
  },
  err: (matcher) =>
    matcher
      .with(tag("NotFound"), () => 404)
      .with(tag("Forbidden"), (e) => {
        audit(e.user); // narrowed to Forbidden — `user` is available
        return 403;
      }),
});
```

Miss a tag and it **won't compile** — exhaustiveness is enforced by the type,
with no `.exhaustive()` to forget. For an `AsyncResult`, `match` resolves to a
`Promise<R>`.

The matcher isn't limited to `_tag`. Because ts-pattern matches by structure,
you can also branch on a `code`, on a guard, or on grouped patterns, and
`.with(P._, (e) => …)` is the deliberate catch-all when you want to handle every
error the same way:

```ts
const status = authorize(id).match({
  ok: () => 200,
  defect: () => 500,
  err: (matcher) => matcher.with(P._, () => 403), // every error → 403
});
```

Unlike the error _combinators_ (`mapErr`, `flatMapErr`, …), `match`'s `err`
handler receives **no `defect` helper** — `match` is total elimination to a
value, and a `Result` that already carries a defect is handled by the `defect:`
case. To keep matching _inside_ the pipeline (transforming or recovering the
error rather than eliminating it), reach for those combinators instead — see
[Choosing a combinator](./choosing-a-combinator#triaging-the-error-channel).

→ Continue to [Testing](./testing).
