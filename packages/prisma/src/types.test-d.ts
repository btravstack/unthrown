// Type-level tests, checked by the package's regular `tsc --noEmit` (the file has
// no runtime — nothing imports it). They guard the two claims the extension is
// built on: payload inference (`select` / `include`) survives the wrap, and the
// error channel is per-operation — a read cannot fail with a write's constraint
// violations. Assertions accumulate in the exported `_Assertions` tuple (so
// nothing is an unused local); `@ts-expect-error` guards the cases that must NOT
// compile.

import type { AsyncErrOf, AsyncOkOf } from "unthrown";

import type { PrismaClient } from "./generated/prisma/client.ts";
import type {
  CursorPaginationMeta,
  DriverError,
  ForeignKeyViolation,
  RecordNotFound,
  UniqueConstraintViolation,
} from "./index.js";
import { unthrownPrisma } from "./index.js";

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

// @ts-expect-error — `email` was not selected; the payload narrowed to `{ id }`.
selected.map((rows) => rows.map((r) => r.email));

// @ts-expect-error — an unknown arg key is rejected (`Prisma.Exact`).
db.user.tryFindMany({ bogus: true });

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

db.user.tryPaginate({ select: { id: true } }).withCursor({
  limit: 1,
  // @ts-expect-error — `email` is not in the selection; getCursor sees the narrowed row.
  getCursor: (row) => row.email,
});

// @ts-expect-error — parseCursor must return the model's unique-where input.
db.user.tryPaginate().withCursor({ limit: 1, parseCursor: () => ({ bogus: 1 }) });

// --- $tryTransaction: errors union, try-methods inside, no nesting -------------

const tx = db.$tryTransaction((txc) => txc.user.tryCreate({ data: { email: "a@example.com" } }));

db.$tryTransaction((txc) => {
  // @ts-expect-error — no nested transactions inside the callback.
  txc.$tryTransaction;
  // @ts-expect-error — the raw `$transaction` is denied inside the callback too.
  txc.$transaction;
  return txc.user.tryFindMany();
});

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
  Expect<Equal<AsyncErrOf<typeof all>, DriverError>>,
  Expect<
    Equal<AsyncErrOf<typeof created>, UniqueConstraintViolation | ForeignKeyViolation | DriverError>
  >,
  Expect<Equal<AsyncErrOf<typeof fetched>, RecordNotFound | DriverError>>,
  // pagination: the payload is the narrowed page + meta; the error is read-only
  Expect<Equal<AsyncOkOf<typeof paged>[0][number]["email"], string>>,
  Expect<Equal<AsyncOkOf<typeof paged>[1], CursorPaginationMeta>>,
  Expect<Equal<AsyncErrOf<typeof paged>, DriverError>>,
  Expect<Equal<AsyncOkOf<typeof pagedSelect>[0], { id: number }[]>>,
  // the transaction unions the callback's errors with the transaction's own
  Expect<
    Equal<
      AsyncErrOf<typeof tx>,
      UniqueConstraintViolation | ForeignKeyViolation | RecordNotFound | DriverError
    >
  >,
  Expect<Equal<AsyncOkOf<typeof tx>["email"], string>>,
];
