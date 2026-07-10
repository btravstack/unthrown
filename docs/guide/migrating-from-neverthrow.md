# Migrating from neverthrow

Both libraries return failures as values instead of throwing them. Most of the
API maps one-to-one — the same shape, a different name here and there. The
migration is mechanical for 90% of your code; the other 10% is where the two
libraries actually disagree, and that's worth doing on purpose rather than by
search-and-replace.

## API mapping

| neverthrow                           | unthrown                     | Notes                                                               |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------- |
| `ok(v)` / `err(e)`                   | `Ok(v)` / `Err(e)`           | constructors are capitalized                                        |
| `result.andThen(f)`                  | `result.flatMap(f)`          | one name per concept                                                |
| `result.map(f)` / `mapErr(f)`        | same                         | callbacks must be synchronous                                       |
| `result.orElse(f)`                   | `result.flatMapErr(f)`       | `flatMap` on the error channel (`orElse` is a deprecated alias)     |
| `result.match(okFn, errFn)`          | `match({ ok, err, defect })` | the third channel is new — see below                                |
| `result.unwrapOr(v)`                 | `result.getOr(v)`            | still throws on a Defect (a bug is not an absent value)             |
| `ResultAsync`                        | `AsyncResult`                | `await` collapses it to a `Result`; it never rejects                |
| `ResultAsync.fromPromise(p, mapErr)` | `fromPromise(p, qualify)`    | `qualify` must return `E` **or** `defect(cause)` — triage is forced |
| `ResultAsync.fromSafePromise(p)`     | `fromSafePromise(p)`         | a rejection becomes a `Defect`, not an `Err`                        |
| `Result.combine([...])`              | `all([...])`                 | any `Defect` dominates                                              |
| `Result.combineWithAllErrors`        | —                            | error accumulation is deliberately excluded                         |
| `safeTry(function* …)`               | `Do().bind(…).let(…)`        | see [Do Notation](./do-notation#why-not-a-generator-safetry-gen)    |
| `fromThrowable(fn, mapErr)`          | `fromThrowable(fn, qualify)` | same idea, plus the defect arm                                      |

Most rows are a rename. `andThen` → `flatMap` is unthrown's one-name-per-concept
rule (`flatMap` is what the operation actually is — no `chain`, no `bind` outside
do-notation). The rest of the table is where the libraries genuinely differ.

## The two real deltas

### 1. The defect channel

In neverthrow, a throw inside `.map` (or a bug that slips past `mapErr`)
escapes as a real exception — and an async one rejects the underlying
`ResultAsync`. neverthrow's own `_unsafeUnwrap()` is the sharpest version of the
same gap: it's a documented escape hatch that throws on an `Err` (neverthrow
itself documents it as intended for tests, not production code), yet one bad
call site in production turns a typed `Result` back into an uncaught exception.
In practice this means every handler still needs a `try`/`catch` as a backstop
for whatever the pipeline didn't anticipate — the type says "handled," the
runtime doesn't fully agree.

In unthrown, a throw inside any **combinator** (`.map`, `.flatMap`, `mapErr`,
…) becomes a `Defect` instead — a third state, not part of `E`, that flows down
the pipeline and arrives at `match`'s mandatory `defect` arm. So the
`try`/`catch` around the pipeline goes away: nothing a pipeline step throws can
escape it as a raw exception.

```ts
// neverthrow — a try/catch backstop is load-bearing, not defensive fluff
import { ResultAsync } from "neverthrow";

function getUser(id: string): ResultAsync<User, NotFoundError> {
  return ResultAsync.fromPromise(fetchUser(id), (cause) => new NotFoundError(String(cause)));
}

app.get("/users/:id", async (req, res) => {
  try {
    const result = await getUser(req.params.id).map((user) => formatUser(user)); // a bug in formatUser rejects the ResultAsync
    result.match(
      (view) => res.status(200).json(view),
      (error) => res.status(404).json({ error: error.message }),
    );
  } catch (cause) {
    // catches the formatUser bug, and anything else the pipeline let escape —
    // neverthrow has one bucket for "everything else that went wrong"
    console.error(cause);
    res.status(500).json({ error: "internal error" });
  }
});
```

```ts
// unthrown — the same bug becomes a Defect inside the pipeline;
// no try/catch around it
import { fromPromise } from "unthrown";

function getUser(id: string) {
  return fromPromise(fetchUser(id), (cause, defect) =>
    cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
  ); // AsyncResult<User, "not_found">
}

app.get("/users/:id", async (req, res) => {
  const result = await getUser(req.params.id).map((user) => formatUser(user)); // a bug in formatUser → Defect
  result.match({
    ok: (view) => res.status(200).json(view),
    err: () => res.status(404).json({ error: "not found" }),
    defect: (cause) => {
      console.error(cause); // everything the pipeline caught lands here
      res.status(500).json({ error: "internal error" });
    },
  });
});
```

Same handler, same failure mode — but the unthrown version needs no
`try`/`catch` around the pipeline, because every combinator converts a throw
into a `Defect` that arrives at `match`'s `defect` arm. One precise caveat: the
containment covers the **combinators**, not `match`'s own callbacks — `match`
invokes your handlers directly, so keep them trivial edge code (send the
response, log) and put anything failable in a pipeline step above.

### 2. `qualify` replaces the error mapper

neverthrow's `fromPromise` maps _every_ rejection into `E` — the mapper is
total, and has no way to say "actually, this one is a bug, not a domain
error." unthrown's `qualify` makes you decide, per cause, which bucket it goes
in. The mechanical rewrite is:

```ts
(e) => toE(e)
// becomes
(cause, defect) => (isExpected(cause) ? toE(cause) : defect(cause))
```

If every cause your old mapper handled really was expected, this is a
one-line change. If some of them were "whatever, stick it in `E` and move on,"
that's exactly the code smell the defect channel exists to surface — route
those through `defect(cause)` instead.

## What you can delete after migrating

- the eslint `must-use-result` setup (the `@unthrown/oxlint` rules cover the
  equivalent surface — see [Linting](./linting));
- defensive `try`/`catch` around combinator chains — the defect channel is
  the backstop now;
- any `E = unknown` / `E = Error` unions that existed to absorb "everything
  else" — that is the defect channel's job now.

→ Continue to [Getting Started](./getting-started).
