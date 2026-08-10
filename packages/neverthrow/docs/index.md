**@unthrown/neverthrow**

---

# @unthrown/neverthrow

## Functions

### fromNeverthrow()

```ts
function fromNeverthrow<T, E>(result): Result<T, E>;
```

Defined in: [index.ts:83](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/neverthrow/src/index.ts#L83)

Convert a neverthrow `Result` into a `Result`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type                     | Description                       |
| --------- | ------------------------ | --------------------------------- |
| `result`  | `Result`&lt;`T`, `E`&gt; | the neverthrow result to convert. |

#### Returns

`Result`&lt;`T`, `E`&gt;

#### Remarks

`Ok → Ok`, `Err → Err`. neverthrow carries no Defect, so the result is never a
`Defect`.

#### Example

```ts
import { ok } from "neverthrow";
import { fromNeverthrow } from "@unthrown/neverthrow";

const result = fromNeverthrow(ok(1));
result.isOk(); // => true
```

---

### fromNeverthrowAsync()

```ts
function fromNeverthrowAsync<T, E>(resultAsync): AsyncResult<T, E>;
```

Defined in: [index.ts:146](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/neverthrow/src/index.ts#L146)

Convert a neverthrow `ResultAsync` into an `AsyncResult`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter     | Type                          | Description                             |
| ------------- | ----------------------------- | --------------------------------------- |
| `resultAsync` | `ResultAsync`&lt;`T`, `E`&gt; | the neverthrow async result to convert. |

#### Returns

`AsyncResult`&lt;`T`, `E`&gt;

#### Remarks

The async counterpart of [fromNeverthrow](#fromneverthrow). A modeled `Err` stays an
`Err`; an _unexpected_ rejection inside the neverthrow chain becomes a
`Defect`. The returned `AsyncResult` never throws when awaited.

#### Example

```ts
import { okAsync } from "neverthrow";
import { fromNeverthrowAsync } from "@unthrown/neverthrow";

const result = await fromNeverthrowAsync(okAsync(1));
result.isOk(); // => true
```

---

### toNeverthrow()

```ts
function toNeverthrow<T, E>(result, onDefect): Result<T, E>;
```

Defined in: [index.ts:51](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/neverthrow/src/index.ts#L51)

Convert a `Result` into a neverthrow `Result`, triaging any Defect.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter  | Type                     | Description                                        |
| ---------- | ------------------------ | -------------------------------------------------- |
| `result`   | `Result`&lt;`T`, `E`&gt; | the result to convert.                             |
| `onDefect` | (`cause`) => `E`         | folds a Defect's unknown cause into a modeled `E`. |

#### Returns

`Result`&lt;`T`, `E`&gt;

#### Remarks

neverthrow has no Defect channel, so `onDefect` **must** fold a `Defect`'s
cause into a modeled error `E` (an `Err`). `Ok → Ok`, `Err → Err`,
`Defect → Err(onDefect(cause))`.

#### Example

```ts
import { fromThrowable } from "unthrown";
import { toNeverthrow } from "@unthrown/neverthrow";

// Mint a Defect, then convert: it has no home in neverthrow, so onDefect folds it into E.
const defective = fromThrowable(
  (): number => {
    throw new Error("boom");
  },
  (cause, defect) => defect(cause),
)();
const nt = toNeverthrow(defective, (cause) => `bug: ${String(cause)}`);
nt.isErr(); // => true — the Err carries "bug: Error: boom"
```

---

### toNeverthrowAsync()

```ts
function toNeverthrowAsync<T, E>(asyncResult, onDefect): ResultAsync<T, E>;
```

Defined in: [index.ts:116](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/neverthrow/src/index.ts#L116)

Convert an `AsyncResult` into a neverthrow `ResultAsync`, triaging any
Defect.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter     | Type                          | Description                                        |
| ------------- | ----------------------------- | -------------------------------------------------- |
| `asyncResult` | `AsyncResult`&lt;`T`, `E`&gt; | the async result to convert.                       |
| `onDefect`    | (`cause`) => `E`              | folds a Defect's unknown cause into a modeled `E`. |

#### Returns

`ResultAsync`&lt;`T`, `E`&gt;

#### Remarks

The async counterpart of [toNeverthrow](#toneverthrow): `onDefect` is required for the
same reason. The `AsyncResult` is awaited (it never rejects) and each settled
`Result` is converted.

A throwing `onDefect` surfaces as a rejection of the returned
`ResultAsync`'s inner promise — neverthrow's own failure mode; do not throw
from triage.

#### Example

```ts
import { fromSafePromise } from "unthrown";
import { toNeverthrowAsync } from "@unthrown/neverthrow";

// A rejection inside fromSafePromise is a Defect; onDefect folds it into E on the way out.
const defective = fromSafePromise(Promise.reject(new Error("boom")));
const result = await toNeverthrowAsync(
  defective,
  (cause) => `bug: ${String(cause)}`,
);
result.isErr(); // => true — the Err carries "bug: Error: boom"
```
