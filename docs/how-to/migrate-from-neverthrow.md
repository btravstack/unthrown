# Migrate from neverthrow

> **How-to.** Both libraries return failures as values. Most of the API maps
> one-to-one; the migration is mechanical for ~90% of your code. The other 10% is
> where the two genuinely disagree — do that part on purpose, not by
> search-and-replace.

## API mapping

| neverthrow                           | unthrown                                          | Notes                                                                                  |
| ------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ok(v)` / `err(e)`                   | `Ok(v)` / `Err(e)`                                | constructors are capitalized                                                           |
| `result.andThen(f)`                  | `result.flatMap(f)`                               | one name per concept                                                                   |
| `result.map(f)`                      | same                                              | callbacks must be synchronous                                                          |
| `result.mapErr(f)`                   | `result.mapErrCases((matcher) => …)`              | an exhaustive match over the error's cases; `.with(P._, f)` is the uniform form        |
| `result.orElse(f)`                   | `result.flatMapErrCases((matcher) => …)`          | `flatMap` on the error channel; same exhaustive matcher                                |
| `result.match(okFn, errFn)`          | `match({ ok, errCases: (matcher) => …, defect })` | the third channel is new, and `errCases` takes the same exhaustive matcher — see below |
| `result.unwrapOr(v)`                 | `result.getOr(v)`                                 | still throws on a Defect (a bug is not an absent value)                                |
| `ResultAsync`                        | `AsyncResult`                                     | `await` collapses it to a `Result`; it never rejects                                   |
| `ResultAsync.fromPromise(p, mapErr)` | `fromPromise(p, qualify)`                         | `qualify` must return `E` **or** `defect(cause)` — triage is forced                    |
| `ResultAsync.fromSafePromise(p)`     | `fromSafePromise(p)`                              | a rejection becomes a `Defect`, not an `Err`                                           |
| `Result.combine([...])`              | `all([...])`                                      | any `Defect` dominates                                                                 |
| `Result.combineWithAllErrors`        | —                                                 | error accumulation is deliberately excluded                                            |
| `safeTry(function* …)`               | `Do().bind(…).let(…)`                             | see [do-notation](./sequence-dependent-steps)                                          |
| `fromThrowable(fn, mapErr)`          | `fromThrowable(fn, qualify)`                      | same idea, plus the defect arm                                                         |

Most rows are a rename. `andThen` → `flatMap` is unthrown's
[one-name-per-concept](../explanation/design-decisions#one-name-per-concept-no-aliases)
rule. The one behavioral change to know up front: `mapErrCases` (and the other error
combinators) take an **exhaustive matcher** rather than a plain callback — the
uniform port is `.mapErrCases((matcher) => matcher.with(P._, f))`, and the reasoning is
in [Exhaustive error matching](../explanation/exhaustive-error-matching). The rest
of the table is where the libraries genuinely differ.

## Delta 1 — the defect channel

In neverthrow, a throw inside `.map` (or a bug that slips past `mapErr`) escapes as
a real exception — and an async one rejects the underlying `ResultAsync`. In
practice every handler still needs a `try`/`catch` as a backstop.

In unthrown, a throw inside any **combinator** becomes a `Defect` — a third state,
not part of `E`, that flows down the pipeline to `match`'s mandatory `defect` arm.
So the `try`/`catch` around the pipeline goes away:

```ts
// neverthrow — a try/catch backstop is load-bearing, not defensive fluff
app.get("/users/:id", async (req, res) => {
  try {
    const result = await getUser(req.params.id).map((user) => formatUser(user)); // a bug in formatUser rejects the ResultAsync
    result.match(
      (view) => res.status(200).json(view),
      (error) => res.status(404).json({ error: error.message }),
    );
  } catch (cause) {
    console.error(cause); // one bucket for "everything else that went wrong"
    res.status(500).json({ error: "internal error" });
  }
});
```

```ts
// unthrown — the same bug becomes a Defect inside the pipeline; no try/catch
import { fromPromise, P } from "unthrown";

app.get("/users/:id", async (req, res) => {
  const result = await getUser(req.params.id).map((user) => formatUser(user)); // a bug in formatUser → Defect
  result.match({
    ok: (view) => res.status(200).json(view),
    errCases: (matcher) => matcher.with(P._, () => res.status(404).json({ error: "not found" })),
    defect: (cause) => {
      console.error(cause); // everything the pipeline caught lands here
      res.status(500).json({ error: "internal error" });
    },
  });
});
```

One precise caveat: the containment covers the **combinators**, not `match`'s own
callbacks — keep those trivial (send the response, log) and put anything failable in
a pipeline step above.

## Delta 2 — `qualify` replaces the error mapper

neverthrow's `fromPromise` maps _every_ rejection into `E` — the mapper is total,
with no way to say "this one is a bug." unthrown's `qualify` makes you decide, per
cause, which bucket it goes in. The mechanical rewrite is:

```ts
(e) => toE(e)
// becomes
(cause, defect) => (isExpected(cause) ? toE(cause) : defect(cause))
```

If every cause your old mapper handled really was expected, this is a one-line
change. If some were "whatever, stick it in `E` and move on," that's exactly the
smell the defect channel exists to surface — route those through `defect(cause)`.

## What you can delete after migrating

- the eslint `must-use-result` setup — `@unthrown/oxlint` ships a syntactic
  [`no-unhandled-result`](./lint-your-codebase#no-unhandled-result) rule;
- defensive `try`/`catch` around combinator chains — the defect channel is the
  backstop now;
- any `E = unknown` / `E = Error` unions that existed to absorb "everything else" —
  that is the defect channel's job now.

## Where to go next

- Why the error matcher: [Exhaustive error matching](../explanation/exhaustive-error-matching).
- The channel that replaces your backstop: [The Defect Channel](../explanation/the-defect-channel).
- A side-by-side of both libraries: [Comparison](../explanation/comparison).
