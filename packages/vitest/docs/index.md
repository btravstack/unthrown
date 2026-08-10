**@unthrown/vitest**

---

# @unthrown/vitest

## Type Aliases

### UnthrownMatchers

```ts
type UnthrownMatchers<R> = object;
```

Defined in: [index.ts:361](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L361)

The matchers `@unthrown/vitest` contributes to Vitest's `expect`. For an
`AsyncResult`, `await` the assertion; `toBeOkWith` compares deeply.

#### Remarks

Import the package once (e.g. in a test setup file) to register the
matchers and pull in this type augmentation.

For an `AsyncResult` the assertion is asynchronous and must be `await`ed.
A forgotten `await` does not pass silently: an `afterEach` hook (registered
on import, see [failOnForgottenAwait](#failonforgottenawait)) fails the test with an explicit
message naming the matchers still pending when the test ended.

#### Example

```ts
import "@unthrown/vitest";
import { Ok, fromSafePromise } from "unthrown";
import { expect, test } from "vitest";

test("sync", () => {
  expect(Ok(1)).toBeOkWith(1);
});

test("async", async () => {
  await expect(fromSafePromise(Promise.resolve(1))).toBeOk();
});
```

#### See

[The Testing guide](https://btravstack.github.io/unthrown/how-to/test-with-vitest)

#### Type Parameters

| Type Parameter | Default type | Description                           |
| -------------- | ------------ | ------------------------------------- |
| `R`            | `unknown`    | the assertion's chaining return type. |

#### Properties

| Property                                   | Type                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Defined in                                                                                                                             |
| ------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="tobedefect"></a> `toBeDefect`       | () => `R`                   | `expect(result).toBeDefect()` asserts the result is a `Defect`.                                                                                                                                                                                                                                                                                                                                                                                             | [index.ts:381](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L381) |
| <a id="tobeerr"></a> `toBeErr`             | () => `R`                   | `expect(Err("nope")).toBeErr()` asserts the result is `Err`, regardless of the error.                                                                                                                                                                                                                                                                                                                                                                       | [index.ts:367](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L367) |
| <a id="tobeerrtagged"></a> `toBeErrTagged` | (`tag`, `expected?`) => `R` | Assert an `Err` whose error has `_tag === tag`. Optionally pass `expected` to also match the error's payload (its own props minus `_tag`/`name`): a plain object matches exactly, an asymmetric matcher (e.g. `expect.objectContaining(...)`) matches partially. An explicitly-passed `undefined` asserts the payload equals `undefined` (it does not degrade to tag-only). `expect(result).toBeErrTagged("NotFound", { id })` asserts the tag and payload. | [index.ts:378](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L378) |
| <a id="tobeerrwith"></a> `toBeErrWith`     | (`expected`) => `R`         | -                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [index.ts:379](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L379) |
| <a id="tobeok"></a> `toBeOk`               | () => `R`                   | `expect(Ok(1)).toBeOk()` asserts the result is `Ok`, regardless of value.                                                                                                                                                                                                                                                                                                                                                                                   | [index.ts:363](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L363) |
| <a id="tobeokwith"></a> `toBeOkWith`       | (`value`) => `R`            | `expect(Ok(1)).toBeOkWith(1)` asserts the result is `Ok` with a deeply-equal value.                                                                                                                                                                                                                                                                                                                                                                         | [index.ts:365](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L365) |

## Functions

### failOnForgottenAwait()

```ts
function failOnForgottenAwait(context?): void;
```

Defined in: [index.ts:167](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L167)

The check behind the registered `afterEach` hook: when async matcher
assertions are still pending at the end of a test — a forgotten `await` —
it abandons them (so they cannot late-fire as unhandled rejections) and
throws an error naming the un-awaited matchers, failing that test.

#### Parameters

| Parameter  | Type          |
| ---------- | ------------- |
| `context?` | `HookContext` |

#### Returns

`void`

#### Remarks

You never need to call this yourself: importing the package registers it as
an `afterEach` hook alongside the matchers. It is exported so the mechanism
itself is testable.

---

### toBeDefect()

```ts
function toBeDefect(this, received): ExpectationResult;
```

Defined in: [index.ts:311](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L311)

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `this`     | `MatcherState` |
| `received` | `unknown`      |

#### Returns

`ExpectationResult`

---

### toBeErr()

```ts
function toBeErr(this, received): ExpectationResult;
```

Defined in: [index.ts:240](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L240)

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `this`     | `MatcherState` |
| `received` | `unknown`      |

#### Returns

`ExpectationResult`

---

### toBeErrTagged()

```ts
function toBeErrTagged(this, received, tag, expected?): ExpectationResult;
```

Defined in: [index.ts:269](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L269)

#### Parameters

| Parameter   | Type           |
| ----------- | -------------- |
| `this`      | `MatcherState` |
| `received`  | `unknown`      |
| `tag`       | `string`       |
| `expected?` | `unknown`      |

#### Returns

`ExpectationResult`

---

### toBeErrWith()

```ts
function toBeErrWith(this, received, expected): ExpectationResult;
```

Defined in: [index.ts:254](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L254)

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `this`     | `MatcherState` |
| `received` | `unknown`      |
| `expected` | `unknown`      |

#### Returns

`ExpectationResult`

---

### toBeOk()

```ts
function toBeOk(this, received): ExpectationResult;
```

Defined in: [index.ts:211](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L211)

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `this`     | `MatcherState` |
| `received` | `unknown`      |

#### Returns

`ExpectationResult`

---

### toBeOkWith()

```ts
function toBeOkWith(this, received, expected): ExpectationResult;
```

Defined in: [index.ts:225](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/vitest/src/index.ts#L225)

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `this`     | `MatcherState` |
| `received` | `unknown`      |
| `expected` | `unknown`      |

#### Returns

`ExpectationResult`
