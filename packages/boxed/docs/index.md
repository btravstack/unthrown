**@unthrown/boxed**

---

# @unthrown/boxed

## Functions

### fromBoxed()

```ts
function fromBoxed<T, E>(result): Result<T, E>;
```

Defined in: [index.ts:78](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/boxed/src/index.ts#L78)

Convert a Boxed `Result` into a `Result`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type                     | Description                  |
| --------- | ------------------------ | ---------------------------- |
| `result`  | `Result`&lt;`T`, `E`&gt; | the Boxed result to convert. |

#### Returns

`Result`&lt;`T`, `E`&gt;

#### Remarks

`Result.Ok → Ok`, `Result.Error → Err`. Boxed's `Result` carries no Defect, so
the result is never a `Defect`.

#### Example

```ts
import { Result as BoxedResult } from "@bloodyowl/boxed";
import { fromBoxed } from "@unthrown/boxed";

const result = fromBoxed(BoxedResult.Ok(1));
result.isOk(); // => true
```

---

### fromBoxedFuture()

```ts
function fromBoxedFuture<T, E>(future): AsyncResult<T, E>;
```

Defined in: [index.ts:164](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/boxed/src/index.ts#L164)

Convert a Boxed `Future<Result>` into an `AsyncResult`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type                                     | Description                  |
| --------- | ---------------------------------------- | ---------------------------- |
| `future`  | `Future`&lt;`Result`&lt;`T`, `E`&gt;&gt; | the Boxed future to convert. |

#### Returns

`AsyncResult`&lt;`T`, `E`&gt;

#### Remarks

The async counterpart of [fromBoxed](#fromboxed). A `Result.Error` inside the future
stays an `Err`. Boxed's `Future` has no failure channel of its own —
`Future.toPromise()` does not reject — so in practice no `Defect` arises here;
the `fromSafePromise` boundary is a defensive net that would only capture one
if a future somehow rejected. The returned `AsyncResult` never throws when
awaited.

#### Example

```ts
import { Future, Result as BoxedResult } from "@bloodyowl/boxed";
import { fromBoxedFuture } from "@unthrown/boxed";

const result = await fromBoxedFuture(Future.value(BoxedResult.Ok(1)));
result.isOk(); // => true
```

---

### toBoxed()

```ts
function toBoxed<T, E>(result, onDefect): Result<T, E>;
```

Defined in: [index.ts:46](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/boxed/src/index.ts#L46)

Convert a `Result` into a Boxed `Result`, triaging any Defect.

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

Boxed's `Result` has no Defect channel, so `onDefect` **must** fold a
`Defect`'s cause into a modeled error `E` (an `Error`). `Ok → Result.Ok`,
`Err → Result.Error`, `Defect → Result.Error(onDefect(cause))`.

#### Example

```ts
import { fromThrowable } from "unthrown";
import { toBoxed } from "@unthrown/boxed";

// Mint a Defect, then convert: it has no home in Boxed's Result, so onDefect folds it into E.
const defective = fromThrowable(
  (): number => {
    throw new Error("boom");
  },
  (cause, defect) => defect(cause),
)();
const boxed = toBoxed(defective, (cause) => `bug: ${String(cause)}`);
boxed.isError(); // => true — the Error carries "bug: Error: boom"
```

---

### toBoxedFuture()

```ts
function toBoxedFuture<T, E>(asyncResult, onDefect): Future<Result<T, E>>;
```

Defined in: [index.ts:114](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/boxed/src/index.ts#L114)

Convert an `AsyncResult` into a Boxed `Future<Result>`, triaging any
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

`Future`&lt;`Result`&lt;`T`, `E`&gt;&gt;

#### Remarks

The async counterpart of [toBoxed](#toboxed): `onDefect` is required for the same
reason. The `AsyncResult` is awaited (it never rejects) and its settled
`Result` is converted, then resolved into the `Future`.

`onDefect` must not throw: Boxed's `Future` has no failure channel, so a
throw is re-raised out-of-band (uncaught) rather than left as a hung
`Future`.

#### Example

```ts
import { fromSafePromise } from "unthrown";
import { toBoxedFuture } from "@unthrown/boxed";

// A rejection inside fromSafePromise is a Defect; onDefect folds it into E on the way out.
const defective = fromSafePromise(Promise.reject(new Error("boom")));
const future = toBoxedFuture(defective, (cause) => `bug: ${String(cause)}`);
(await future.toPromise()).isError(); // => true — the Error carries "bug: Error: boom"
```
