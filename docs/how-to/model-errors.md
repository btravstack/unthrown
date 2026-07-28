# Model errors with `TaggedError`

> **How-to.** Define matchable domain errors and fold a `Result` on them. Core
> `Result<T, E>` is generic in `E` — a plain string union works — but for real
> domains a **tagged error** is the recommended convention.

## Define a tagged error

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
`_tag` is authoritative (a payload can't overwrite it). Compose a union for a
precise error type:

```ts
type ApiError = NotFound | Forbidden;

function authorize(id: string): Result<User, ApiError> {
  // ...
}
```

## Set the message

`message` is **not** a payload field — it's the human string owned by `Error`, so
it's reserved (a payload `message` is a compile error, like `name` and `stack`).
Set it the standard way, **once per subclass**, with `override message`:

```ts
class TicketNotFound extends TaggedError("TicketNotFound")<{ ticketId: string }> {
  override message = "ticket not found";
}

new TicketNotFound({ ticketId: "t1" }).message; // "ticket not found"
```

The field may interpolate the payload via `this` — the base populates the payload
fields before the subclass field initialiser runs:

```ts
class InvalidState extends TaggedError("InvalidState")<{ got: string; want: string }> {
  override message = `expected ${this.want}, got ${this.got}`;
}
```

Keeping the message off the payload is deliberate: contextual detail lives in
**typed fields** — greppable, matchable, defined once per error type — rather than
baked into a per-call string. For a message that needs real branching, set
`this.message` in a constructor override.

## Namespace a tag without renaming the error

`_tag` is the discriminant the matcher dispatches on; `Error.name` is the label in
stack traces and logs. By default they're the same, but a second `options.name`
argument decouples them — so you can namespace a tag for collision-safety without
that prefix leaking into the display name:

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

## Fold a tagged union with `match`

To fold a `Result` whose error is a tagged union straight to a value, use
`match`. Its `ok` and `defect` handlers are plain callbacks; its **`errCases` handler
receives the matcher** — add one branch per tag with `P.tag(t)` and
**return the un-terminated builder** (`match` calls `.exhaustive()` for you):

```ts
import { P } from "unthrown";

const status = authorize(id).match({
  ok: () => 200,
  defect: (cause) => {
    logger.error(cause);
    return 500;
  },
  errCases: (matcher) =>
    matcher
      .with(P.tag("NotFound"), () => 404)
      .with(P.tag("Forbidden"), (e) => {
        audit(e.user); // narrowed to Forbidden — `user` is available
        return 403;
      }),
});
```

Miss a tag and it **won't compile** — exhaustiveness is enforced by the type, with
no `.exhaustive()` to forget. For an `AsyncResult`, `match` resolves to a
`Promise<R>`.

## Match on more than `_tag`

Because the matcher matches by structure, you can also branch on a `code`, on a
`P.*` matcher, or on **grouped patterns** — several cases sharing one strategy,
each still named:

```ts
// E = { code: "EXPIRED" } | { code: "REVOKED" } | { code: "THROTTLED"; retryAfter: number }
const status = authorize(id).match({
  ok: () => 200,
  defect: () => 500,
  errCases: (matcher) =>
    matcher
      // grouped: one handler, two named cases — not a wildcard
      .with({ code: "EXPIRED" }, { code: "REVOKED" }, () => 401)
      .with({ code: "THROTTLED" }, () => 429),
});
```

Grouping is the answer when several errors deserve the same response: the union
stays written out, so adding a fourth code still stops the build here. `P._`
exists for what enumeration cannot express — a helper generic in `E`, or an `E`
that is a single type rather than a union — and is covered in
[Exhaustive error matching](../explanation/exhaustive-error-matching#generic-boundary-helpers-the-catch-all-is-the-only-form-that-compiles).

Unlike the error _combinators_ (`mapErrCases`, `flatMapErrCases`, …), `match`'s `err`
handler receives **no `defect` helper** — `match` is total elimination to a value,
and a `Result` that already carries a defect is handled by the `defect:` case. To
keep matching _inside_ the pipeline (transforming or recovering the error rather
than eliminating it), reach for those combinators — see the
[combinator reference](../reference/combinators#the-error-channel).

## Where to go next

- Match inside a pipeline: [Combinator reference](../reference/combinators#the-error-channel).
- Why the matcher, not a callback:
  [Exhaustive error matching](../explanation/exhaustive-error-matching).
- Test tagged errors: [Test with Vitest](./test-with-vitest).
