# @unthrown/prisma

Package-specific spec for `packages/prisma`. The cross-cutting rules — the five
theses, the load-bearing runtime invariants, the public surface and the
internal design — live in the root [`CLAUDE.md`](../../CLAUDE.md) and apply
here too.

PeerDep `@prisma/client` ^7; a Prisma
Client **extension** — `$extends(unthrownPrisma)` adds `try*` variants of
**all seventeen** model delegate operations alongside the raw promise ones,
each an `AsyncResult` whose error channel is exactly the **domain outcomes**
that operation can raise — and nothing else. `E` holds only the three P-codes
a caller branches on: `UniqueConstraintViolation` P2002 (409),
`ForeignKeyViolation` P2003 (400), `RecordNotFound` P2025 **and P2018** (404 —
the to-one and to-many sides of "a record this write depended on was not
found", the same failure, so one tag). **Every infrastructure failure is a
`Defect`**: a dropped connection, a pool timeout (P2024), a deadlock (P2034),
an unmapped P-code, `PrismaClientValidationError` (a malformed query,
unreachable without casting the `Prisma.Exact` args away),
`PrismaClientInitializationError`, `PrismaClientRustPanicError`,
`PrismaClientUnknownRequestError`, a non-Prisma cause. The rule is "would you
branch on it?" — nobody writes domain logic for a severed TCP connection, they
log it and 500, which is exactly what `match`'s `defect` arm already does;
modelling those would force **every call site** to carry an arm duplicating
its own `defect` arm. (A defect is not a crash — it flows through the pipeline
untouched and is folded at the edge like any other unmodeled failure.) So a
**read has `E = never`** (absence is `null`; a database that will not answer is
a defect), and there is **no `DriverError` class** — it was removed
2026-08 when the last of its contents moved to the defect channel. A retry
wrapper for P2024/P2034 therefore uses `recoverDefect` and inspects the cause:
one place in a codebase, versus an arm at every call site. Only the **batch**
mutations (`createMany`/`updateMany` + their `*AndReturn` twins) are free of
`RecordNotFound`: they accept no nested writes and zero matches is
`Ok({ count: 0 })`. `create` and `upsert` **do** carry it — neither misses a
row of its own, but a nested `connect` to a non-existent record raises P2025
(an unsound omission until 2026-08: the runtime produced a `RecordNotFound`
the type excluded, so a type-exhaustive `mapErrCases` threw
`NonExhaustiveError` and the modeled error silently became a `Defect`). Also
`$tryTransaction`, **overloaded exactly as Prisma's own
`$transaction` is** — one method, two forms, so the `try*` prefix keeps
mapping one-to-one onto a Prisma method (a separate `$tryBatchTransaction`
was rejected for inventing a concept Prisma does not have). The
**interactive** form takes a callback speaking `AsyncResult` — an `Err` rolls
back and re-surfaces typed; a defect rolls back and stays a defect, a
throwing callback included — and its `tx` is nameable from outside as the
exported `TransactionClient<C>` (`Omit<C, TxDenyList>`; the deny list itself
stays internal, because a hand-copied `Omit` drifts silently — `Omit` of a
key that does not exist is not an error). The **batch** form takes an array
of unexecuted `Prisma.PrismaPromise`s, one round trip, all or nothing,
qualified through the same `qualifyPrismaError`; two limits follow from
Prisma's form and are documented rather than papered over: the array holds
the **raw** delegate methods (a `try*` has already executed, so passing one
is a compile error) and `E` is the whole `PrismaQueryError` union, since a
raw `PrismaPromise` carries no error-type information. A fixed tuple keeps
positional types, a dynamic array collapses to a list — core's `all` duality.
Being overloaded is why `$tryTransaction` is a `const` carrying an overloaded
function type rather than an object-literal method. Also
`tryPaginate(...).withCursor(...)` (the
`prisma-extension-pagination` cursor API with its unmerged #35 fix folded
in; `after`/`before` are mutually exclusive in the type — passing both used to
drop `after` silently — and pagination carries the **one carve-out** to the
defect routing above: its `E` is `InvalidCursor`, minted both from a Prisma
validation error and from a throw out of the caller's `parseCursor` on a
request cursor (marked by the internal `CursorParseFailure` sentinel), because
a cursor is an opaque string from a client and garbage in it is a 400, not a
bug. A throw out of `getCursor` — which reads rows _we_ fetched — is
deliberately NOT marked, so it stays a defect). Qualification happens once inside the extension via the exported
`qualifyPrismaError`, which **is** a `qualify` — `(cause, defect)`, generic in
the marker type so core's non-exported `Defect` need not be named — and so
drops straight into a `fromPromise` at a boundary of your own; the raw methods
stay as the escape hatch for raw SQL, and are what a batch
`$tryTransaction([...])` is composed from. Tested against a
real in-memory SQLite client (`@prisma/adapter-better-sqlite3`) with a
generated, gitignored test client; **deliberately outside the fixed version
group** — its majors track `@prisma/client`'s cadence, not the family's.
`engines: { node: ">=20.19" }` (Prisma 7's floor), the one exception to the
family's `>=20`. Documented in the Prisma guide page.
