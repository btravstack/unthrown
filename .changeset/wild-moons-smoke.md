---
"@unthrown/prisma": minor
---

Make `E` domain outcomes only: infrastructure failures become defects, and fix
an unsound error channel on `tryCreate` / `tryUpsert`.

**`E` now carries only what you would actually branch on.** Three P-codes
describe a domain outcome and stay modeled — `UniqueConstraintViolation` (P2002,
409), `ForeignKeyViolation` (P2003, 400), `RecordNotFound` (P2025/P2018, 404).
**Everything infrastructural is now a defect**: a dropped connection, a pool
timeout, a deadlock, an unmapped P-code, a malformed query, a client that could
not start, an engine panic.

Nobody writes domain logic for a severed TCP connection — you log it and return a
500, which is exactly what `match`'s `defect` arm already does. Modelling those
failures only forced every call site to carry an arm that duplicated its own
`defect` arm:

```ts
// before — the same handling, written twice, at every call site:
errCases: (matcher) => matcher
  .with(P.tag("UniqueConstraintViolation"), (e) => resp.conflict(e.fields))
  .with(P.tag("DriverError"), (e) => resp.serverError(e)),
defect: (cause) => resp.serverError(cause),
```

A defect is not a crash: it flows through the pipeline untouched and is folded at
the edge like any other unmodeled failure.

Consequences:

- **The `DriverError` class is removed.** Nothing routes to it any more; the
  original Prisma error reaches your `defect` arm unwrapped, with its `code`,
  `meta` and stack intact.
- **A read has no modeled failure**: `tryFindMany` is
  `AsyncResult<User[], never>`. Absence is still `null`.
- **Pagination gains `InvalidCursor`**, the one carve-out. A cursor is an opaque
  string from a client, so a `parseCursor` that rejects it — or a query Prisma
  refuses to validate — is anticipated input you answer with a 400. A throw out
  of `getCursor`, which reads rows you just fetched, is a bug and stays a defect.
- **Retrying a deadlock (P2034) or pool timeout (P2024)** now goes through
  `recoverDefect` rather than a tag match — one place in a codebase, versus an
  arm at every call site.

**`tryCreate` and `tryUpsert` now carry `RecordNotFound`.** A nested `connect`
pointing at a record that does not exist raises P2025, even though neither
operation has a row of its own to miss:

```ts
db.post.tryCreate({ data: { title, author: { connect: { id: 999 } } } });
// Err(RecordNotFound) — P2025
```

Their unions previously excluded it, so the runtime produced an error the type
said was impossible. An exhaustive `mapErrCases` over the declared union then had
no arm for the value that arrived, the matcher threw `NonExhaustiveError`, and
the throw-to-defect net turned a modeled database failure into a `Defect`. P2018
— the same failure from the to-many side of a nested write — now maps to
`RecordNotFound` too. The batch mutations (`tryCreateMany` / `tryUpdateMany` and
their `*AndReturn` twins) accept no nested writes, so they remain free of it.

**`withCursor`'s `after` and `before` are now mutually exclusive.** Passing both
type-checked and silently ignored `after`.

Breaking, shipped as a minor: `qualifyPrismaError` takes the injected `defect`
helper as a second argument (it is a `qualify`, so passing it to a boundary is
unchanged — only direct invocation needs updating), the `DriverError` class is
gone, and every error union changed. Each of those is a compile error at the call
site rather than a silent behaviour change — which is the point.
