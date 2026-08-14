# Model errors

> **How-to.** Define matchable domain errors and fold a `Result` on them. Core
> `Result<T, E>` is generic in `E` and **unconstrained** — the only thing the
> matcher needs is an `E` TypeScript can discriminate. `TaggedError` is
> unthrown's convenience for getting one, **not** a requirement: if you already
> have an error convention, [keep it](#use-the-errors-you-already-have).

## Define a tagged error

`TaggedError` is the shape unthrown proposes when you have no convention yet: a
discriminant, a typed payload, and `Error` semantics, without writing the class
boilerplate three times.

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
class TicketNotFound extends TaggedError("TicketNotFound")<{
  ticketId: string;
}> {
  override message = "ticket not found";
}

new TicketNotFound({ ticketId: "t1" }).message; // "ticket not found"
```

The field may interpolate the payload via `this` — the base populates the payload
fields before the subclass field initialiser runs:

```ts
class InvalidState extends TaggedError("InvalidState")<{
  got: string;
  want: string;
}> {
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

Unlike the error _combinators_ (`mapErrCases`, `flatMapErrCases`, …), `match`'s `errCases`
handler receives **no `defect` helper** — `match` is total elimination to a value,
and a `Result` that already carries a defect is handled by the `defect:` case. To
keep matching _inside_ the pipeline (transforming or recovering the error rather
than eliminating it), reach for those combinators — see the
[combinator reference](../reference/combinators#the-error-channel).

## Use the errors you already have

`TaggedError` is a **convention, not a requirement**. Nothing in core constrains
`E` — there is no `E extends { _tag: string }` anywhere — and `P.tag("X")` is
just sugar for the object pattern `{ _tag: "X" }`, one pattern among several.
The matcher matches by **structure**, so an error convention you already have
works unchanged.

### Your own error classes

Any discriminant field does the job — here a `kind` on a shared base class:

```ts
abstract class DomainError extends Error {
  abstract readonly kind: string;
}

class TicketNotFound extends DomainError {
  readonly kind = "TicketNotFound" as const;
  constructor(readonly ticketId: string) {
    super(`ticket ${ticketId} not found`);
  }
}

class TicketLocked extends DomainError {
  readonly kind = "TicketLocked" as const;
  constructor(readonly lockedBy: string) {
    super("ticket locked");
  }
}

type TicketError = TicketNotFound | TicketLocked;
```

`mapErrCases` takes the same matcher the `match` handler does — one branch per
case, each narrowed to its own variant, and the un-terminated builder returned:

```ts
const withStatus = loadTicket(id).mapErrCases((matcher) =>
  matcher
    .with({ kind: "TicketNotFound" }, (e) => ({ status: 404, id: e.ticketId }))
    .with({ kind: "TicketLocked" }, (e) => ({ status: 423, by: e.lockedBy })),
);
//    ^? AsyncResult<Ticket, { status: number; id: string } | { status: number; by: string }>
```

Drop the `TicketLocked` branch and it stops compiling — exhaustiveness comes
from the union's shape, not from `TaggedError`.

### A plain union type, no classes at all

`E` doesn't have to be an `Error` subclass either. A union of plain objects
discriminated by a `code` behaves identically, and **grouped patterns** let
several cases share one handler without a wildcard:

```ts
type PaymentError =
  | { code: "CARD_DECLINED"; declineCode: string }
  | { code: "INSUFFICIENT_FUNDS" }
  | { code: "RATE_LIMITED"; retryAfter: number };

const status = charge(order).match({
  ok: () => 200,
  defect: () => 500,
  errCases: (matcher) =>
    matcher
      // grouped: one handler, two named cases — not a wildcard
      .with(
        { code: "CARD_DECLINED" },
        { code: "INSUFFICIENT_FUNDS" },
        () => 402,
      )
      .with({ code: "RATE_LIMITED" }, () => 429),
});
```

Grouping is the answer when several errors deserve the same response: the union
stays written out, so adding a fourth code still stops the build here.

### Classes with no discriminant field

For third-party or legacy classes carrying no tag at all, `P.instanceOf` is the
pattern — the branch is narrowed to the class instance:

```ts
declare const parsed: Result<Config, ParseError | TimeoutError>;

const described = parsed.mapErrCases((matcher) =>
  matcher
    .with(P.instanceOf(ParseError), (e) => `bad syntax at ${e.at}`)
    .with(P.instanceOf(TimeoutError), (e) => `gave up after ${e.afterMs}ms`),
);
```

`P.when(guard)` covers whatever the other two can't express — an arbitrary type
guard, including one over a primitive.

### What `E` _does_ have to be

Exhaustiveness is `Exclude` over the union, so the one real requirement is that
`E` is a union TypeScript can **discriminate**: a `_tag` / `kind` / `code`
field, structurally distinct class shapes, or a guard. What does not work is a
set of structurally identical classes (they collapse into one union member) or a
widened `E` like `Error`, `string` or `unknown` — with nothing to enumerate, the
only arm that terminates the match is the `P._` escape hatch, which gives back
the blanket `catch` the matcher exists to remove.
[`no-ambiguous-error-type`](./lint-your-codebase#no-ambiguous-error-type) flags those `E`s for exactly
that reason; a named union of your own types passes.

`P._` remains for what enumeration genuinely cannot express — a helper generic
in `E`, or an `E` that is a single type rather than a union — and is covered in
[Exhaustive error matching](../explanation/exhaustive-error-matching#generic-boundary-helpers-the-catch-all-is-the-only-form-that-compiles).

## Where to go next

- Match inside a pipeline: [Combinator reference](../reference/combinators#the-error-channel).
- Why the matcher, not a callback:
  [Exhaustive error matching](../explanation/exhaustive-error-matching).
- Test the errors you defined: [Test with Vitest](./test-with-vitest).
