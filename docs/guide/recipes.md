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

```ts
import { fromPromise, defect } from "unthrown";

const loadProfile = (id: string) =>
  fromPromise(fetch(`/api/users/${id}`), (cause) =>
    cause instanceof Response && cause.status === 404 ? new NotFound({ id }) : defect(cause),
  ).flatMap((res) => fromPromise(res.json() as Promise<Profile>, defect));

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

A thrown `TypeError` from a bad `.json()` shape lands in `defect` → 500. A
modeled `NotFound` lands in `err` → 404. The type told you which is which.

## 2. Wrap a throwing parser

Third-party code that throws is bridged once, at the boundary, with
`fromThrowable` — the `qualify` function triages each throw into a modeled error
or a defect.

```ts
import { fromThrowable, defect } from "unthrown";

const parseProfile = fromThrowable(
  (raw: string) => JSON.parse(raw) as Profile,
  (cause) => (cause instanceof SyntaxError ? new InvalidProfile({ field: "json" }) : defect(cause)),
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

`all` collects several `Result`s, short-circuiting on the first `Err` (and any
`Defect` dominates):

```ts
import { all } from "unthrown";

const page = all([loadProfile(id), loadPosts(id), loadFollowers(id)]);
// Result<[Profile, Post[], User[]], ProfileError>

page.map(([profile, posts, followers]) => renderPage(profile, posts, followers));
```

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
