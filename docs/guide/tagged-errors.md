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

`_tag` is the discriminant `matchTags` dispatches on; `Error.name` is the
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

## `matchTags`

`matchTags` is a zero-dependency, **exhaustive** fold over a `Result` whose error
is a tagged union. The handler object provides `Ok`, `Defect`, and exactly one
branch per error tag — each receiving the narrowed variant:

```ts
import { matchTags } from "unthrown";

const status = matchTags(authorize(id), {
  Ok: () => 200,
  Defect: (cause) => {
    logger.error(cause);
    return 500;
  },
  NotFound: () => 404,
  Forbidden: (e) => {
    audit(e.user); // narrowed to Forbidden — `user` is available
    return 403;
  },
});
```

Miss a tag and it **won't compile** — exhaustiveness is enforced by the type,
with no `.exhaustive()` to forget. For an `AsyncResult`, `matchTags` resolves to
a `Promise<R>`.

`matchTags` covers the everyday case. When you need richer matching — guards,
nested patterns, wildcards — reach for [pattern matching](./pattern-matching)
with `ts-pattern`.

→ Continue to [Testing](./testing).
