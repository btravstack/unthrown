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

The class extends `Error` (so `instanceof Error` holds and stacks work), the
`_tag` is authoritative (a payload can't overwrite it), and a `message` field in
the payload is forwarded to `Error`.

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
