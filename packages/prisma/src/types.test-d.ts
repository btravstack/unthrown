// Type-level tests, checked by the package's regular `tsc --noEmit` (the file has
// no runtime — nothing imports it). They guard the two claims the extension is
// built on: payload inference (`select` / `include`) survives the wrap, and the
// error channel is per-operation — a read cannot fail with a write's constraint
// violations. Assertions accumulate in the exported `_Assertions` tuple (so
// nothing is an unused local); `@ts-expect-error` guards the cases that must NOT
// compile.

import type { AsyncErrOf, AsyncOkOf, AsyncResult } from "unthrown";
import { fromPromise } from "unthrown";

import type { PrismaClient } from "./generated/prisma/client.ts";
import type {
  CursorPaginationMeta,
  InvalidCursor,
  ForeignKeyViolation,
  PrismaQueryError,
  RecordNotFound,
  TransactionClient,
  UniqueConstraintViolation,
} from "./index.js";
import { qualifyPrismaError, unthrownPrisma } from "./index.js";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const base: PrismaClient;
const db = base.$extends(unthrownPrisma);

// --- payload inference survives the wrap --------------------------------------

const all = db.user.tryFindMany();
const selected = db.user.tryFindMany({ select: { id: true } });
const created = db.user.tryCreate({ data: { email: "a@example.com" } });
const fetched = db.user.tryFindUniqueOrThrow({ where: { id: 1 } });
const maybe = db.user.tryFindUnique({ where: { id: 1 } });
const counted = db.user.tryCount();
const first = db.user.tryFindFirst({ select: { id: true } });
const firstOrThrow = db.user.tryFindFirstOrThrow();
const upserted = db.user.tryUpsert({
  where: { id: 1 },
  create: { email: "a@example.com" },
  update: { name: "x" },
});
const createdMany = db.user.tryCreateMany({ data: [{ email: "a@example.com" }] });
const createdRows = db.user.tryCreateManyAndReturn({
  data: [{ email: "a@example.com" }],
  select: { id: true },
});
const updated = db.user.tryUpdate({ where: { id: 1 }, data: { name: "x" } });
const updatedMany = db.user.tryUpdateMany({ where: {}, data: { name: "x" } });
const updatedRows = db.user.tryUpdateManyAndReturn({ data: { name: "x" }, select: { id: true } });
const deleted = db.user.tryDelete({ where: { id: 1 } });
const deletedMany = db.user.tryDeleteMany();
const aggregated = db.user.tryAggregate({ _count: true });
const grouped = db.user.tryGroupBy({ by: ["name"] });

// @ts-expect-error — `email` was not selected; the payload narrowed to `{ id }`.
selected.map((rows) => rows.map((r) => r.email));

// @ts-expect-error — an unknown arg key is rejected (`Prisma.Exact`).
db.user.tryFindMany({ bogus: true });

// --- qualifyPrismaError drops straight into a boundary --------------------------

// It IS a `qualify`: the boundary injects `defect`, and the Defect arm of its
// return is subtracted from E — so the channel is exactly PrismaQueryError, with
// no `Defect` leaking into it (E is covariant, so a stray `| Defect` would fail
// this `satisfies`).
declare const rawQuery: Promise<unknown>;
fromPromise(rawQuery, qualifyPrismaError) satisfies AsyncResult<unknown, PrismaQueryError>;

// --- the error channel is per-operation ----------------------------------------

// @ts-expect-error — a read cannot fail with UniqueConstraintViolation.
const _readNarrow: AsyncErrOf<typeof all> = null as unknown as UniqueConstraintViolation;

// --- tryPaginate: query owns the filter, pagination owns the cursor ------------

const paged = db.user.tryPaginate({ where: { name: "x" } }).withCursor({ limit: 2 });
const pagedSelect = db.user.tryPaginate({ select: { id: true } }).withCursor({ limit: null });

// @ts-expect-error — `take` belongs to pagination, not the query.
db.user.tryPaginate({ take: 1 });
// @ts-expect-error — `cursor` belongs to pagination, not the query.
db.user.tryPaginate({ cursor: { id: 1 } });
// @ts-expect-error — `limit: null` cannot be combined with `before`.
db.user.tryPaginate().withCursor({ limit: null, before: "1" });
// @ts-expect-error — `after` and `before` are mutually exclusive; a page runs one way.
db.user.tryPaginate().withCursor({ limit: 1, after: "1", before: "9" });

// Each direction on its own is fine, with or without a bound.
db.user.tryPaginate().withCursor({ limit: 1, after: "1" });
db.user.tryPaginate().withCursor({ limit: 1, before: "9" });
db.user.tryPaginate().withCursor({ limit: null, after: "1" });

db.user.tryPaginate({ select: { id: true } }).withCursor({
  limit: 1,
  // @ts-expect-error — `email` is not in the selection; getCursor sees the narrowed row.
  getCursor: (row) => row.email,
});

// @ts-expect-error — parseCursor must return the model's unique-where input.
db.user.tryPaginate().withCursor({ limit: 1, parseCursor: () => ({ bogus: 1 }) });

// The meta's boundary cursors travel together: non-null startCursor proves endCursor.
declare const meta: CursorPaginationMeta;
if (meta.startCursor !== null) {
  meta.endCursor satisfies string;
}

// $tryTransaction accepts only known isolation levels.
db.$tryTransaction((txc) => txc.user.tryFindMany(), { isolationLevel: "Serializable" });
// @ts-expect-error — not a Prisma isolation level.
db.$tryTransaction((txc) => txc.user.tryFindMany(), { isolationLevel: "Chaotic" });

// --- $tryTransaction: errors union, try-methods inside, no nesting -------------

const tx = db.$tryTransaction((txc) => txc.user.tryCreate({ data: { email: "a@example.com" } }));

db.$tryTransaction((txc) => {
  // @ts-expect-error — no nested transactions inside the callback.
  txc.$tryTransaction;
  // @ts-expect-error — the raw `$transaction` is denied inside the callback too.
  txc.$transaction;
  return txc.user.tryFindMany();
});

// --- TransactionClient: the tx parameter has a nameable type -------------------

declare const namedTx: TransactionClient<typeof db>;

// The delegates and their try* methods survive the Omit.
namedTx.user.tryFindMany();

// @ts-expect-error — the deny list removes $tryTransaction (no nesting).
namedTx.$tryTransaction;
// @ts-expect-error — and the raw $transaction with it.
namedTx.$transaction;
// @ts-expect-error — and the connection/extension methods.
namedTx.$extends;

// --- $tryTransaction: the batch form ------------------------------------------

const batch = db.$tryTransaction([
  db.user.create({ data: { email: "a@example.com" } }),
  db.user.count(),
]);

declare const inputs: readonly { email: string }[];
const batchDynamic = db.$tryTransaction(inputs.map((data) => db.user.create({ data })));

// @ts-expect-error — a batch takes UNEXECUTED PrismaPromises; `try*` has already run.
db.$tryTransaction([db.user.tryCreate({ data: { email: "a@example.com" } })]);
// @ts-expect-error — not a Prisma isolation level.
db.$tryTransaction([db.user.count()], { isolationLevel: "Chaotic" });
// @ts-expect-error — `timeout` governs an interactive transaction, not a batch.
db.$tryTransaction([db.user.count()], { timeout: 10 });

db.$tryTransaction([db.user.count()], { isolationLevel: "Serializable" });

export type _Assertions = [
  // full read: default payload flows through
  Expect<Equal<AsyncOkOf<typeof all>[number]["email"], string>>,
  Expect<Equal<AsyncOkOf<typeof counted>, number>>,
  // a findUnique miss is `null`, not an error
  Expect<Equal<Extract<AsyncOkOf<typeof maybe>, null>, null>>,
  // select narrowing is exact
  Expect<Equal<AsyncOkOf<typeof selected>, { id: number }[]>>,
  Expect<Equal<AsyncOkOf<typeof created>["email"], string>>,
  // reads fail only in the driver; writes carry their constraint violations;
  // `*OrThrow` adds P2025
  // a read has NO modeled failure: absence is `null`, and a database that will
  // not answer is a defect
  Expect<Equal<AsyncErrOf<typeof all>, never>>,
  Expect<Equal<AsyncErrOf<typeof maybe>, never>>,
  Expect<Equal<AsyncErrOf<typeof counted>, never>>,
  // `create` carries RecordNotFound too: a nested `connect` to a row that does
  // not exist raises P2025 even though a create misses no row of its own.
  Expect<
    Equal<
      AsyncErrOf<typeof created>,
      UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound
    >
  >,
  Expect<Equal<AsyncErrOf<typeof fetched>, RecordNotFound>>,
  // the specific-row mutations: the missing row, plus what their SQL can raise
  Expect<
    Equal<
      AsyncErrOf<typeof updated>,
      RecordNotFound | UniqueConstraintViolation | ForeignKeyViolation
    >
  >,
  Expect<Equal<AsyncErrOf<typeof deleted>, RecordNotFound | ForeignKeyViolation>>,
  // findFirst: selection narrows, a miss is `null`, and only OrThrow adds P2025
  Expect<Equal<AsyncOkOf<typeof first>, { id: number } | null>>,
  Expect<Equal<AsyncErrOf<typeof first>, never>>,
  Expect<Equal<AsyncErrOf<typeof firstOrThrow>, RecordNotFound>>,
  // upsert: a missing *target* is never an error (a miss creates), but a nested
  // `connect` in either branch still raises RecordNotFound
  Expect<
    Equal<
      AsyncErrOf<typeof upserted>,
      UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound
    >
  >,
  // the batch mutations: counts / rows, and genuinely no RecordNotFound — they
  // accept no nested writes, and zero matches is `Ok({ count: 0 })`
  Expect<Equal<AsyncOkOf<typeof createdMany>["count"], number>>,
  Expect<Equal<AsyncOkOf<typeof createdRows>, { id: number }[]>>,
  Expect<Equal<AsyncErrOf<typeof createdMany>, UniqueConstraintViolation | ForeignKeyViolation>>,
  Expect<Equal<AsyncErrOf<typeof createdRows>, UniqueConstraintViolation | ForeignKeyViolation>>,
  Expect<Equal<AsyncErrOf<typeof updatedMany>, UniqueConstraintViolation | ForeignKeyViolation>>,
  Expect<Equal<AsyncOkOf<typeof updatedRows>, { id: number }[]>>,
  Expect<Equal<AsyncErrOf<typeof deletedMany>, ForeignKeyViolation>>,
  // the aggregations are reads too
  Expect<Equal<AsyncErrOf<typeof aggregated>, never>>,
  Expect<Equal<AsyncErrOf<typeof grouped>, never>>,
  Expect<Equal<AsyncOkOf<typeof aggregated>["_count"], number>>,
  // pagination: the payload is the narrowed page + meta; the error is read-only
  Expect<Equal<AsyncOkOf<typeof paged>[0][number]["email"], string>>,
  Expect<Equal<AsyncOkOf<typeof paged>[1], CursorPaginationMeta>>,
  Expect<Equal<AsyncErrOf<typeof paged>, InvalidCursor>>,
  Expect<Equal<AsyncOkOf<typeof pagedSelect>[0], { id: number }[]>>,
  // the transaction unions the callback's errors with the transaction's own
  Expect<
    Equal<AsyncErrOf<typeof tx>, UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound>
  >,
  Expect<Equal<AsyncOkOf<typeof tx>["email"], string>>,
  // the batch form: a fixed tuple keeps positional types...
  Expect<Equal<AsyncOkOf<typeof batch>["length"], 2>>,
  Expect<Equal<AsyncOkOf<typeof batch>[0]["email"], string>>,
  Expect<Equal<AsyncOkOf<typeof batch>[1], number>>,
  // ...a dynamic array collapses to a list, as core's `all` does
  Expect<Equal<AsyncOkOf<typeof batchDynamic>[number]["email"], string>>,
  // and E is the whole union — a raw PrismaPromise carries no error type
  Expect<Equal<AsyncErrOf<typeof batch>, PrismaQueryError>>,
  Expect<Equal<AsyncErrOf<typeof batchDynamic>, PrismaQueryError>>,
];
