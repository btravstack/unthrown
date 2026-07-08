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

## 6. An HTTP route end-to-end (Hono)

A complete route, no `try`/`catch` anywhere: `fromSchema` validates the path
param, `flatMap` feeds the parsed id into a repository call that returns its
own `AsyncResult`, and `matchTags` folds every tag straight to a status code.
A throw in `mapErr`'s callback or inside the repository call is caught by that
combinator and becomes a `Defect` — the same containment as recipe 1 — so a
bug in any pipeline step surfaces as the `Defect` arm's 500, never an unhandled
exception:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { fromSchema } from "@unthrown/standard-schema";
import { matchTags, TaggedError, type AsyncResult } from "unthrown";

class InvalidId extends TaggedError("InvalidId") {}

type User = { id: string; name: string };

// The repository is its own boundary (see recipe 2) — it already hands back a
// qualified `AsyncResult`, so there's nothing left to triage at the call site.
declare const userRepo: { findById(id: string): AsyncResult<User, NotFound> };

const parseId = fromSchema(z.string().uuid());

const app = new Hono();

app.get("/users/:id", (c) => {
  const user = parseId(c.req.param("id"))
    .mapErr(() => new InvalidId())
    .toAsync()
    .flatMap((id) => userRepo.findById(id));
  // AsyncResult<User, InvalidId | NotFound>

  return matchTags(user, {
    Ok: (u) => c.json(u, 200),
    InvalidId: () => c.json({ error: "invalid id" }, 400),
    NotFound: (e) => c.json({ error: `no user ${e.id}` }, 404),
    Defect: (cause) => {
      logger.error(cause); // a real bug — log it, don't leak it
      return c.json({ error: "Internal Error" }, 500);
    },
  });
});
```

`matchTags` accepts an `AsyncResult` directly and resolves to a `Promise` —
Hono awaits whatever the handler returns, so there's no manual `await` to
remember.

## 7. Form validation with Standard Schema

`fromSchema` turns any [Standard Schema](https://standardschema.dev) validator
(Zod, Valibot, ArkType, …) into a function returning a `Result` whose error is
the validator's own **issues array** — not the schema library's exception
type. Map that array to per-field messages in the `err` arm:

```ts
import { z } from "zod";
import { fromSchema, type SchemaIssues } from "@unthrown/standard-schema";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const parseSignup = fromSchema(signupSchema);

const fieldOf = (issue: SchemaIssues[number]) => {
  const segment = issue.path?.[0];
  const key = typeof segment === "object" ? segment.key : segment;
  return key === undefined ? "_form" : String(key);
};

function validateSignup(input: unknown) {
  return parseSignup(input).match({
    ok: (data) => ({ ok: true as const, data }),
    err: (issues) => ({
      ok: false as const,
      fieldErrors: issues.reduce<Record<string, string[]>>((byField, issue) => {
        const field = fieldOf(issue);
        (byField[field] ??= []).push(issue.message);
        return byField;
      }, {}),
    }),
    defect: (cause) => {
      logger.error(cause); // the validator itself threw — a real bug, not a bad form
      return { ok: false as const, fieldErrors: { _form: ["Something went wrong."] } };
    },
  });
}

validateSignup({ email: "not-an-email", password: "short" });
// { ok: false, fieldErrors: { email: [...], password: [...] } }
```

The `defect` arm only fires if the schema itself throws instead of returning
issues — a bug in the validator, not a bad submission.

→ Back to the [Guide](./why-unthrown), or browse the
[API Reference](/api/core/).

→ Continue to [Tagged Errors](./tagged-errors).
