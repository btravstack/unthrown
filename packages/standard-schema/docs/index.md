**@unthrown/standard-schema**

---

# @unthrown/standard-schema

## Type Aliases

### SchemaIssues

```ts
type SchemaIssues = readonly StandardSchemaV1.Issue[];
```

Defined in: [index.ts:21](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/standard-schema/src/index.ts#L21)

The error channel both entry points produce: a schema's validation issues.

## Functions

### fromSchema()

```ts
function fromSchema<S>(schema): (input) => Result<InferOutput<S>, SchemaIssues>;
```

Defined in: [index.ts:63](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/standard-schema/src/index.ts#L63)

Turn a **synchronous** Standard Schema into a validator returning a
`Result`.

#### Type Parameters

| Type Parameter                                               | Description      |
| ------------------------------------------------------------ | ---------------- |
| `S` _extends_ `StandardSchemaV1`&lt;`unknown`, `unknown`&gt; | the schema type. |

#### Parameters

| Parameter | Type | Description                  |
| --------- | ---- | ---------------------------- |
| `schema`  | `S`  | a Standard Schema validator. |

#### Returns

a function mapping an input to `Result<Output, SchemaIssues>`.

(`input`) => `Result`&lt;`InferOutput`&lt;`S`&gt;, [`SchemaIssues`](#schemaissues)&gt;

#### Remarks

Validation issues are the modeled error `E` — `Result<Output, SchemaIssues>` —
because a failed validation is an _anticipated_ outcome, not a Defect. Works
with any Standard Schema implementation (Zod, Valibot, ArkType, …).

A validator that **throws** (rather than returning issues) becomes a `Defect`
— the same boundary behaviour as `fromThrowable`, so an unexpected crash never
escapes as a raw exception. If the schema validates **asynchronously**
(its `validate` returns a `Promise`), a synchronous `Result` cannot represent
the pending work, so this throws a `TypeError` — a deliberate usage error; use
[fromSchemaAsync](#fromschemaasync) instead.

#### Example

```ts
import { fromSchema } from "@unthrown/standard-schema";
const parse = fromSchema(z.string());
parse("hi").get(); // "hi"
parse(42).getErr(); // the issues array
```

---

### fromSchemaAsync()

```ts
function fromSchemaAsync<S>(
  schema,
): (input) => AsyncResult<InferOutput<S>, SchemaIssues>;
```

Defined in: [index.ts:113](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/standard-schema/src/index.ts#L113)

Turn a Standard Schema (sync **or** async) into a validator returning an
`AsyncResult`.

#### Type Parameters

| Type Parameter                                               | Description      |
| ------------------------------------------------------------ | ---------------- |
| `S` _extends_ `StandardSchemaV1`&lt;`unknown`, `unknown`&gt; | the schema type. |

#### Parameters

| Parameter | Type | Description                  |
| --------- | ---- | ---------------------------- |
| `schema`  | `S`  | a Standard Schema validator. |

#### Returns

a function mapping an input to `AsyncResult<Output, SchemaIssues>`.

(`input`) => `AsyncResult`&lt;`InferOutput`&lt;`S`&gt;, [`SchemaIssues`](#schemaissues)&gt;

#### Remarks

The async counterpart of [fromSchema](#fromschema): it awaits the schema's
`validate`, so it accepts both synchronous and asynchronous schemas. As with
every `AsyncResult`, the returned value never rejects — a validator that
_throws_ (rather than returning issues) becomes a `Defect`.

#### Example

```ts
import { fromSchemaAsync } from "@unthrown/standard-schema";
const parse = fromSchemaAsync(asyncSchema);
(await parse(input)).match({ ok, errCases, defect });
```
