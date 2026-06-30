# Recipes

Practical, copy-pasteable patterns. They share one running example — a small
**user profile service** — so each recipe builds on a domain you already know.

The errors are [tagged](./tagged-errors):

```ts
import { TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound")<{ id: string }> {}
class Forbidden extends TaggedError("Forbidden") {}
class InvalidProfile extends TaggedError("InvalidProfile")<{ field: string }> {}

type ProfileError = NotFound | Forbidden | InvalidProfile;
```

## 1. An HTTP handler — one `match` at the edge

Because every boundary is qualified and every in-pipeline throw becomes a defect,
the edge of a request handler needs **no `try`/`catch`** — just one `match`
mapping each channel to a status code.

`fetch` only _rejects_ on a network error — a 404/403 resolves normally — so the
modeled statuses are mapped in a `flatMap` (a `throw` there, like an unexpected
status or malformed JSON, becomes a `Defect`):

```ts
import { fromPromise, Err } from "unthrown";

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
    err: (e) => ({ status: e._tag === "NotFound" ? 404 : 403, body: e }),
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

## 2. Wrap a throwing parser

Third-party code that throws is bridged once, at the boundary, with
`fromThrowable` — the `qualify` function triages each throw into a modeled error
or a defect.

```ts
import { fromThrowable } from "unthrown";

const parseProfile = fromThrowable(
  (raw: string) => JSON.parse(raw) as Profile,
  (cause, defect) =>
    cause instanceof SyntaxError ? new InvalidProfile({ field: "json" }) : defect(cause),
);

parseProfile('{"name":"Ada"}'); // Result<Profile, InvalidProfile>
```

## 3. Bridge a nullable lookup

A cache or `Map` that returns `T | undefined` becomes a `Result` with
`fromNullable` — the sanctioned alternative to an `Option` type.

```ts
import { fromNullable } from "unthrown";

const fromCache = (id: string) => fromNullable(cache.get(id), () => new NotFound({ id }));

fromCache("u_1").map((p) => p.name); // Result<string, NotFound>
```

## 4. Combine independent fetches

`loadProfile` and friends are `AsyncResult`s, so `allAsync` combines them —
resolving concurrently, short-circuiting on the first `Err` (and any `Defect`
dominates):

```ts
import { allAsync } from "unthrown";

const page = allAsync([loadProfile(id), loadPosts(id), loadFollowers(id)]);
// AsyncResult<[Profile, Post[], User[]], ProfileError>

page.map(([profile, posts, followers]) => renderPage(profile, posts, followers));
```

(For synchronous `Result`s, use `all`; to key the results by name instead of
position, `allFromDict` / `allFromDictAsync`.)

## 5. Fold a tagged-error union exhaustively

When you want a branch per error tag (not just per channel), `matchTags` is an
exhaustive fold — miss a tag and it won't compile, with no `.exhaustive()` to
forget:

```ts
import { matchTags, type Result } from "unthrown";

declare const result: Result<Profile, ProfileError>;

const status = matchTags(result, {
  Ok: () => 200,
  Defect: (cause) => {
    logger.error(cause);
    return 500;
  },
  NotFound: (e) => (logger.info(`missing ${e.id}`), 404),
  Forbidden: () => 403,
  InvalidProfile: (e) => (logger.warn(`bad ${e.field}`), 422),
});
```

→ Back to the [Guide](./why-unthrown), or browse the
[API Reference](/api/core/).
