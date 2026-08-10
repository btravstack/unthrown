**@unthrown/effect**

---

# @unthrown/effect

## Functions

### fromEffect()

```ts
function fromEffect<T, E>(effect): AsyncResult<T, E>;
```

Defined in: [index.ts:214](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/effect/src/index.ts#L214)

Run an `Effect` and collect its outcome as an `AsyncResult`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type                     | Description        |
| --------- | ------------------------ | ------------------ |
| `effect`  | `Effect`&lt;`T`, `E`&gt; | the effect to run. |

#### Returns

`AsyncResult`&lt;`T`, `E`&gt;

#### Remarks

The effect must need no environment (`R = never`). It is run to an `Exit`
(which never rejects), then folded with [fromExit](#fromexit): success → `Ok`, a
modeled failure → `Err`, a die/interruption → `Defect`. The returned
`AsyncResult` never throws when awaited.

#### Example

```ts
import { Effect } from "effect";
import { fromEffect } from "@unthrown/effect";

const result = await fromEffect(Effect.succeed(1));
result.isOk(); // => true
```

---

### fromEither()

```ts
function fromEither<T, E>(either): Result<T, E>;
```

Defined in: [index.ts:150](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/effect/src/index.ts#L150)

Convert an Effect `Either` into a `Result`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type                     | Description            |
| --------- | ------------------------ | ---------------------- |
| `either`  | `Either`&lt;`T`, `E`&gt; | the either to convert. |

#### Returns

`Result`&lt;`T`, `E`&gt;

#### Remarks

`Right → Ok`, `Left → Err`. An `Either` carries no Defect, so the result is
never a `Defect`.

#### Example

```ts
import { Either } from "effect";
import { fromEither } from "@unthrown/effect";

const result = fromEither(Either.right(1));
result.isOk(); // => true
```

---

### fromExit()

```ts
function fromExit<T, E>(exit): Result<T, E>;
```

Defined in: [index.ts:80](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/effect/src/index.ts#L80)

Convert an Effect `Exit` into a `Result` — the inverse of
[toExit](#toexit).

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type                   | Description          |
| --------- | ---------------------- | -------------------- |
| `exit`    | `Exit`&lt;`T`, `E`&gt; | the exit to convert. |

#### Returns

`Result`&lt;`T`, `E`&gt;

#### Remarks

`Exit.Success → Ok`. For a failure, the enclosing `Cause` is reduced:

- a `Cause.die` becomes a `Defect`,
- otherwise a `Cause.fail` becomes the modeled `Err`,
- a pure interruption (or empty cause) becomes a `Defect`.

A `Defect` **dominates** a modeled failure in a composite cause — the same
rule unthrown's `all` uses, on the principle that an unexpected failure is the
more severe signal.

#### Example

```ts
import { Exit } from "effect";
import { fromExit } from "@unthrown/effect";

const result = fromExit(Exit.succeed(1));
result.isOk(); // => true
```

---

### toEffect()

#### Call Signature

```ts
function toEffect<T, E>(source): Effect<T, E>;
```

Defined in: [index.ts:180](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/effect/src/index.ts#L180)

Lift a `Result` or `AsyncResult` into an `Effect`.

##### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

##### Parameters

| Parameter | Type                     | Description                           |
| --------- | ------------------------ | ------------------------------------- |
| `source`  | `Result`&lt;`T`, `E`&gt; | the result, or async result, to lift. |

##### Returns

`Effect`&lt;`T`, `E`&gt;

##### Remarks

`Ok → Effect.succeed`, `Err → Effect.fail`, `Defect → Effect.die`. The
resulting `Effect` needs no environment (`R = never`). An `AsyncResult` is
awaited inside the effect (it never rejects), so this is the `AsyncResult →
Effect` direction too.

##### Example

```ts
import { Effect } from "effect";
import { Ok } from "unthrown";
import { toEffect } from "@unthrown/effect";

const effect = toEffect(Ok(1));
await Effect.runPromise(effect); // => 1
```

#### Call Signature

```ts
function toEffect<T, E>(source): Effect<T, E>;
```

Defined in: [index.ts:181](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/effect/src/index.ts#L181)

Lift a `Result` or `AsyncResult` into an `Effect`.

##### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

##### Parameters

| Parameter | Type                          | Description                           |
| --------- | ----------------------------- | ------------------------------------- |
| `source`  | `AsyncResult`&lt;`T`, `E`&gt; | the result, or async result, to lift. |

##### Returns

`Effect`&lt;`T`, `E`&gt;

##### Remarks

`Ok → Effect.succeed`, `Err → Effect.fail`, `Defect → Effect.die`. The
resulting `Effect` needs no environment (`R = never`). An `AsyncResult` is
awaited inside the effect (it never rejects), so this is the `AsyncResult →
Effect` direction too.

##### Example

```ts
import { Effect } from "effect";
import { Ok } from "unthrown";
import { toEffect } from "@unthrown/effect";

const effect = toEffect(Ok(1));
await Effect.runPromise(effect); // => 1
```

---

### toEither()

```ts
function toEither<T, E>(result, onDefect): Either<T, E>;
```

Defined in: [index.ts:121](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/effect/src/index.ts#L121)

Convert a `Result` into an Effect `Either`, triaging any Defect.

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

`Either`&lt;`T`, `E`&gt;

#### Remarks

`Either` has no Defect channel, so a `Defect` cannot pass through silently —
`onDefect` **must** fold its cause into a modeled error `E` (a `Left`). This
is the boundary-qualification rule (Thesis #3) applied on the way out:
`Ok → Right`, `Err → Left`, `Defect → Left(onDefect(cause))`.

#### Example

```ts
import { fromThrowable } from "unthrown";
import { toEither } from "@unthrown/effect";

// Mint a Defect, then convert: it has no home in Either, so onDefect folds it into E.
const defective = fromThrowable(
  (): number => {
    throw new Error("boom");
  },
  (cause, defect) => defect(cause),
)();
const either = toEither(defective, (cause) => `bug: ${String(cause)}`);
either._tag; // => "Left" — carrying "bug: Error: boom"
```

---

### toExit()

```ts
function toExit<T, E>(result): Exit<T, E>;
```

Defined in: [index.ts:43](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/effect/src/index.ts#L43)

Convert a `Result` into an Effect `Exit` — a **bijection**, since both
carry three channels.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type                     | Description            |
| --------- | ------------------------ | ---------------------- |
| `result`  | `Result`&lt;`T`, `E`&gt; | the result to convert. |

#### Returns

`Exit`&lt;`T`, `E`&gt;

#### Remarks

`Ok → Exit.succeed`, `Err → Exit.fail` (a modeled `Cause.fail`), and
`Defect → Exit.die` (an unexpected `Cause.die`). Round-trips with
[fromExit](#fromexit).

#### Example

```ts
import { Ok } from "unthrown";
import { toExit } from "@unthrown/effect";
toExit(Ok(1)); // Exit.succeed(1)
```
