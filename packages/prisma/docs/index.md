**@unthrown/prisma**

---

# @unthrown/prisma

## Classes

### DriverError

Defined in: [packages/prisma/src/index.ts:61](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L61)

Any other query failure: connection drops, timeouts, unmapped P-codes,
driver-level errors.

#### Remarks

Prisma validation errors land here too. Arguably a malformed query is a
programmer bug rather than an anticipated outcome; triage it further at the
call site if the distinction matters to you.

#### Extends

- `TaggedErrorInstance`&lt;`"DriverError"`, \{
  `cause`: `unknown`;
  \}&gt;

#### Constructors

##### Constructor

```ts
new DriverError(args): DriverError;
```

Defined in: packages/core/dist/index.d.mts:1948

###### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `args`    | `object` & `object` |

###### Returns

[`DriverError`](#drivererror)

###### Inherited from

```ts
TaggedError("DriverError")<{ cause: unknown }>.constructor
```

#### Properties

| Property                       | Modifier   | Type            | Inherited from                       | Defined in                                                                                 |
| ------------------------------ | ---------- | --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| <a id="_tag"></a> `_tag`       | `readonly` | `"DriverError"` | `TaggedError("DriverError")._tag`    | packages/core/dist/index.d.mts:1925                                                        |
| <a id="cause"></a> `cause`     | `public`   | `unknown`       | `TaggedError("DriverError").cause`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es2022.error.d.ts:24 |
| <a id="message"></a> `message` | `public`   | `string`        | `TaggedError("DriverError").message` | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1075        |
| <a id="name"></a> `name`       | `public`   | `string`        | `TaggedError("DriverError").name`    | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1074        |
| <a id="stack"></a> `stack?`    | `public`   | `string`        | `TaggedError("DriverError").stack`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1076        |

---

### ForeignKeyViolation

Defined in: [packages/prisma/src/index.ts:44](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L44)

A foreign key constraint was violated (Prisma error `P2003`).

#### Extends

- `TaggedErrorInstance`&lt;`"ForeignKeyViolation"`, \{
  `cause`: `unknown`;
  \}&gt;

#### Constructors

##### Constructor

```ts
new ForeignKeyViolation(args): ForeignKeyViolation;
```

Defined in: packages/core/dist/index.d.mts:1948

###### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `args`    | `object` & `object` |

###### Returns

[`ForeignKeyViolation`](#foreignkeyviolation)

###### Inherited from

```ts
TaggedError("ForeignKeyViolation")<{ cause: unknown }>.constructor
```

#### Properties

| Property                         | Modifier   | Type                    | Inherited from                               | Defined in                                                                                 |
| -------------------------------- | ---------- | ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| <a id="_tag-1"></a> `_tag`       | `readonly` | `"ForeignKeyViolation"` | `TaggedError("ForeignKeyViolation")._tag`    | packages/core/dist/index.d.mts:1925                                                        |
| <a id="cause-1"></a> `cause`     | `public`   | `unknown`               | `TaggedError("ForeignKeyViolation").cause`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es2022.error.d.ts:24 |
| <a id="message-1"></a> `message` | `public`   | `string`                | `TaggedError("ForeignKeyViolation").message` | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1075        |
| <a id="name-1"></a> `name`       | `public`   | `string`                | `TaggedError("ForeignKeyViolation").name`    | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1074        |
| <a id="stack-1"></a> `stack?`    | `public`   | `string`                | `TaggedError("ForeignKeyViolation").stack`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1076        |

---

### RecordNotFound

Defined in: [packages/prisma/src/index.ts:50](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L50)

A record required by the operation does not exist (Prisma error `P2025`) —
the missing row of a `findUniqueOrThrow`, `update`, or `delete`.

#### Extends

- `TaggedErrorInstance`&lt;`"RecordNotFound"`, \{
  `cause`: `unknown`;
  \}&gt;

#### Constructors

##### Constructor

```ts
new RecordNotFound(args): RecordNotFound;
```

Defined in: packages/core/dist/index.d.mts:1948

###### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `args`    | `object` & `object` |

###### Returns

[`RecordNotFound`](#recordnotfound)

###### Inherited from

```ts
TaggedError("RecordNotFound")<{ cause: unknown }>.constructor
```

#### Properties

| Property                         | Modifier   | Type               | Inherited from                          | Defined in                                                                                 |
| -------------------------------- | ---------- | ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| <a id="_tag-2"></a> `_tag`       | `readonly` | `"RecordNotFound"` | `TaggedError("RecordNotFound")._tag`    | packages/core/dist/index.d.mts:1925                                                        |
| <a id="cause-2"></a> `cause`     | `public`   | `unknown`          | `TaggedError("RecordNotFound").cause`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es2022.error.d.ts:24 |
| <a id="message-2"></a> `message` | `public`   | `string`           | `TaggedError("RecordNotFound").message` | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1075        |
| <a id="name-2"></a> `name`       | `public`   | `string`           | `TaggedError("RecordNotFound").name`    | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1074        |
| <a id="stack-2"></a> `stack?`    | `public`   | `string`           | `TaggedError("RecordNotFound").stack`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1076        |

---

### UniqueConstraintViolation

Defined in: [packages/prisma/src/index.ts:38](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L38)

A unique constraint was violated (Prisma error `P2002`).

#### Remarks

`fields` carries the offending column set from the error's `meta.target`
(empty when the driver does not report it).

#### Extends

- `TaggedErrorInstance`&lt;`"UniqueConstraintViolation"`, \{
  `cause`: `unknown`;
  `fields`: readonly `string`[];
  \}&gt;

#### Constructors

##### Constructor

```ts
new UniqueConstraintViolation(args): UniqueConstraintViolation;
```

Defined in: packages/core/dist/index.d.mts:1948

###### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `args`    | `object` & `object` |

###### Returns

[`UniqueConstraintViolation`](#uniqueconstraintviolation)

###### Inherited from

```ts
TaggedError("UniqueConstraintViolation")<{
  fields: readonly string[];
  cause: unknown;
}>.constructor
```

#### Properties

| Property                         | Modifier   | Type                          | Inherited from                                     | Defined in                                                                                                                                               |
| -------------------------------- | ---------- | ----------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="_tag-3"></a> `_tag`       | `readonly` | `"UniqueConstraintViolation"` | `TaggedError("UniqueConstraintViolation")._tag`    | packages/core/dist/index.d.mts:1925                                                                                                                      |
| <a id="cause-3"></a> `cause`     | `public`   | `unknown`                     | `TaggedError("UniqueConstraintViolation").cause`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es2022.error.d.ts:24                                                               |
| <a id="fields"></a> `fields`     | `readonly` | readonly `string`[]           | `TaggedError("UniqueConstraintViolation").fields`  | [packages/prisma/src/index.ts:39](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L39) |
| <a id="message-3"></a> `message` | `public`   | `string`                      | `TaggedError("UniqueConstraintViolation").message` | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1075                                                                      |
| <a id="name-3"></a> `name`       | `public`   | `string`                      | `TaggedError("UniqueConstraintViolation").name`    | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1074                                                                      |
| <a id="stack-3"></a> `stack?`    | `public`   | `string`                      | `TaggedError("UniqueConstraintViolation").stack`   | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1076                                                                      |

## Type Aliases

### CursorPaginationMeta

```ts
type CursorPaginationMeta = object &
  | {
  endCursor: string;
  startCursor: string;
}
  | {
  endCursor: null;
  startCursor: null;
};
```

Defined in: [packages/prisma/src/pagination.ts:20](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/pagination.ts#L20)

The page metadata of `withCursor`.

#### Type Declaration

| Name              | Type      | Defined in                                                                                                                                                         |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hasNextPage`     | `boolean` | [packages/prisma/src/pagination.ts:22](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/pagination.ts#L22) |
| `hasPreviousPage` | `boolean` | [packages/prisma/src/pagination.ts:21](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/pagination.ts#L21) |

#### Remarks

`startCursor` / `endCursor` are the cursors of the page's boundary rows, so
they are `null` together exactly when the page is empty — checking one
narrows the other. They are deliberately NOT coupled to the flags: the last
page has `hasNextPage: false` with a non-null `endCursor`, and an empty page
past the end has `hasPreviousPage: true` with a null `startCursor`.

---

### CursorPaginationOptions

```ts
type CursorPaginationOptions<Row, Cursor> = object &
  | {
  before?: string;
  limit: number;
}
  | {
  before?: never;
  limit: null;
};
```

Defined in: [packages/prisma/src/pagination.ts:44](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/pagination.ts#L44)

Options of `withCursor`, in the style of `prisma-extension-pagination`.

#### Type Declaration

| Name             | Type                   | Description                                                          | Defined in                                                                                                                                                         |
| ---------------- | ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `after?`         | `string`               | An opaque cursor: results strictly AFTER this record.                | [packages/prisma/src/pagination.ts:46](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/pagination.ts#L46) |
| `getCursor()?`   | (`row`) => `string`    | Serialize a row into an opaque cursor. Defaults to `String(row.id)`. | [packages/prisma/src/pagination.ts:48](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/pagination.ts#L48) |
| `parseCursor()?` | (`cursor`) => `Cursor` | Parse an opaque cursor back into the model's `cursor` input.         | [packages/prisma/src/pagination.ts:50](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/pagination.ts#L50) |

#### Type Parameters

| Type Parameter | Description                                          |
| -------------- | ---------------------------------------------------- |
| `Row`          | the (selection-narrowed) result row type.            |
| `Cursor`       | the model's `cursor` input (its unique-where shape). |

#### Remarks

`limit: null` returns everything (from the `after` cursor when given).
Combining `limit: null` with `before` is a compile error — "everything
before the cursor, backwards, unbounded" is not something Prisma's negative
`take` can express.

The default cursor is the record's `id` field, serialized with `String` and
parsed back to a number when it is all digits (autoincrement ids) — a bigint
once it exceeds `Number.MAX_SAFE_INTEGER`, so `BigInt` ids never lose
precision — or kept as a string otherwise (uuid / cuid ids). Provide
`getCursor` / `parseCursor` for composite keys, or when the selection omits
`id`.

---

### CursorPaginator

```ts
type CursorPaginator<Results, Cursor> = object;
```

Defined in: [packages/prisma/src/index.ts:202](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L202)

What `tryPaginate` returns: a builder holding the query, consumed by
`withCursor`.

#### Type Parameters

| Type Parameter                           | Description                                          |
| ---------------------------------------- | ---------------------------------------------------- |
| `Results` _extends_ readonly `unknown`[] | the (selection-narrowed) `findMany` payload.         |
| `Cursor`                                 | the model's `cursor` input (its unique-where shape). |

#### Properties

| Property                             | Modifier   | Type                                                                                                                              | Description                                                                           | Defined in                                                                                                                                                 |
| ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="withcursor"></a> `withCursor` | `readonly` | (`options`) => `AsyncResult`&lt;\[`Results`, [`CursorPaginationMeta`](#cursorpaginationmeta)\], [`DriverError`](#drivererror)&gt; | Run the paginated query: the page and its metadata, or a [DriverError](#drivererror). | [packages/prisma/src/index.ts:207](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L207) |

---

### PrismaQueryError

```ts
type PrismaQueryError =
  | UniqueConstraintViolation
  | ForeignKeyViolation
  | RecordNotFound
  | DriverError;
```

Defined in: [packages/prisma/src/index.ts:71](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L71)

The full union of tagged errors a Prisma query can surface.

#### Remarks

This is the RUNTIME-side union: [qualifyPrismaError](#qualifyprismaerror) maps into it. Each
`try*` method narrows the static type to the codes its operation can
actually hit (a read is typed `DriverError` only).

---

### TransactionIsolationLevel

```ts
type TransactionIsolationLevel =
  | "ReadUncommitted"
  | "ReadCommitted"
  | "RepeatableRead"
  | "Snapshot"
  | "Serializable";
```

Defined in: [packages/prisma/src/index.ts:188](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L188)

The isolation levels Prisma accepts across databases, as a closed union.

#### Remarks

The schema-derived `Prisma.TransactionIsolationLevel` of a generated client
is narrower (it lists only what YOUR database supports), but a shareable
extension cannot name a generated type — this union at least rejects typos
at compile time; a level your database does not support still fails at
runtime as a [DriverError](#drivererror).

## Variables

### unthrownPrisma

```ts
const unthrownPrisma: (client) => PrismaClientExtends<
  InternalArgs<
    {},
    {
      $allModels: {
        tryAggregate: AsyncResult<Result<T, A, "aggregate">, DriverError>;
        tryCount: AsyncResult<Result<T, A, "count">, DriverError>;
        tryCreate: AsyncResult<Result<T, A, "create">, CreateError>;
        tryCreateMany: AsyncResult<Result<T, A, "createMany">, CreateError>;
        tryCreateManyAndReturn: AsyncResult<
          Result<T, A, "createManyAndReturn">,
          CreateError
        >;
        tryDelete: AsyncResult<Result<T, A, "delete">, DeleteError>;
        tryDeleteMany: AsyncResult<Result<T, A, "deleteMany">, DeleteManyError>;
        tryFindFirst: AsyncResult<Result<T, A, "findFirst">, DriverError>;
        tryFindFirstOrThrow: AsyncResult<
          Result<T, A, "findFirstOrThrow">,
          RecordNotFound | DriverError
        >;
        tryFindMany: AsyncResult<Result<T, A, "findMany">, DriverError>;
        tryFindUnique: AsyncResult<Result<T, A, "findUnique">, DriverError>;
        tryFindUniqueOrThrow: AsyncResult<
          Result<T, A, "findUniqueOrThrow">,
          RecordNotFound | DriverError
        >;
        tryGroupBy: AsyncResult<Result<T, A, "groupBy">, DriverError>;
        tryPaginate: CursorPaginator<
          Result<T, A, "findMany">,
          NonNullable<Args<T, "findMany">["cursor"]>
        >;
        tryUpdate: AsyncResult<Result<T, A, "update">, UpdateError>;
        tryUpdateMany: AsyncResult<Result<T, A, "updateMany">, UpdateManyError>;
        tryUpdateManyAndReturn: AsyncResult<
          Result<T, A, "updateManyAndReturn">,
          UpdateManyError
        >;
        tryUpsert: AsyncResult<Result<T, A, "upsert">, UpsertError>;
      };
    },
    {},
    {
      $tryTransaction: AsyncResult<T, PrismaQueryError | E>;
    }
  >
>;
```

Defined in: [packages/prisma/src/index.ts:244](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L244)

The Prisma Client extension. Apply it with `$extends` to add the `try*`
methods to every model delegate, and `$tryTransaction` to the client.

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `client`  | `any` |

#### Returns

`PrismaClientExtends`&lt;`InternalArgs`&lt;\{
\}, \{
`$allModels`: \{
`tryAggregate`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"aggregate"`&gt;, [`DriverError`](#drivererror)&gt;;
`tryCount`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"count"`&gt;, [`DriverError`](#drivererror)&gt;;
`tryCreate`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"create"`&gt;, `CreateError`&gt;;
`tryCreateMany`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"createMany"`&gt;, `CreateError`&gt;;
`tryCreateManyAndReturn`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"createManyAndReturn"`&gt;, `CreateError`&gt;;
`tryDelete`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"delete"`&gt;, `DeleteError`&gt;;
`tryDeleteMany`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"deleteMany"`&gt;, `DeleteManyError`&gt;;
`tryFindFirst`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"findFirst"`&gt;, [`DriverError`](#drivererror)&gt;;
`tryFindFirstOrThrow`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"findFirstOrThrow"`&gt;, [`RecordNotFound`](#recordnotfound) \| [`DriverError`](#drivererror)&gt;;
`tryFindMany`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"findMany"`&gt;, [`DriverError`](#drivererror)&gt;;
`tryFindUnique`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"findUnique"`&gt;, [`DriverError`](#drivererror)&gt;;
`tryFindUniqueOrThrow`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"findUniqueOrThrow"`&gt;, [`RecordNotFound`](#recordnotfound) \| [`DriverError`](#drivererror)&gt;;
`tryGroupBy`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"groupBy"`&gt;, [`DriverError`](#drivererror)&gt;;
`tryPaginate`: [`CursorPaginator`](#cursorpaginator)&lt;`Result`&lt;`T`, `A`, `"findMany"`&gt;, `NonNullable`&lt;`Args`&lt;`T`, `"findMany"`&gt;\[`"cursor"`\]&gt;&gt;;
`tryUpdate`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"update"`&gt;, `UpdateError`&gt;;
`tryUpdateMany`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"updateMany"`&gt;, `UpdateManyError`&gt;;
`tryUpdateManyAndReturn`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"updateManyAndReturn"`&gt;, `UpdateManyError`&gt;;
`tryUpsert`: `AsyncResult`&lt;`Result`&lt;`T`, `A`, `"upsert"`&gt;, `UpsertError`&gt;;
\};
\}, \{
\}, \{
`$tryTransaction`: `AsyncResult`&lt;`T`, [`PrismaQueryError`](#prismaqueryerror) \| `E`&gt;;
\}&gt;&gt;

#### Remarks

Typing follows Prisma's documented `$allModels` pattern: `this: T` binds the
concrete delegate, `Prisma.Exact` checks args, and `Prisma.Result` computes
the payload — so `select` / `include` inference survives the wrap.

#### Example

```ts
import { PrismaClient } from "./generated/prisma/client.ts";
import { unthrownPrisma } from "@unthrown/prisma";

const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

const users = db.user.tryFindMany({ select: { id: true } });
//    ^? AsyncResult<{ id: number }[], DriverError>
```

## Functions

### qualifyPrismaError()

```ts
function qualifyPrismaError(cause): PrismaQueryError;
```

Defined in: [packages/prisma/src/index.ts:121](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/prisma/src/index.ts#L121)

Qualify a Prisma rejection into a tagged error — the runtime half of the
bridge.

#### Parameters

| Parameter | Type      | Description                             |
| --------- | --------- | --------------------------------------- |
| `cause`   | `unknown` | the rejected value from a Prisma query. |

#### Returns

[`PrismaQueryError`](#prismaqueryerror)

#### Remarks

Recognized P-codes map to their dedicated errors (`P2002` →
[UniqueConstraintViolation](#uniqueconstraintviolation), `P2003` → [ForeignKeyViolation](#foreignkeyviolation),
`P2025` → [RecordNotFound](#recordnotfound)); everything else — including non-Prisma
causes — folds into [DriverError](#drivererror) with the cause preserved.
