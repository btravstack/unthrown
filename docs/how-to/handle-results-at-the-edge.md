# Handle results at the edge

> **How-to.** Fold a `Result` into a response at the boundary of your program —
> one `match`, no `try`/`catch`. These recipes share a small **user profile
> service** whose errors are [tagged](./model-errors).

```ts
import { TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Forbidden extends TaggedError("Forbidden") {}

type ProfileError = NotFound | Forbidden;
```

## An HTTP handler — one `match`

Because every boundary is qualified and every in-pipeline throw becomes a defect,
a request handler needs **no `try`/`catch`** — just one `match` mapping each
channel to a status code.

`fetch` only _rejects_ on a network error — a 404/403 resolves normally — so the
modeled statuses are mapped in a `flatMap` (a `throw` there, like an unexpected
status or malformed JSON, becomes a `Defect`):

```ts
import { fromPromise, Err, tag } from "unthrown";

const loadProfile = (id: string) =>
  // A network error (a rejected fetch) is unexpected → defect.
  fromPromise(fetch(`/api/users/${id}`), (c, defect) => defect(c)).flatMap((res) => {
    if (res.status === 404) return Err(new NotFound({ id }));
    if (res.status === 403) return Err(new Forbidden());
    if (!res.ok) throw new Error(`unexpected status ${res.status}`); // → Defect
    return fromPromise(res.json() as Promise<Profile>, (c, defect) => defect(c)); // malformed JSON → Defect
  });
// AsyncResult<Profile, NotFound | Forbidden>

async function handler(id: string): Promise<HttpResponse> {
  return (await loadProfile(id)).match({
    ok: (profile) => ({ status: 200, body: profile }),
    err: (matcher) =>
      matcher
        .with(tag("NotFound"), (e) => ({ status: 404, body: e }))
        .with(tag("Forbidden"), (e) => ({ status: 403, body: e })),
    defect: (cause) => {
      logger.error(cause); // a real bug — log it, don't leak it
      return { status: 500, body: "Internal Error" };
    },
  });
}
```

A network failure or malformed response lands in `defect` → 500. The modeled
`NotFound` / `Forbidden` land in `err` → 404 / 403. The type told you which is
which.

::: warning Keep `match` handlers trivial
The throw → defect containment covers the **combinators**, not `match`'s own
callbacks — `match` invokes your handlers directly. Keep them trivial edge code
(send the response, log) and put anything failable in a pipeline step above.
:::

## A complete route (Hono)

A full route, no `try`/`catch` anywhere: a Standard Schema validator parses the
path param, `flatMap` feeds the parsed id into a repository call that returns its
own `AsyncResult`, and `match`'s matcher folds every tag to a status code:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { fromSchema } from "@unthrown/standard-schema";
import { P, tag, TaggedError, type AsyncResult } from "unthrown";

class InvalidId extends TaggedError("InvalidId") {}

type User = { id: string; name: string };

// The repository is its own boundary — it already hands back a qualified
// AsyncResult, so there's nothing left to triage at the call site.
declare const userRepo: { findById(id: string): AsyncResult<User, NotFound> };

const parseId = fromSchema(z.uuid());
const app = new Hono();

app.get("/users/:id", (c) => {
  const user = parseId(c.req.param("id"))
    .mapErr((matcher) => matcher.with(P._, () => new InvalidId()))
    .toAsync()
    .flatMap((id) => userRepo.findById(id));
  // AsyncResult<User, InvalidId | NotFound>

  return user.match({
    ok: (u) => c.json(u, 200),
    err: (matcher) =>
      matcher
        .with(tag("InvalidId"), () => c.json({ error: "invalid id" }, 400))
        .with(tag("NotFound"), (e) => c.json({ error: `no user ${e.id}` }, 404)),
    defect: (cause) => {
      logger.error(cause);
      return c.json({ error: "Internal Error" }, 500);
    },
  });
});
```

`match` accepts an `AsyncResult` directly and resolves to a `Promise` — Hono
awaits whatever the handler returns, so there's no manual `await` to remember.

## Extract instead of matching

When you don't need per-channel branching, an extractor leaves the `Result` world
with a fallback. All of them **recover an `Err` but rethrow a `Defect`** (a bug is
not an absent value):

```ts
loadConfig(text).getOr(DEFAULT_CONFIG); // Err → fallback; Defect → throws
result.getOrNull(); // Err → null;     Defect → throws
result.getOrThrow(); // Err → throws the modeled error as-is; Defect → throws
```

Use `getOrThrow` only as a deliberate escape hatch back into throw-land (it exists
so a `no-throw` lint rule can ban raw `throw`). Prefer `match` / `recoverErr` /
`flatMapErr` whenever the error can stay a value. Full family in the
[combinator reference](../reference/combinators#eliminating-a-result).

## Where to go next

- Bring the boundary in first: [Qualify a boundary](./qualify-a-boundary).
- Validate input at the edge: [Validate with Standard Schema](./validate-with-standard-schema).
- Keep `match` handlers honest: [Comparison](../explanation/comparison#2-what-happens-when-a-map-callback-throws).
