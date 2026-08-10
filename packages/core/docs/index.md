**unthrown**

---

# unthrown

## Facade

### AsyncResult

```ts
type AsyncResult<T, E> = AsyncResultType<T, E>;
```

Defined in: [packages/core/src/facade.ts:111](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L111)

`AsyncResult<T, E>` — the async counterpart of [Result](#result-1). Shares its name
with the [companion object](#asyncresult-1) above (value and type are one
name); this is the type half.

#### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |
| `E`            |

#### Remarks

`AsyncResult` carries the async fluent surface; its combinators (`map`,
`flatMap`, `match`, `get`, …) are documented one per entry — with their
async signatures — on [AsyncResultMethods](#asyncresultmethods). For "which one do I reach
for?", see the [Choosing a combinator](/reference/combinators) guide.

---

### Result

```ts
type Result<T, E> = ResultType<T, E>;
```

Defined in: [packages/core/src/facade.ts:49](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L49)

`Result<T, E>` — the core discriminated union. Shares its name with the
[companion object](#result-1) above (the value and type are one name); this
is the type half.

#### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |
| `E`            |

#### Remarks

A `Result` is a discriminated union, so TypeDoc can't list its methods on this
alias. Its fluent combinators (`map`, `flatMap`, `match`, `get`, …) are
documented one per entry on [ResultMethods](#resultmethods) — the shared method surface
every variant carries. For "which one do I reach for?", see the
[Choosing a combinator](/reference/combinators) guide.

---

### AsyncResult

```ts
const AsyncResult: object;
```

Defined in: [packages/core/src/facade.ts:111](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L111)

Companion object grouping the **`AsyncResult`-producing** entry points under
the matching namespace: [AsyncResult.Ok](#property-ok), [AsyncResult.Err](#property-err),
[AsyncResult.Do](#property-do), [AsyncResult.fromPromise](#property-frompromise),
[AsyncResult.fromSafePromise](#property-fromsafepromise), [AsyncResult.all](#property-all),
[AsyncResult.allFromDict](#property-allfromdict).

#### Type Declaration

#### Constructors

| Name                              | Type                                                                                                      | Default value | Defined in                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-err"></a> `Err()` | &lt;`E`&gt;(`error`) => `AsyncResult`&lt;`never`, `E`&gt;                                                 | `ErrAsync`    | [packages/core/src/facade.ts:113](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L113) |
| <a id="property-ok"></a> `Ok()`   | \{ (): `AsyncResult`&lt;`void`, `never`&gt;; &lt;`T`&gt; (`value`): `AsyncResult`&lt;`T`, `never`&gt;; \} | `OkAsync`     | [packages/core/src/facade.ts:112](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L112) |

#### Interop

| Name                                                      | Type                                                                                                            | Defined in                                                                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-frompromise"></a> `fromPromise()`         | &lt;`T`, `R`&gt;(`promise`, `qualify`, ...`_guard`) => `AsyncResult`&lt;`T`, `Exclude`&lt;`R`, `Defect`&gt;&gt; | [packages/core/src/facade.ts:115](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L115) |
| <a id="property-fromsafepromise"></a> `fromSafePromise()` | &lt;`T`&gt;(`promise`) => `AsyncResult`&lt;`T`, `never`&gt;                                                     | [packages/core/src/facade.ts:116](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L116) |

#### Do-notation

| Name                            | Type                                      | Default value | Defined in                                                                                                                                               |
| ------------------------------- | ----------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-do"></a> `Do()` | () => `AsyncResult`&lt;\{ \}, `never`&gt; | `DoAsync`     | [packages/core/src/facade.ts:114](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L114) |

#### Aggregate

| Name                                              | Type                                                                                                                                                                                      | Default value      | Defined in                                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-all"></a> `all()`                 | &lt;`Rs`&gt;(`results`) => `AsyncResult`&lt;`AllOk`&lt;`Rs`, \{ \[K in string \| number \| symbol\]: AsyncOkOf\<Rs\[K\]\> \}&gt;, [`AsyncErrOf`](#asyncerrof)&lt;`Rs`\[`number`\]&gt;&gt; | `allAsync`         | [packages/core/src/facade.ts:117](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L117) |
| <a id="property-allfromdict"></a> `allFromDict()` | &lt;`R`&gt;(`results`) => `AsyncResult`&lt;\{ \[K in string \| number \| symbol\]: AsyncOkOf\<R\[K\]\> \}, [`AsyncErrOf`](#asyncerrof)&lt;`R`\[keyof `R`\]&gt;&gt;                        | `allFromDictAsync` | [packages/core/src/facade.ts:118](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L118) |

#### Remarks

The async sibling of [Result](#result-1). Statics are grouped by what they
**return**, so the pre-lifted constructors, `fromPromise`/`fromSafePromise`,
and the async aggregates sit here rather than on [Result](#result-1); the namespace
already conveys "async", so the members drop the `Async` suffix their free
functions carry (`AsyncResult.Ok` is `OkAsync`; `AsyncResult.Err` is
`ErrAsync`; `AsyncResult.Do` is `DoAsync`; `AsyncResult.all` is `allAsync`;
`AsyncResult.allFromDict` is
`allFromDictAsync`). Like [Result](#result-1), the free functions remain the
primary, tree-shakeable API; the value `AsyncResult` and the type
[AsyncResult](#asyncresult-1) share one name.

#### Example

```ts
import { AsyncResult } from "unthrown";
const user = await AsyncResult.fromPromise(fetchUser(id), (c, defect) =>
  defect(c),
);
user.get(); // => the fetched user (on success)
```

---

### Result

```ts
const Result: object;
```

Defined in: [packages/core/src/facade.ts:49](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L49)

Companion object grouping the **`Result`-producing** entry points under a
single, discoverable namespace: [Result.Ok](#property-ok-1), [Result.Err](#property-err-1),
[Result.Do](#property-do-1), [Result.fromNullable](#property-fromnullable), [Result.fromThrowable](#property-fromthrowable),
[Result.fromSafeThrowable](#property-fromsafethrowable), [Result.all](#property-all-1),
[Result.allFromDict](#property-allfromdict-1), [Result.isOk](#property-isok), [Result.isErr](#property-iserr),
[Result.isDefect](#property-isdefect), [Result.isResult](#property-isresult).

#### Type Declaration

#### Constructors

| Name                                | Type                                                                                            | Defined in                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="property-err-1"></a> `Err()` | &lt;`E`&gt;(`error`) => `Result`&lt;`never`, `E`&gt;                                            | [packages/core/src/facade.ts:51](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L51) |
| <a id="property-ok-1"></a> `Ok()`   | \{ (): `Result`&lt;`void`, `never`&gt;; &lt;`T`&gt; (`value`): `Result`&lt;`T`, `never`&gt;; \} | [packages/core/src/facade.ts:50](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L50) |

#### Interop

| Name                                                          | Type                                                                                                         | Defined in                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="property-fromnullable"></a> `fromNullable()`           | &lt;`T`, `E`&gt;(`value`, `onAbsent`) => `Result`&lt;`NonNullable`&lt;`T`&gt;, `E`&gt;                       | [packages/core/src/facade.ts:53](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L53) |
| <a id="property-fromsafethrowable"></a> `fromSafeThrowable()` | &lt;`A`, `T`&gt;(`fn`) => (...`args`) => `Result`&lt;`T`, `never`&gt;                                        | [packages/core/src/facade.ts:55](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L55) |
| <a id="property-fromthrowable"></a> `fromThrowable()`         | &lt;`A`, `T`, `R`&gt;(`fn`, `qualify`) => (...`args`) => `Result`&lt;`T`, `Exclude`&lt;`R`, `Defect`&gt;&gt; | [packages/core/src/facade.ts:54](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L54) |

#### Do-notation

| Name                              | Type                                 | Defined in                                                                                                                                             |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="property-do-1"></a> `Do()` | () => `Result`&lt;\{ \}, `never`&gt; | [packages/core/src/facade.ts:52](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L52) |

#### Guards

| Name                                        | Type                                             | Defined in                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="property-isdefect"></a> `isDefect()` | &lt;`T`, `E`&gt;(`r`) => `r is DefectView<T, E>` | [packages/core/src/facade.ts:60](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L60) |
| <a id="property-iserr"></a> `isErr()`       | &lt;`T`, `E`&gt;(`r`) => `r is ErrView<E, T>`    | [packages/core/src/facade.ts:59](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L59) |
| <a id="property-isok"></a> `isOk()`         | &lt;`T`, `E`&gt;(`r`) => `r is OkView<T, E>`     | [packages/core/src/facade.ts:58](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L58) |
| <a id="property-isresult"></a> `isResult()` | (`x`) => `x is Result<unknown, unknown>`         | [packages/core/src/facade.ts:61](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L61) |

#### Aggregate

| Name                                                | Type                                                                                                                                                                  | Defined in                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="property-all-1"></a> `all()`                 | &lt;`Rs`&gt;(`results`) => `Result`&lt;`AllOk`&lt;`Rs`, \{ \[K in string \| number \| symbol\]: OkOf\<Rs\[K\]\> \}&gt;, [`ErrOf`](#errof)&lt;`Rs`\[`number`\]&gt;&gt; | [packages/core/src/facade.ts:56](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L56) |
| <a id="property-allfromdict-1"></a> `allFromDict()` | &lt;`R`&gt;(`results`) => `Result`&lt;\{ \[K in string \| number \| symbol\]: OkOf\<R\[K\]\> \}, [`ErrOf`](#errof)&lt;`R`\[keyof `R`\]&gt;&gt;                        | [packages/core/src/facade.ts:57](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/facade.ts#L57) |

#### Remarks

Purely additive sugar — each member **is** the corresponding free function.
The free functions remain the primary, tree-shakeable API; importing only
`{ Ok }` never pulls this object in. The value `Result` and the type
[Result](#result-1) share one name (the companion-object pattern).

The **async** entry points live on the sibling [AsyncResult](#asyncresult-1) companion
(`AsyncResult.fromPromise`, `AsyncResult.all`, …), grouped by what they
return — a static lives in exactly one namespace.

#### Example

```ts
import { Result } from "unthrown";
Result.Ok(1)
  .flatMap((n) => Result.Ok(n + 1))
  .get(); // => 2
```

## Types

### DefectView

Defined in: [packages/core/src/types.ts:630](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L630)

The `Defect` variant of a [Result](#result): an unmodeled failure carrying a
`cause`. This is what a successful `isDefect` guard narrows to, exposing
`.cause`. It also carries the shared fluent surface ([ResultMethods](#resultmethods)).

#### Example

```ts
if (r.isDefect()) r.cause; // r: DefectView<T, E> here — .cause is `unknown`
```

#### Extends

- [`ResultMethods`](#resultmethods)&lt;`T`, `E`&gt;

#### Type Parameters

| Type Parameter | Default type |
| -------------- | ------------ |
| `T`            | `never`      |
| `E`            | `never`      |

#### Properties

| Property                     | Modifier   | Type       | Defined in                                                                                                                                             |
| ---------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="cause-2"></a> `cause` | `readonly` | `unknown`  | [packages/core/src/types.ts:632](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L632) |
| <a id="tag"></a> `tag`       | `readonly` | `"Defect"` | [packages/core/src/types.ts:631](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L631) |

#### Methods

##### as()

```ts
as<U>(value): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:213](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L213)

Replace the success value with a constant `value`.

Runs only on `Ok`; `Err` and `Defect` pass through.

###### Type Parameters

| Type Parameter | Description                 |
| -------------- | --------------------------- |
| `U`            | the replacement value type. |

###### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `U`  |

###### Returns

`Result`&lt;`U`, `E`&gt;

###### Inherited from

```ts
ResultMethods.as;
```

##### bind()

```ts
bind<K, U, E2>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E | E2>;
```

Defined in: [packages/core/src/types.ts:186](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L186)

Do-notation: run `f` for a `Result` and **bind its value** under `name` in
an accumulating object scope.

###### Type Parameters

| Type Parameter         | Description                              |
| ---------------------- | ---------------------------------------- |
| `K` _extends_ `string` | the key the bound value is stored under. |
| `U`                    | the bound value type.                    |
| `E2`                   | the error type `f` may introduce.        |

###### Parameters

| Parameter | Type                                   | Description                                     |
| --------- | -------------------------------------- | ----------------------------------------------- |
| `name`    | `K`                                    | the scope key.                                  |
| `f`       | (`scope`) => `Result`&lt;`U`, `E2`&gt; | produces a `Result` from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E` \| `E2`&gt;

###### Remarks

Begin a chain with [Do](#do) (an empty object scope) and grow it step by
step. `f` receives the scope accumulated so far and returns a `Result`; on
`Ok` the value is added as `{ ...scope, [name]: value }`, on `Err`/`Defect`
the chain short-circuits. Errors union (`E | E2`). A throw becomes a
`Defect` — as does calling `bind` on a non-object scope (e.g. `Ok(5).bind`),
which is misuse: the scope is always an object inside a real `Do()` chain.
(`let` is the pure-value counterpart.)

###### Inherited from

```ts
ResultMethods.bind;
```

##### discard()

```ts
discard(): Result<void, E>;
```

Defined in: [packages/core/src/types.ts:222](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L222)

Drop the success value, collapsing the success type to `void`.

The named form of `map(() => undefined)`. Runs only on `Ok` (the value is
replaced with `undefined`); `Err` and `Defect` pass through. Unlike
`as(undefined)` — which produces `Result<undefined, E>` — the success type
is `void`: the value's story ends here.

###### Returns

`Result`&lt;`void`, `E`&gt;

###### Inherited from

```ts
ResultMethods.discard;
```

##### ensure()

###### Call Signature

```ts
ensure<U, E2>(predicate, onFail): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:257](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L257)

Validate the success value — keep the `Ok` when `predicate` holds,
otherwise fail into the **modeled** channel with `Err(onFail(value))`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the refined success type (type-guard form). |
| `E2`           | the error type `onFail` produces.           |

###### Parameters

| Parameter   | Type                                                          | Description                                  |
| ----------- | ------------------------------------------------------------- | -------------------------------------------- |
| `predicate` | (`value`) => `value is U`                                     | the check; a type guard refines `T` to `U`.  |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; | maps the failing value to the modeled error. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

###### Remarks

The named form of `flatMap((v) => (p(v) ? Ok(v) : Err(e)))`. With a
**type-guard** predicate (`(v): v is U`) the success type is **refined** to
`U` on the way through (this overload). Runs only on `Ok` — a passing value
flows through as the _same_ `Ok`; `Err` and `Defect` pass through
untouched. A throw in `predicate` or `onFail` becomes a `Defect`.

Both callbacks are synchronous: an async `onFail` is rejected at compile
time ([NotThenable](#notthenable)), and an async predicate does not type-check
either — its `Promise<boolean>` is not a `boolean` (and, being truthy,
would have silently always passed).

###### Example

```ts
// boolean form: gate a value
Ok(-1).ensure(
  (n) => n > 0,
  (n) => `negative: ${n}`,
); // Err("negative: -1")

// type-guard form: refine the success type
declare const r: Result<string | number, "e">;
const s = r.ensure(
  (v): v is string => typeof v === "string",
  () => "not_a_string" as const,
); // Result<string, "e" | "not_a_string">
```

###### Inherited from

```ts
ResultMethods.ensure;
```

###### Call Signature

```ts
ensure<E2>(predicate, onFail): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:265](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L265)

Boolean form of [ensure](#ensure-4) — validates without
refining, keeping the success type `T`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter   | Type                                                          |
| ----------- | ------------------------------------------------------------- |
| `predicate` | (`value`) => `boolean`                                        |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Inherited from

```ts
ResultMethods.ensure;
```

##### flatMap()

```ts
flatMap<U, E2>(f): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:130](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L130)

Sequence a dependent, `Result`-returning step (monadic bind).

Runs `f` only on `Ok`; `Err` and `Defect` pass through. The error channels
combine, widening to `E | E2`. If `f` throws, the throw becomes a `Defect`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the success type of the next step.          |
| `E2`           | the error type the next step may introduce. |

###### Parameters

| Parameter | Type                                   | Description                                                |
| --------- | -------------------------------------- | ---------------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`U`, `E2`&gt; | produces the next `Result` from the current success value. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

###### Inherited from

```ts
ResultMethods.flatMap;
```

##### flatMapErrCases()

```ts
flatMapErrCases<M>(f): Result<T | OkOf<MatchOut<M>>, ErrOf<MatchOut<M>>>;
```

Defined in: [packages/core/src/types.ts:313](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L313)

Sequence from an `Err` by producing another `Result` — the error-channel
mirror of [flatMap](#flatmap-4), **matching the error
exhaustively** ([ErrMatcher](#errmatcher); the combinator calls `.exhaustive()`).

Each branch returns a `Result`; the outgoing channels are the unions of the
branch-returned `Result`s' channels. A branch may return `defect(cause)`.
Runs only on `Err`; `Ok` and `Defect` pass through.

###### Type Parameters

| Type Parameter                                                                          | Description                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `unknown`&gt; \| `Defect`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                 |
| --------- | ---------------------------- | ----------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a fallback `Result`. |

###### Returns

`Result`&lt;`T` \| [`OkOf`](#okof)&lt;`MatchOut`&lt;`M`&gt;&gt;, [`ErrOf`](#errof)&lt;`MatchOut`&lt;`M`&gt;&gt;&gt;

###### Inherited from

```ts
ResultMethods.flatMapErrCases;
```

##### flatTap()

```ts
flatTap<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:166](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L166)

Run a **failable** side effect on the success value, keeping the original
value but threading the effect's error.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `E2`           | the error type the effect may introduce. |

###### Parameters

| Parameter | Type                                         | Description                                          |
| --------- | -------------------------------------------- | ---------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`unknown`, `E2`&gt; | the failable side effect; its `Ok` value is ignored. |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

This is to [tap](#tap-4) what
[flatMap](#flatmap-4) is to [map](#map-4):
`f` returns a `Result`, but its **success value is discarded** — on success
the original value flows through (`Result<T, E | E2>`), while an `Err` (or
`Defect`) from `f` short-circuits. Runs only on `Ok`; `Err` and `Defect` pass
through. If `f` throws, the throw becomes a `Defect`. Use it for a validation
or write whose _result_ matters but whose _value_ you don't need.

###### Inherited from

```ts
ResultMethods.flatTap;
```

##### flatTapErrCases()

```ts
flatTapErrCases<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:386](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L386)

Run a **failable** side effect on the error, keeping the original error but
threading the effect's own error — **matched exhaustively**
([ErrMatcher](#errmatcher)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter | Type                                                                              | Description                                                               |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `E2`&gt;&gt; | builds the match; each branch is a failable effect (its `Ok` is ignored). |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

The error-channel mirror of [flatTap](#flattap-4): each
branch returns a `Result` whose **success value is discarded** — on the
effect's `Ok` the original `Err` flows through, while an `Err`/`Defect` from a
branch short-circuits and threads its error. Note the asymmetry with a
_throw_: a branch that **returns** a Defect-state `Result` **replaces** the
original `Err` (Defect-dominance, the short-circuit rule — it is not
aggregated), whereas a branch that **throws** produces a `Defect`
aggregating `[thrown, original failure]` (observing a failure by throwing
never destroys it). A branch returning the injected `defect(cause)` marker —
reachable under a `returnType` pin — follows the _throw_ rule, since it is
the lint-clean, expression-position form of one.

###### Inherited from

```ts
ResultMethods.flatTapErrCases;
```

##### get()

```ts
get(this): T;
```

Defined in: [packages/core/src/types.ts:491](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L491)

Extract the success value.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`T`, `never`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

Compiles only when the error channel is empty (`E = never`) — eliminate
modeled errors first (`match` / `recoverErrCases` / `flatMapErrCases`), or reach for the
`getOr` / `getOrElse` / `getOrNull` / `getOrUndefined` family (which
recover an `Err`). If you get a `'this' context` type error here, that is
the gate: the receiver still has a non-`never` error channel.

`E = never` empties only the **modeled** error channel — a `Defect` can
still be present, and `get()` **rethrows its original cause** (it
_panics_); `Result<T, never>` does not mean `get()` cannot throw.

###### Inherited from

```ts
ResultMethods.get;
```

##### getErr()

```ts
getErr(this): E;
```

Defined in: [packages/core/src/types.ts:505](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L505)

Extract the modeled error.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`never`, `E`&gt; |

###### Returns

`E`

the `Err` value.

###### Remarks

Compiles only when the success channel is empty (`T = never`) — eliminate
the success case first. `T = never` is rarely the case in practice (a
`Result` you hold usually still has a success type), so to inspect an
error prefer an `isErr()` guard or, in tests, `@unthrown/vitest`'s
`toBeErrWith`. A `Defect` still **rethrows its original cause** (a defect is
a bug, not an absent value), so this does not mean `getErr()` can't throw.

###### Inherited from

```ts
ResultMethods.getErr;
```

##### getOr()

```ts
getOr<U>(fallback): T | U;
```

Defined in: [packages/core/src/types.ts:514](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L514)

The success value, or `fallback` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter  | Type | Description                                                                            |
| ---------- | ---- | -------------------------------------------------------------------------------------- |
| `fallback` | `U`  | returned when the result is an `Err` (may be a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
it is never silently replaced.

###### Inherited from

```ts
ResultMethods.getOr;
```

##### getOrElse()

```ts
getOrElse<U>(f): T | U;
```

Defined in: [packages/core/src/types.ts:522](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L522)

The success value, or `f(error)` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter | Type             | Description                                                                                       |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `f`       | (`error`) => `U` | lazily computes the fallback from the error (may return a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrElse;
```

##### getOrNull()

```ts
getOrNull(): T | null;
```

Defined in: [packages/core/src/types.ts:528](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L528)

The success value, or `null` on `Err`.

###### Returns

`T` \| `null`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrNull;
```

##### getOrThrow()

```ts
getOrThrow(this): T;
```

Defined in: [packages/core/src/types.ts:558](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L558)

The success value, or **throw** the modeled error on `Err`.

###### Parameters

| Parameter | Type                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `this`    | \[`E`\] _extends_ \[`never`\] ? `"unthrown: getOrThrow is unnecessary here — the Err channel is empty (E = never), so there is nothing to throw. Use get() instead."` : `Result`&lt;`T`, `E`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

A deliberate escape hatch off the errors-as-values model — it **throws the
`Err` value as-is** at the call site. Its purpose is to move a literal
`throw` behind a method, so a `no-throw` lint rule can ban raw throws while
this one sanctioned extraction remains — _not_ to replace principled
handling. When you can keep the error a value, prefer
[match](#match-4) / [recoverErrCases](#recovererrcases-4) /
[flatMapErrCases](#flatmaperrcases-4).

Type-gated as the **complement** of [get](#get-4): it
compiles only when the error channel is **non-empty** (`E` is not `never`) —
there must be a modeled error for it to throw. On a `Result<T, never>` there
is nothing to throw, so `getOrThrow` does not compile; use `get()` (which
gates the other way). Together they partition extraction by the error
channel's state, with no overlap.

###### Throws

the modeled `error` on `Err`; re-throws the original `cause` on a
`Defect` (a panic, like the rest of the `getOr…` family).

###### Inherited from

```ts
ResultMethods.getOrThrow;
```

##### getOrUndefined()

```ts
getOrUndefined(): T | undefined;
```

Defined in: [packages/core/src/types.ts:534](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L534)

The success value, or `undefined` on `Err`.

###### Returns

`T` \| `undefined`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrUndefined;
```

##### isDefect()

```ts
isDefect(): this is DefectView<T, E>;
```

Defined in: [packages/core/src/types.ts:569](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L569)

Whether this result is a `Defect` — narrows `this` to its [DefectView](#defectview) on `true`.

###### Returns

`this is DefectView<T, E>`

###### Inherited from

```ts
ResultMethods.isDefect;
```

##### isErr()

```ts
isErr(): this is ErrView<E, T>;
```

Defined in: [packages/core/src/types.ts:567](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L567)

Whether this result is `Err` — narrows `this` to its [ErrView](#errview) on `true`.

###### Returns

`this is ErrView<E, T>`

###### Inherited from

```ts
ResultMethods.isErr;
```

##### isOk()

```ts
isOk(): this is OkView<T, E>;
```

Defined in: [packages/core/src/types.ts:565](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L565)

Whether this result is `Ok` — narrows `this` to its [OkView](#okview) on `true`.

###### Returns

`this is OkView<T, E>`

###### Inherited from

```ts
ResultMethods.isOk;
```

##### let()

```ts
let<K, U>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E>;
```

Defined in: [packages/core/src/types.ts:205](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L205)

Do-notation: run `f` for a **plain value** and bind it under `name` in the
accumulating object scope. The pure-value counterpart of [bind](#bind-4).

###### Type Parameters

| Type Parameter         | Description                        |
| ---------------------- | ---------------------------------- |
| `K` _extends_ `string` | the key the value is stored under. |
| `U`                    | the value type.                    |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `name`    | `K`                                                         | the scope key.                               |
| `f`       | (`scope`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | computes a value from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E`&gt;

###### Remarks

`f` receives the scope and returns a value (not a `Result`); it is added as
`{ ...scope, [name]: value }`. Runs only on `Ok`; `Err`/`Defect` pass
through. A throw becomes a `Defect`. An async callback is rejected at
compile time ([NotThenable](#notthenable)).

###### Inherited from

```ts
ResultMethods.let;
```

##### map()

```ts
map<U>(f): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:119](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L119)

Transform the success value with `f`.

Runs `f` only on `Ok`; `Err` and `Defect` pass through untouched. If `f`
throws, the thrown value is captured as a `Defect`.

An async callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter | Description              |
| -------------- | ------------------------ |
| `U`            | the mapped success type. |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `f`       | (`value`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | maps the current success value to a new one. |

###### Returns

`Result`&lt;`U`, `E`&gt;

###### Inherited from

```ts
ResultMethods.map;
```

##### mapErrCases()

```ts
mapErrCases<M>(f): Result<T, Exclude<MatchOut<M>, Defect>>;
```

Defined in: [packages/core/src/types.ts:297](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L297)

Transform the modeled error by **matching it exhaustively**.

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                          |
| --------- | ---------------------------- | -------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match over the error (returns the un-terminated builder). |

###### Returns

`Result`&lt;`T`, `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;&gt;

###### Remarks

The callback receives `match(error)` (an [ErrMatcher](#errmatcher)) and the
injected `defect` helper. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `mapErrCases` calls `.exhaustive()` itself, so a
missing case is a compile error at the call site (there is no `.exhaustive()`
to forget, and no way to slip in `.otherwise()`). The outgoing error type is
the union of the branch returns with the `Defect` arm subtracted
(`Exclude<O, Defect>`) — a branch returning `defect(cause)` converts that case
to a `Defect` and drops it from `E`. Runs only on `Err`; `Ok` and `Defect`
pass through. A branch that throws also becomes a `Defect`.

**Name every case.** Match on anything the matcher supports — `_tag`,
`code`, structural shape, guards — and group the cases that share a handler
with `.with(a, b, handler)`. `.with(P._, …)` is the wildcard **escape
hatch**, not the default: it makes any match exhaustive, so it also absorbs
every case `E` grows later. Two uses are sanctioned — a helper generic in
`E`, where no arm list can prove exhaustiveness against an unresolved type
parameter, and an `E` that is a single type rather than a union of cases
(see [P](#p) for both). `@unthrown/oxlint`'s `no-catch-all-pattern` (in
its `recommended` preset) flags the rest.

###### Inherited from

```ts
ResultMethods.mapErrCases;
```

##### match()

```ts
match<ROk, RDefect, M>(cases): ROk | RDefect | MatchOut<M>;
```

Defined in: [packages/core/src/types.ts:470](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L470)

Exhaustively fold all three runtime states into a single value.

###### Type Parameters

| Type Parameter                                   | Description                                            |
| ------------------------------------------------ | ------------------------------------------------------ |
| `ROk`                                            | the `ok` handler return type.                          |
| `RDefect`                                        | the `defect` handler return type.                      |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the `errCases` handler returns. |

###### Parameters

| Parameter        | Type                                                                                              | Description                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `cases`          | \{ `defect`: (`cause`) => `RDefect`; `errCases`: (`matcher`) => `M`; `ok`: (`value`) => `ROk`; \} | the `ok`/`defect` handlers plus the `errCases` matcher builder. |
| `cases.defect`   | (`cause`) => `RDefect`                                                                            | -                                                               |
| `cases.errCases` | (`matcher`) => `M`                                                                                | -                                                               |
| `cases.ok`       | (`value`) => `ROk`                                                                                | -                                                               |

###### Returns

`ROk` \| `RDefect` \| `MatchOut`&lt;`M`&gt;

###### Remarks

Exactly one handler runs. Together with the throw-to-Defect guarantee, this
is typically the single place a pipeline is handled at the edge — mapping
`Ok`/`Err`/`Defect` to (for example) 2xx / 4xx / 5xx with no `try`/`catch`.

The `errCases` handler does not take a single blanket callback: it receives
`match(error)` (an [ErrMatcher](#errmatcher)) and **matches the error exhaustively**,
exactly like the error combinators — which is why the key carries the same
`…Cases` suffix. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `match` calls `.exhaustive()` itself, so a missing
case is a compile error at the call site (no `.exhaustive()` to forget).
Folding at the edge names every case too — `.with(P._, …)` is the wildcard
escape hatch, not the default. Unlike the combinators the branches
receive **no `defect` helper** — `match` is total elimination to a value,
with no `Defect` output channel; the `defect` case handles a `Result` that
already carries one. (A `Result` is also a discriminated union — for richer
whole-`Result` matching, `match(result).with(…)`.)

###### Inherited from

```ts
ResultMethods.match;
```

##### recoverDefect()

```ts
recoverDefect<U, E2>(f): Result<T | U, E | E2>;
```

Defined in: [packages/core/src/types.ts:406](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L406)

Recover from a `Defect` — the **only** combinator that can touch one.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `U`            | a success type the recovery may produce. |
| `E2`           | an error type the recovery may produce.  |

###### Parameters

| Parameter | Type                                   | Description                                               |
| --------- | -------------------------------------- | --------------------------------------------------------- |
| `f`       | (`cause`) => `Result`&lt;`U`, `E2`&gt; | maps the Defect's unknown cause to a recovering `Result`. |

###### Returns

`Result`&lt;`T` \| `U`, `E` \| `E2`&gt;

###### Remarks

Runs `f` only when a `Defect` is present, re-entering the modeled world by
returning a `Result` (an `Ok` or a fresh `Err`). `Ok` and `Err` pass
through. Recovering a Defect should be rare: usually you let it bubble to
the edge. If `f` throws, the throw becomes a new `Defect`.

###### Inherited from

```ts
ResultMethods.recoverDefect;
```

##### recoverErrCases()

```ts
recoverErrCases<M>(f): Result<T | Exclude<MatchOut<M>, Defect>, never>;
```

Defined in: [packages/core/src/types.ts:331](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L331)

Recover from an `Err` by producing a success value, emptying the error
channel — **matching the error exhaustively** ([ErrMatcher](#errmatcher)). Pairs
with [recoverDefect](#recoverdefect-4).

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                             |
| --------- | ---------------------------- | ------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a success value. |

###### Returns

`Result`&lt;`T` \| `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;, `never`&gt;

###### Remarks

The result type is `Result<T | U, never>`, but `never` describes only the
**error** channel — a `Defect` can still be present at runtime. A branch may
return `defect(cause)` (which stays a `Defect`, not a recovery). Runs only on
`Err`; `Ok` and `Defect` pass through.

###### Inherited from

```ts
ResultMethods.recoverErrCases;
```

##### tap()

```ts
tap<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:149](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L149)

Run a side effect on the success value and pass the `Result` through
unchanged.

Runs only on `Ok`. If `f` throws, the throw becomes a `Defect`. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                                    |
| --------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `f`       | (`value`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f`'s return value is **ignored** — a `Result` returned by the effect
compiles but is discarded, `Err` and all. If the effect can fail, sequence
it instead of tapping it: a `Result`-returning effect goes in
[flatTap](#flattap-4); an `AsyncResult`-returning effect
cannot be sequenced from the sync surface — lift the chain with
[toAsync](#toasync-3) and use the async
[flatTap](#flattap-3) (which accepts both).

###### Inherited from

```ts
ResultMethods.tap;
```

##### tapDefect()

```ts
tapDefect<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:416](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L416)

Run a side effect on a present `Defect`'s cause (e.g. logging) and pass the
`Defect` through unchanged. If `f` throws, the result is a `Defect` whose
cause is an `AggregateError` of `[thrown, original failure]` — observing a
failure never destroys it. An async callback is rejected at compile time
([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                             |
| --------- | ----------------------------------------------------------- | --------------------------------------- |
| `f`       | (`cause`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the unknown cause. |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Inherited from

```ts
ResultMethods.tapDefect;
```

##### tapErrCases()

```ts
tapErrCases<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:358](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L358)

Run a side effect on the error — **matched exhaustively** ([ErrMatcher](#errmatcher))
— and pass the `Result` through unchanged.

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                                                             | Description                                                        |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`R` & [`NotThenable`](#notthenable)&lt;`R`&gt;&gt; | builds the match; branch returns are ignored, bar `defect(cause)`. |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

The callback builds a match whose branches run side effects; their return
values are ignored and the original `Err` flows through. Exhaustive like the
transformers, and like them it wants every case named — `.with(P._, …)`
remains the wildcard escape hatch. If a branch throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown, original
failure]` — observing a failure never destroys it. An **async branch is
rejected at compile time** ([NotThenable](#notthenable) on the builder output):
because the branch results are discarded, a returned `Promise` would float
unobserved and its rejection would vanish. The one branch return that is
**not** discarded is the injected `defect(cause)` marker: it is the
lint-clean, expression-position form of a `throw`, so it follows the throw
rule above (an `AggregateError` of `[the branch's cause, original
failure]`), never a silent no-op. A failable
`Result`-returning effect belongs in
[flatTapErrCases](#flattaperrcases-4).

###### Inherited from

```ts
ResultMethods.tapErrCases;
```

##### tapFailure()

```ts
tapFailure<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:442](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L442)

Run a side effect on **any failure** — `Err` or `Defect` — and pass the
`Result` through unchanged. The one cross-channel observer, for the shared
"it went KO" concern (logging, metrics, rollback) that would otherwise be
duplicated across [tapErrCases](#taperrcases-4) and
[tapDefect](#tapdefect-4).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                          | Description                                                             |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `f`       | (`failure`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the failure variant (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f` receives the narrowed **failure variant** ([FailureView](#failureview)), not a
payload — the payload union `E | unknown` would collapse to `unknown` and
lose `E`'s typing. Branch on `failure.tag` to reach the typed payload
(`"Err"` → `failure.error: E`, `"Defect"` → `failure.cause: unknown`), or
treat it opaquely for a shared logger. Runs on `Err` and `Defect`; `Ok`
passes through. It **observes without consuming**: the failure flows on
unchanged — to also recover, use
[recoverErrCases](#recovererrcases-4) /
[recoverDefect](#recoverdefect-4) (deliberately separate
acts) or [match](#match-4) at the edge. If `f` throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown,
original failure]` — observing a failure never destroys it. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Inherited from

```ts
ResultMethods.tapFailure;
```

##### toAsync()

```ts
toAsync(): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:572](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L572)

Lift this synchronous `Result` into an [AsyncResult](#asyncresult).

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

###### Inherited from

```ts
ResultMethods.toAsync;
```

---

### ErrView

Defined in: [packages/core/src/types.ts:613](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L613)

The `Err` variant of a [Result](#result): a modeled failure carrying an `error`.
This is what a successful `isErr` guard narrows to, exposing `.error`. It also
carries the shared fluent surface ([ResultMethods](#resultmethods)).

#### Remarks

**Note the parameter order: `ErrView<E, T>` puts the error type _first_** — the
reverse of the `<T, E>` order used by [OkView](#okview), [DefectView](#defectview), and
[Result](#result) — because `Result<T, E>` narrows to `ErrView<E, T>` (the error is
the payload the guard makes reachable). You rarely write it by hand (a failed
`isErr()` narrows to it for you); if you do, mind the flip — `ErrView<MyError,
MyValue>`, not `ErrView<MyValue, MyError>`.

#### Example

```ts
if (r.isErr()) r.error; // r: ErrView<E, T> here — .error is an E
```

#### Extends

- [`ResultMethods`](#resultmethods)&lt;`T`, `E`&gt;

#### Type Parameters

| Type Parameter | Default type |
| -------------- | ------------ |
| `E`            | -            |
| `T`            | `never`      |

#### Properties

| Property                     | Modifier   | Type    | Defined in                                                                                                                                             |
| ---------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="error-1"></a> `error` | `readonly` | `E`     | [packages/core/src/types.ts:615](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L615) |
| <a id="tag-1"></a> `tag`     | `readonly` | `"Err"` | [packages/core/src/types.ts:614](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L614) |

#### Methods

##### as()

```ts
as<U>(value): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:213](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L213)

Replace the success value with a constant `value`.

Runs only on `Ok`; `Err` and `Defect` pass through.

###### Type Parameters

| Type Parameter | Description                 |
| -------------- | --------------------------- |
| `U`            | the replacement value type. |

###### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `U`  |

###### Returns

`Result`&lt;`U`, `E`&gt;

###### Inherited from

```ts
ResultMethods.as;
```

##### bind()

```ts
bind<K, U, E2>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E | E2>;
```

Defined in: [packages/core/src/types.ts:186](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L186)

Do-notation: run `f` for a `Result` and **bind its value** under `name` in
an accumulating object scope.

###### Type Parameters

| Type Parameter         | Description                              |
| ---------------------- | ---------------------------------------- |
| `K` _extends_ `string` | the key the bound value is stored under. |
| `U`                    | the bound value type.                    |
| `E2`                   | the error type `f` may introduce.        |

###### Parameters

| Parameter | Type                                   | Description                                     |
| --------- | -------------------------------------- | ----------------------------------------------- |
| `name`    | `K`                                    | the scope key.                                  |
| `f`       | (`scope`) => `Result`&lt;`U`, `E2`&gt; | produces a `Result` from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E` \| `E2`&gt;

###### Remarks

Begin a chain with [Do](#do) (an empty object scope) and grow it step by
step. `f` receives the scope accumulated so far and returns a `Result`; on
`Ok` the value is added as `{ ...scope, [name]: value }`, on `Err`/`Defect`
the chain short-circuits. Errors union (`E | E2`). A throw becomes a
`Defect` — as does calling `bind` on a non-object scope (e.g. `Ok(5).bind`),
which is misuse: the scope is always an object inside a real `Do()` chain.
(`let` is the pure-value counterpart.)

###### Inherited from

```ts
ResultMethods.bind;
```

##### discard()

```ts
discard(): Result<void, E>;
```

Defined in: [packages/core/src/types.ts:222](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L222)

Drop the success value, collapsing the success type to `void`.

The named form of `map(() => undefined)`. Runs only on `Ok` (the value is
replaced with `undefined`); `Err` and `Defect` pass through. Unlike
`as(undefined)` — which produces `Result<undefined, E>` — the success type
is `void`: the value's story ends here.

###### Returns

`Result`&lt;`void`, `E`&gt;

###### Inherited from

```ts
ResultMethods.discard;
```

##### ensure()

###### Call Signature

```ts
ensure<U, E2>(predicate, onFail): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:257](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L257)

Validate the success value — keep the `Ok` when `predicate` holds,
otherwise fail into the **modeled** channel with `Err(onFail(value))`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the refined success type (type-guard form). |
| `E2`           | the error type `onFail` produces.           |

###### Parameters

| Parameter   | Type                                                          | Description                                  |
| ----------- | ------------------------------------------------------------- | -------------------------------------------- |
| `predicate` | (`value`) => `value is U`                                     | the check; a type guard refines `T` to `U`.  |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; | maps the failing value to the modeled error. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

###### Remarks

The named form of `flatMap((v) => (p(v) ? Ok(v) : Err(e)))`. With a
**type-guard** predicate (`(v): v is U`) the success type is **refined** to
`U` on the way through (this overload). Runs only on `Ok` — a passing value
flows through as the _same_ `Ok`; `Err` and `Defect` pass through
untouched. A throw in `predicate` or `onFail` becomes a `Defect`.

Both callbacks are synchronous: an async `onFail` is rejected at compile
time ([NotThenable](#notthenable)), and an async predicate does not type-check
either — its `Promise<boolean>` is not a `boolean` (and, being truthy,
would have silently always passed).

###### Example

```ts
// boolean form: gate a value
Ok(-1).ensure(
  (n) => n > 0,
  (n) => `negative: ${n}`,
); // Err("negative: -1")

// type-guard form: refine the success type
declare const r: Result<string | number, "e">;
const s = r.ensure(
  (v): v is string => typeof v === "string",
  () => "not_a_string" as const,
); // Result<string, "e" | "not_a_string">
```

###### Inherited from

```ts
ResultMethods.ensure;
```

###### Call Signature

```ts
ensure<E2>(predicate, onFail): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:265](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L265)

Boolean form of [ensure](#ensure-4) — validates without
refining, keeping the success type `T`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter   | Type                                                          |
| ----------- | ------------------------------------------------------------- |
| `predicate` | (`value`) => `boolean`                                        |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Inherited from

```ts
ResultMethods.ensure;
```

##### flatMap()

```ts
flatMap<U, E2>(f): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:130](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L130)

Sequence a dependent, `Result`-returning step (monadic bind).

Runs `f` only on `Ok`; `Err` and `Defect` pass through. The error channels
combine, widening to `E | E2`. If `f` throws, the throw becomes a `Defect`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the success type of the next step.          |
| `E2`           | the error type the next step may introduce. |

###### Parameters

| Parameter | Type                                   | Description                                                |
| --------- | -------------------------------------- | ---------------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`U`, `E2`&gt; | produces the next `Result` from the current success value. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

###### Inherited from

```ts
ResultMethods.flatMap;
```

##### flatMapErrCases()

```ts
flatMapErrCases<M>(f): Result<T | OkOf<MatchOut<M>>, ErrOf<MatchOut<M>>>;
```

Defined in: [packages/core/src/types.ts:313](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L313)

Sequence from an `Err` by producing another `Result` — the error-channel
mirror of [flatMap](#flatmap-4), **matching the error
exhaustively** ([ErrMatcher](#errmatcher); the combinator calls `.exhaustive()`).

Each branch returns a `Result`; the outgoing channels are the unions of the
branch-returned `Result`s' channels. A branch may return `defect(cause)`.
Runs only on `Err`; `Ok` and `Defect` pass through.

###### Type Parameters

| Type Parameter                                                                          | Description                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `unknown`&gt; \| `Defect`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                 |
| --------- | ---------------------------- | ----------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a fallback `Result`. |

###### Returns

`Result`&lt;`T` \| [`OkOf`](#okof)&lt;`MatchOut`&lt;`M`&gt;&gt;, [`ErrOf`](#errof)&lt;`MatchOut`&lt;`M`&gt;&gt;&gt;

###### Inherited from

```ts
ResultMethods.flatMapErrCases;
```

##### flatTap()

```ts
flatTap<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:166](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L166)

Run a **failable** side effect on the success value, keeping the original
value but threading the effect's error.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `E2`           | the error type the effect may introduce. |

###### Parameters

| Parameter | Type                                         | Description                                          |
| --------- | -------------------------------------------- | ---------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`unknown`, `E2`&gt; | the failable side effect; its `Ok` value is ignored. |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

This is to [tap](#tap-4) what
[flatMap](#flatmap-4) is to [map](#map-4):
`f` returns a `Result`, but its **success value is discarded** — on success
the original value flows through (`Result<T, E | E2>`), while an `Err` (or
`Defect`) from `f` short-circuits. Runs only on `Ok`; `Err` and `Defect` pass
through. If `f` throws, the throw becomes a `Defect`. Use it for a validation
or write whose _result_ matters but whose _value_ you don't need.

###### Inherited from

```ts
ResultMethods.flatTap;
```

##### flatTapErrCases()

```ts
flatTapErrCases<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:386](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L386)

Run a **failable** side effect on the error, keeping the original error but
threading the effect's own error — **matched exhaustively**
([ErrMatcher](#errmatcher)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter | Type                                                                              | Description                                                               |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `E2`&gt;&gt; | builds the match; each branch is a failable effect (its `Ok` is ignored). |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

The error-channel mirror of [flatTap](#flattap-4): each
branch returns a `Result` whose **success value is discarded** — on the
effect's `Ok` the original `Err` flows through, while an `Err`/`Defect` from a
branch short-circuits and threads its error. Note the asymmetry with a
_throw_: a branch that **returns** a Defect-state `Result` **replaces** the
original `Err` (Defect-dominance, the short-circuit rule — it is not
aggregated), whereas a branch that **throws** produces a `Defect`
aggregating `[thrown, original failure]` (observing a failure by throwing
never destroys it). A branch returning the injected `defect(cause)` marker —
reachable under a `returnType` pin — follows the _throw_ rule, since it is
the lint-clean, expression-position form of one.

###### Inherited from

```ts
ResultMethods.flatTapErrCases;
```

##### get()

```ts
get(this): T;
```

Defined in: [packages/core/src/types.ts:491](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L491)

Extract the success value.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`T`, `never`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

Compiles only when the error channel is empty (`E = never`) — eliminate
modeled errors first (`match` / `recoverErrCases` / `flatMapErrCases`), or reach for the
`getOr` / `getOrElse` / `getOrNull` / `getOrUndefined` family (which
recover an `Err`). If you get a `'this' context` type error here, that is
the gate: the receiver still has a non-`never` error channel.

`E = never` empties only the **modeled** error channel — a `Defect` can
still be present, and `get()` **rethrows its original cause** (it
_panics_); `Result<T, never>` does not mean `get()` cannot throw.

###### Inherited from

```ts
ResultMethods.get;
```

##### getErr()

```ts
getErr(this): E;
```

Defined in: [packages/core/src/types.ts:505](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L505)

Extract the modeled error.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`never`, `E`&gt; |

###### Returns

`E`

the `Err` value.

###### Remarks

Compiles only when the success channel is empty (`T = never`) — eliminate
the success case first. `T = never` is rarely the case in practice (a
`Result` you hold usually still has a success type), so to inspect an
error prefer an `isErr()` guard or, in tests, `@unthrown/vitest`'s
`toBeErrWith`. A `Defect` still **rethrows its original cause** (a defect is
a bug, not an absent value), so this does not mean `getErr()` can't throw.

###### Inherited from

```ts
ResultMethods.getErr;
```

##### getOr()

```ts
getOr<U>(fallback): T | U;
```

Defined in: [packages/core/src/types.ts:514](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L514)

The success value, or `fallback` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter  | Type | Description                                                                            |
| ---------- | ---- | -------------------------------------------------------------------------------------- |
| `fallback` | `U`  | returned when the result is an `Err` (may be a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
it is never silently replaced.

###### Inherited from

```ts
ResultMethods.getOr;
```

##### getOrElse()

```ts
getOrElse<U>(f): T | U;
```

Defined in: [packages/core/src/types.ts:522](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L522)

The success value, or `f(error)` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter | Type             | Description                                                                                       |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `f`       | (`error`) => `U` | lazily computes the fallback from the error (may return a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrElse;
```

##### getOrNull()

```ts
getOrNull(): T | null;
```

Defined in: [packages/core/src/types.ts:528](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L528)

The success value, or `null` on `Err`.

###### Returns

`T` \| `null`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrNull;
```

##### getOrThrow()

```ts
getOrThrow(this): T;
```

Defined in: [packages/core/src/types.ts:558](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L558)

The success value, or **throw** the modeled error on `Err`.

###### Parameters

| Parameter | Type                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `this`    | \[`E`\] _extends_ \[`never`\] ? `"unthrown: getOrThrow is unnecessary here — the Err channel is empty (E = never), so there is nothing to throw. Use get() instead."` : `Result`&lt;`T`, `E`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

A deliberate escape hatch off the errors-as-values model — it **throws the
`Err` value as-is** at the call site. Its purpose is to move a literal
`throw` behind a method, so a `no-throw` lint rule can ban raw throws while
this one sanctioned extraction remains — _not_ to replace principled
handling. When you can keep the error a value, prefer
[match](#match-4) / [recoverErrCases](#recovererrcases-4) /
[flatMapErrCases](#flatmaperrcases-4).

Type-gated as the **complement** of [get](#get-4): it
compiles only when the error channel is **non-empty** (`E` is not `never`) —
there must be a modeled error for it to throw. On a `Result<T, never>` there
is nothing to throw, so `getOrThrow` does not compile; use `get()` (which
gates the other way). Together they partition extraction by the error
channel's state, with no overlap.

###### Throws

the modeled `error` on `Err`; re-throws the original `cause` on a
`Defect` (a panic, like the rest of the `getOr…` family).

###### Inherited from

```ts
ResultMethods.getOrThrow;
```

##### getOrUndefined()

```ts
getOrUndefined(): T | undefined;
```

Defined in: [packages/core/src/types.ts:534](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L534)

The success value, or `undefined` on `Err`.

###### Returns

`T` \| `undefined`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrUndefined;
```

##### isDefect()

```ts
isDefect(): this is DefectView<T, E>;
```

Defined in: [packages/core/src/types.ts:569](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L569)

Whether this result is a `Defect` — narrows `this` to its [DefectView](#defectview) on `true`.

###### Returns

`this is DefectView<T, E>`

###### Inherited from

```ts
ResultMethods.isDefect;
```

##### isErr()

```ts
isErr(): this is ErrView<E, T>;
```

Defined in: [packages/core/src/types.ts:567](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L567)

Whether this result is `Err` — narrows `this` to its [ErrView](#errview) on `true`.

###### Returns

`this is ErrView<E, T>`

###### Inherited from

```ts
ResultMethods.isErr;
```

##### isOk()

```ts
isOk(): this is OkView<T, E>;
```

Defined in: [packages/core/src/types.ts:565](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L565)

Whether this result is `Ok` — narrows `this` to its [OkView](#okview) on `true`.

###### Returns

`this is OkView<T, E>`

###### Inherited from

```ts
ResultMethods.isOk;
```

##### let()

```ts
let<K, U>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E>;
```

Defined in: [packages/core/src/types.ts:205](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L205)

Do-notation: run `f` for a **plain value** and bind it under `name` in the
accumulating object scope. The pure-value counterpart of [bind](#bind-4).

###### Type Parameters

| Type Parameter         | Description                        |
| ---------------------- | ---------------------------------- |
| `K` _extends_ `string` | the key the value is stored under. |
| `U`                    | the value type.                    |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `name`    | `K`                                                         | the scope key.                               |
| `f`       | (`scope`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | computes a value from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E`&gt;

###### Remarks

`f` receives the scope and returns a value (not a `Result`); it is added as
`{ ...scope, [name]: value }`. Runs only on `Ok`; `Err`/`Defect` pass
through. A throw becomes a `Defect`. An async callback is rejected at
compile time ([NotThenable](#notthenable)).

###### Inherited from

```ts
ResultMethods.let;
```

##### map()

```ts
map<U>(f): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:119](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L119)

Transform the success value with `f`.

Runs `f` only on `Ok`; `Err` and `Defect` pass through untouched. If `f`
throws, the thrown value is captured as a `Defect`.

An async callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter | Description              |
| -------------- | ------------------------ |
| `U`            | the mapped success type. |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `f`       | (`value`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | maps the current success value to a new one. |

###### Returns

`Result`&lt;`U`, `E`&gt;

###### Inherited from

```ts
ResultMethods.map;
```

##### mapErrCases()

```ts
mapErrCases<M>(f): Result<T, Exclude<MatchOut<M>, Defect>>;
```

Defined in: [packages/core/src/types.ts:297](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L297)

Transform the modeled error by **matching it exhaustively**.

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                          |
| --------- | ---------------------------- | -------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match over the error (returns the un-terminated builder). |

###### Returns

`Result`&lt;`T`, `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;&gt;

###### Remarks

The callback receives `match(error)` (an [ErrMatcher](#errmatcher)) and the
injected `defect` helper. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `mapErrCases` calls `.exhaustive()` itself, so a
missing case is a compile error at the call site (there is no `.exhaustive()`
to forget, and no way to slip in `.otherwise()`). The outgoing error type is
the union of the branch returns with the `Defect` arm subtracted
(`Exclude<O, Defect>`) — a branch returning `defect(cause)` converts that case
to a `Defect` and drops it from `E`. Runs only on `Err`; `Ok` and `Defect`
pass through. A branch that throws also becomes a `Defect`.

**Name every case.** Match on anything the matcher supports — `_tag`,
`code`, structural shape, guards — and group the cases that share a handler
with `.with(a, b, handler)`. `.with(P._, …)` is the wildcard **escape
hatch**, not the default: it makes any match exhaustive, so it also absorbs
every case `E` grows later. Two uses are sanctioned — a helper generic in
`E`, where no arm list can prove exhaustiveness against an unresolved type
parameter, and an `E` that is a single type rather than a union of cases
(see [P](#p) for both). `@unthrown/oxlint`'s `no-catch-all-pattern` (in
its `recommended` preset) flags the rest.

###### Inherited from

```ts
ResultMethods.mapErrCases;
```

##### match()

```ts
match<ROk, RDefect, M>(cases): ROk | RDefect | MatchOut<M>;
```

Defined in: [packages/core/src/types.ts:470](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L470)

Exhaustively fold all three runtime states into a single value.

###### Type Parameters

| Type Parameter                                   | Description                                            |
| ------------------------------------------------ | ------------------------------------------------------ |
| `ROk`                                            | the `ok` handler return type.                          |
| `RDefect`                                        | the `defect` handler return type.                      |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the `errCases` handler returns. |

###### Parameters

| Parameter        | Type                                                                                              | Description                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `cases`          | \{ `defect`: (`cause`) => `RDefect`; `errCases`: (`matcher`) => `M`; `ok`: (`value`) => `ROk`; \} | the `ok`/`defect` handlers plus the `errCases` matcher builder. |
| `cases.defect`   | (`cause`) => `RDefect`                                                                            | -                                                               |
| `cases.errCases` | (`matcher`) => `M`                                                                                | -                                                               |
| `cases.ok`       | (`value`) => `ROk`                                                                                | -                                                               |

###### Returns

`ROk` \| `RDefect` \| `MatchOut`&lt;`M`&gt;

###### Remarks

Exactly one handler runs. Together with the throw-to-Defect guarantee, this
is typically the single place a pipeline is handled at the edge — mapping
`Ok`/`Err`/`Defect` to (for example) 2xx / 4xx / 5xx with no `try`/`catch`.

The `errCases` handler does not take a single blanket callback: it receives
`match(error)` (an [ErrMatcher](#errmatcher)) and **matches the error exhaustively**,
exactly like the error combinators — which is why the key carries the same
`…Cases` suffix. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `match` calls `.exhaustive()` itself, so a missing
case is a compile error at the call site (no `.exhaustive()` to forget).
Folding at the edge names every case too — `.with(P._, …)` is the wildcard
escape hatch, not the default. Unlike the combinators the branches
receive **no `defect` helper** — `match` is total elimination to a value,
with no `Defect` output channel; the `defect` case handles a `Result` that
already carries one. (A `Result` is also a discriminated union — for richer
whole-`Result` matching, `match(result).with(…)`.)

###### Inherited from

```ts
ResultMethods.match;
```

##### recoverDefect()

```ts
recoverDefect<U, E2>(f): Result<T | U, E | E2>;
```

Defined in: [packages/core/src/types.ts:406](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L406)

Recover from a `Defect` — the **only** combinator that can touch one.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `U`            | a success type the recovery may produce. |
| `E2`           | an error type the recovery may produce.  |

###### Parameters

| Parameter | Type                                   | Description                                               |
| --------- | -------------------------------------- | --------------------------------------------------------- |
| `f`       | (`cause`) => `Result`&lt;`U`, `E2`&gt; | maps the Defect's unknown cause to a recovering `Result`. |

###### Returns

`Result`&lt;`T` \| `U`, `E` \| `E2`&gt;

###### Remarks

Runs `f` only when a `Defect` is present, re-entering the modeled world by
returning a `Result` (an `Ok` or a fresh `Err`). `Ok` and `Err` pass
through. Recovering a Defect should be rare: usually you let it bubble to
the edge. If `f` throws, the throw becomes a new `Defect`.

###### Inherited from

```ts
ResultMethods.recoverDefect;
```

##### recoverErrCases()

```ts
recoverErrCases<M>(f): Result<T | Exclude<MatchOut<M>, Defect>, never>;
```

Defined in: [packages/core/src/types.ts:331](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L331)

Recover from an `Err` by producing a success value, emptying the error
channel — **matching the error exhaustively** ([ErrMatcher](#errmatcher)). Pairs
with [recoverDefect](#recoverdefect-4).

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                             |
| --------- | ---------------------------- | ------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a success value. |

###### Returns

`Result`&lt;`T` \| `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;, `never`&gt;

###### Remarks

The result type is `Result<T | U, never>`, but `never` describes only the
**error** channel — a `Defect` can still be present at runtime. A branch may
return `defect(cause)` (which stays a `Defect`, not a recovery). Runs only on
`Err`; `Ok` and `Defect` pass through.

###### Inherited from

```ts
ResultMethods.recoverErrCases;
```

##### tap()

```ts
tap<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:149](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L149)

Run a side effect on the success value and pass the `Result` through
unchanged.

Runs only on `Ok`. If `f` throws, the throw becomes a `Defect`. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                                    |
| --------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `f`       | (`value`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f`'s return value is **ignored** — a `Result` returned by the effect
compiles but is discarded, `Err` and all. If the effect can fail, sequence
it instead of tapping it: a `Result`-returning effect goes in
[flatTap](#flattap-4); an `AsyncResult`-returning effect
cannot be sequenced from the sync surface — lift the chain with
[toAsync](#toasync-3) and use the async
[flatTap](#flattap-3) (which accepts both).

###### Inherited from

```ts
ResultMethods.tap;
```

##### tapDefect()

```ts
tapDefect<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:416](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L416)

Run a side effect on a present `Defect`'s cause (e.g. logging) and pass the
`Defect` through unchanged. If `f` throws, the result is a `Defect` whose
cause is an `AggregateError` of `[thrown, original failure]` — observing a
failure never destroys it. An async callback is rejected at compile time
([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                             |
| --------- | ----------------------------------------------------------- | --------------------------------------- |
| `f`       | (`cause`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the unknown cause. |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Inherited from

```ts
ResultMethods.tapDefect;
```

##### tapErrCases()

```ts
tapErrCases<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:358](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L358)

Run a side effect on the error — **matched exhaustively** ([ErrMatcher](#errmatcher))
— and pass the `Result` through unchanged.

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                                                             | Description                                                        |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`R` & [`NotThenable`](#notthenable)&lt;`R`&gt;&gt; | builds the match; branch returns are ignored, bar `defect(cause)`. |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

The callback builds a match whose branches run side effects; their return
values are ignored and the original `Err` flows through. Exhaustive like the
transformers, and like them it wants every case named — `.with(P._, …)`
remains the wildcard escape hatch. If a branch throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown, original
failure]` — observing a failure never destroys it. An **async branch is
rejected at compile time** ([NotThenable](#notthenable) on the builder output):
because the branch results are discarded, a returned `Promise` would float
unobserved and its rejection would vanish. The one branch return that is
**not** discarded is the injected `defect(cause)` marker: it is the
lint-clean, expression-position form of a `throw`, so it follows the throw
rule above (an `AggregateError` of `[the branch's cause, original
failure]`), never a silent no-op. A failable
`Result`-returning effect belongs in
[flatTapErrCases](#flattaperrcases-4).

###### Inherited from

```ts
ResultMethods.tapErrCases;
```

##### tapFailure()

```ts
tapFailure<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:442](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L442)

Run a side effect on **any failure** — `Err` or `Defect` — and pass the
`Result` through unchanged. The one cross-channel observer, for the shared
"it went KO" concern (logging, metrics, rollback) that would otherwise be
duplicated across [tapErrCases](#taperrcases-4) and
[tapDefect](#tapdefect-4).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                          | Description                                                             |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `f`       | (`failure`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the failure variant (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f` receives the narrowed **failure variant** ([FailureView](#failureview)), not a
payload — the payload union `E | unknown` would collapse to `unknown` and
lose `E`'s typing. Branch on `failure.tag` to reach the typed payload
(`"Err"` → `failure.error: E`, `"Defect"` → `failure.cause: unknown`), or
treat it opaquely for a shared logger. Runs on `Err` and `Defect`; `Ok`
passes through. It **observes without consuming**: the failure flows on
unchanged — to also recover, use
[recoverErrCases](#recovererrcases-4) /
[recoverDefect](#recoverdefect-4) (deliberately separate
acts) or [match](#match-4) at the edge. If `f` throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown,
original failure]` — observing a failure never destroys it. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Inherited from

```ts
ResultMethods.tapFailure;
```

##### toAsync()

```ts
toAsync(): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:572](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L572)

Lift this synchronous `Result` into an [AsyncResult](#asyncresult).

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

###### Inherited from

```ts
ResultMethods.toAsync;
```

---

### OkView

Defined in: [packages/core/src/types.ts:588](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L588)

The `Ok` variant of a [Result](#result): a success carrying a `value`. This is
what a successful `isOk` guard narrows to, making `.value` reachable. It also
carries the shared fluent surface ([ResultMethods](#resultmethods)).

#### Example

```ts
if (r.isOk()) r.value; // r: OkView<T, E> here — .value is a T
```

#### Extends

- [`ResultMethods`](#resultmethods)&lt;`T`, `E`&gt;

#### Type Parameters

| Type Parameter | Default type |
| -------------- | ------------ |
| `T`            | -            |
| `E`            | `never`      |

#### Properties

| Property                   | Modifier   | Type   | Defined in                                                                                                                                             |
| -------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="tag-2"></a> `tag`   | `readonly` | `"Ok"` | [packages/core/src/types.ts:589](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L589) |
| <a id="value"></a> `value` | `readonly` | `T`    | [packages/core/src/types.ts:590](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L590) |

#### Methods

##### as()

```ts
as<U>(value): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:213](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L213)

Replace the success value with a constant `value`.

Runs only on `Ok`; `Err` and `Defect` pass through.

###### Type Parameters

| Type Parameter | Description                 |
| -------------- | --------------------------- |
| `U`            | the replacement value type. |

###### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `U`  |

###### Returns

`Result`&lt;`U`, `E`&gt;

###### Inherited from

```ts
ResultMethods.as;
```

##### bind()

```ts
bind<K, U, E2>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E | E2>;
```

Defined in: [packages/core/src/types.ts:186](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L186)

Do-notation: run `f` for a `Result` and **bind its value** under `name` in
an accumulating object scope.

###### Type Parameters

| Type Parameter         | Description                              |
| ---------------------- | ---------------------------------------- |
| `K` _extends_ `string` | the key the bound value is stored under. |
| `U`                    | the bound value type.                    |
| `E2`                   | the error type `f` may introduce.        |

###### Parameters

| Parameter | Type                                   | Description                                     |
| --------- | -------------------------------------- | ----------------------------------------------- |
| `name`    | `K`                                    | the scope key.                                  |
| `f`       | (`scope`) => `Result`&lt;`U`, `E2`&gt; | produces a `Result` from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E` \| `E2`&gt;

###### Remarks

Begin a chain with [Do](#do) (an empty object scope) and grow it step by
step. `f` receives the scope accumulated so far and returns a `Result`; on
`Ok` the value is added as `{ ...scope, [name]: value }`, on `Err`/`Defect`
the chain short-circuits. Errors union (`E | E2`). A throw becomes a
`Defect` — as does calling `bind` on a non-object scope (e.g. `Ok(5).bind`),
which is misuse: the scope is always an object inside a real `Do()` chain.
(`let` is the pure-value counterpart.)

###### Inherited from

```ts
ResultMethods.bind;
```

##### discard()

```ts
discard(): Result<void, E>;
```

Defined in: [packages/core/src/types.ts:222](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L222)

Drop the success value, collapsing the success type to `void`.

The named form of `map(() => undefined)`. Runs only on `Ok` (the value is
replaced with `undefined`); `Err` and `Defect` pass through. Unlike
`as(undefined)` — which produces `Result<undefined, E>` — the success type
is `void`: the value's story ends here.

###### Returns

`Result`&lt;`void`, `E`&gt;

###### Inherited from

```ts
ResultMethods.discard;
```

##### ensure()

###### Call Signature

```ts
ensure<U, E2>(predicate, onFail): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:257](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L257)

Validate the success value — keep the `Ok` when `predicate` holds,
otherwise fail into the **modeled** channel with `Err(onFail(value))`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the refined success type (type-guard form). |
| `E2`           | the error type `onFail` produces.           |

###### Parameters

| Parameter   | Type                                                          | Description                                  |
| ----------- | ------------------------------------------------------------- | -------------------------------------------- |
| `predicate` | (`value`) => `value is U`                                     | the check; a type guard refines `T` to `U`.  |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; | maps the failing value to the modeled error. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

###### Remarks

The named form of `flatMap((v) => (p(v) ? Ok(v) : Err(e)))`. With a
**type-guard** predicate (`(v): v is U`) the success type is **refined** to
`U` on the way through (this overload). Runs only on `Ok` — a passing value
flows through as the _same_ `Ok`; `Err` and `Defect` pass through
untouched. A throw in `predicate` or `onFail` becomes a `Defect`.

Both callbacks are synchronous: an async `onFail` is rejected at compile
time ([NotThenable](#notthenable)), and an async predicate does not type-check
either — its `Promise<boolean>` is not a `boolean` (and, being truthy,
would have silently always passed).

###### Example

```ts
// boolean form: gate a value
Ok(-1).ensure(
  (n) => n > 0,
  (n) => `negative: ${n}`,
); // Err("negative: -1")

// type-guard form: refine the success type
declare const r: Result<string | number, "e">;
const s = r.ensure(
  (v): v is string => typeof v === "string",
  () => "not_a_string" as const,
); // Result<string, "e" | "not_a_string">
```

###### Inherited from

```ts
ResultMethods.ensure;
```

###### Call Signature

```ts
ensure<E2>(predicate, onFail): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:265](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L265)

Boolean form of [ensure](#ensure-4) — validates without
refining, keeping the success type `T`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter   | Type                                                          |
| ----------- | ------------------------------------------------------------- |
| `predicate` | (`value`) => `boolean`                                        |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Inherited from

```ts
ResultMethods.ensure;
```

##### flatMap()

```ts
flatMap<U, E2>(f): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:130](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L130)

Sequence a dependent, `Result`-returning step (monadic bind).

Runs `f` only on `Ok`; `Err` and `Defect` pass through. The error channels
combine, widening to `E | E2`. If `f` throws, the throw becomes a `Defect`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the success type of the next step.          |
| `E2`           | the error type the next step may introduce. |

###### Parameters

| Parameter | Type                                   | Description                                                |
| --------- | -------------------------------------- | ---------------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`U`, `E2`&gt; | produces the next `Result` from the current success value. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

###### Inherited from

```ts
ResultMethods.flatMap;
```

##### flatMapErrCases()

```ts
flatMapErrCases<M>(f): Result<T | OkOf<MatchOut<M>>, ErrOf<MatchOut<M>>>;
```

Defined in: [packages/core/src/types.ts:313](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L313)

Sequence from an `Err` by producing another `Result` — the error-channel
mirror of [flatMap](#flatmap-4), **matching the error
exhaustively** ([ErrMatcher](#errmatcher); the combinator calls `.exhaustive()`).

Each branch returns a `Result`; the outgoing channels are the unions of the
branch-returned `Result`s' channels. A branch may return `defect(cause)`.
Runs only on `Err`; `Ok` and `Defect` pass through.

###### Type Parameters

| Type Parameter                                                                          | Description                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `unknown`&gt; \| `Defect`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                 |
| --------- | ---------------------------- | ----------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a fallback `Result`. |

###### Returns

`Result`&lt;`T` \| [`OkOf`](#okof)&lt;`MatchOut`&lt;`M`&gt;&gt;, [`ErrOf`](#errof)&lt;`MatchOut`&lt;`M`&gt;&gt;&gt;

###### Inherited from

```ts
ResultMethods.flatMapErrCases;
```

##### flatTap()

```ts
flatTap<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:166](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L166)

Run a **failable** side effect on the success value, keeping the original
value but threading the effect's error.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `E2`           | the error type the effect may introduce. |

###### Parameters

| Parameter | Type                                         | Description                                          |
| --------- | -------------------------------------------- | ---------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`unknown`, `E2`&gt; | the failable side effect; its `Ok` value is ignored. |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

This is to [tap](#tap-4) what
[flatMap](#flatmap-4) is to [map](#map-4):
`f` returns a `Result`, but its **success value is discarded** — on success
the original value flows through (`Result<T, E | E2>`), while an `Err` (or
`Defect`) from `f` short-circuits. Runs only on `Ok`; `Err` and `Defect` pass
through. If `f` throws, the throw becomes a `Defect`. Use it for a validation
or write whose _result_ matters but whose _value_ you don't need.

###### Inherited from

```ts
ResultMethods.flatTap;
```

##### flatTapErrCases()

```ts
flatTapErrCases<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:386](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L386)

Run a **failable** side effect on the error, keeping the original error but
threading the effect's own error — **matched exhaustively**
([ErrMatcher](#errmatcher)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter | Type                                                                              | Description                                                               |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `E2`&gt;&gt; | builds the match; each branch is a failable effect (its `Ok` is ignored). |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

The error-channel mirror of [flatTap](#flattap-4): each
branch returns a `Result` whose **success value is discarded** — on the
effect's `Ok` the original `Err` flows through, while an `Err`/`Defect` from a
branch short-circuits and threads its error. Note the asymmetry with a
_throw_: a branch that **returns** a Defect-state `Result` **replaces** the
original `Err` (Defect-dominance, the short-circuit rule — it is not
aggregated), whereas a branch that **throws** produces a `Defect`
aggregating `[thrown, original failure]` (observing a failure by throwing
never destroys it). A branch returning the injected `defect(cause)` marker —
reachable under a `returnType` pin — follows the _throw_ rule, since it is
the lint-clean, expression-position form of one.

###### Inherited from

```ts
ResultMethods.flatTapErrCases;
```

##### get()

```ts
get(this): T;
```

Defined in: [packages/core/src/types.ts:491](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L491)

Extract the success value.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`T`, `never`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

Compiles only when the error channel is empty (`E = never`) — eliminate
modeled errors first (`match` / `recoverErrCases` / `flatMapErrCases`), or reach for the
`getOr` / `getOrElse` / `getOrNull` / `getOrUndefined` family (which
recover an `Err`). If you get a `'this' context` type error here, that is
the gate: the receiver still has a non-`never` error channel.

`E = never` empties only the **modeled** error channel — a `Defect` can
still be present, and `get()` **rethrows its original cause** (it
_panics_); `Result<T, never>` does not mean `get()` cannot throw.

###### Inherited from

```ts
ResultMethods.get;
```

##### getErr()

```ts
getErr(this): E;
```

Defined in: [packages/core/src/types.ts:505](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L505)

Extract the modeled error.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`never`, `E`&gt; |

###### Returns

`E`

the `Err` value.

###### Remarks

Compiles only when the success channel is empty (`T = never`) — eliminate
the success case first. `T = never` is rarely the case in practice (a
`Result` you hold usually still has a success type), so to inspect an
error prefer an `isErr()` guard or, in tests, `@unthrown/vitest`'s
`toBeErrWith`. A `Defect` still **rethrows its original cause** (a defect is
a bug, not an absent value), so this does not mean `getErr()` can't throw.

###### Inherited from

```ts
ResultMethods.getErr;
```

##### getOr()

```ts
getOr<U>(fallback): T | U;
```

Defined in: [packages/core/src/types.ts:514](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L514)

The success value, or `fallback` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter  | Type | Description                                                                            |
| ---------- | ---- | -------------------------------------------------------------------------------------- |
| `fallback` | `U`  | returned when the result is an `Err` (may be a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
it is never silently replaced.

###### Inherited from

```ts
ResultMethods.getOr;
```

##### getOrElse()

```ts
getOrElse<U>(f): T | U;
```

Defined in: [packages/core/src/types.ts:522](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L522)

The success value, or `f(error)` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter | Type             | Description                                                                                       |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `f`       | (`error`) => `U` | lazily computes the fallback from the error (may return a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrElse;
```

##### getOrNull()

```ts
getOrNull(): T | null;
```

Defined in: [packages/core/src/types.ts:528](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L528)

The success value, or `null` on `Err`.

###### Returns

`T` \| `null`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrNull;
```

##### getOrThrow()

```ts
getOrThrow(this): T;
```

Defined in: [packages/core/src/types.ts:558](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L558)

The success value, or **throw** the modeled error on `Err`.

###### Parameters

| Parameter | Type                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `this`    | \[`E`\] _extends_ \[`never`\] ? `"unthrown: getOrThrow is unnecessary here — the Err channel is empty (E = never), so there is nothing to throw. Use get() instead."` : `Result`&lt;`T`, `E`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

A deliberate escape hatch off the errors-as-values model — it **throws the
`Err` value as-is** at the call site. Its purpose is to move a literal
`throw` behind a method, so a `no-throw` lint rule can ban raw throws while
this one sanctioned extraction remains — _not_ to replace principled
handling. When you can keep the error a value, prefer
[match](#match-4) / [recoverErrCases](#recovererrcases-4) /
[flatMapErrCases](#flatmaperrcases-4).

Type-gated as the **complement** of [get](#get-4): it
compiles only when the error channel is **non-empty** (`E` is not `never`) —
there must be a modeled error for it to throw. On a `Result<T, never>` there
is nothing to throw, so `getOrThrow` does not compile; use `get()` (which
gates the other way). Together they partition extraction by the error
channel's state, with no overlap.

###### Throws

the modeled `error` on `Err`; re-throws the original `cause` on a
`Defect` (a panic, like the rest of the `getOr…` family).

###### Inherited from

```ts
ResultMethods.getOrThrow;
```

##### getOrUndefined()

```ts
getOrUndefined(): T | undefined;
```

Defined in: [packages/core/src/types.ts:534](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L534)

The success value, or `undefined` on `Err`.

###### Returns

`T` \| `undefined`

###### Throws

Re-throws on a `Defect`.

###### Inherited from

```ts
ResultMethods.getOrUndefined;
```

##### isDefect()

```ts
isDefect(): this is DefectView<T, E>;
```

Defined in: [packages/core/src/types.ts:569](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L569)

Whether this result is a `Defect` — narrows `this` to its [DefectView](#defectview) on `true`.

###### Returns

`this is DefectView<T, E>`

###### Inherited from

```ts
ResultMethods.isDefect;
```

##### isErr()

```ts
isErr(): this is ErrView<E, T>;
```

Defined in: [packages/core/src/types.ts:567](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L567)

Whether this result is `Err` — narrows `this` to its [ErrView](#errview) on `true`.

###### Returns

`this is ErrView<E, T>`

###### Inherited from

```ts
ResultMethods.isErr;
```

##### isOk()

```ts
isOk(): this is OkView<T, E>;
```

Defined in: [packages/core/src/types.ts:565](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L565)

Whether this result is `Ok` — narrows `this` to its [OkView](#okview) on `true`.

###### Returns

`this is OkView<T, E>`

###### Inherited from

```ts
ResultMethods.isOk;
```

##### let()

```ts
let<K, U>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E>;
```

Defined in: [packages/core/src/types.ts:205](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L205)

Do-notation: run `f` for a **plain value** and bind it under `name` in the
accumulating object scope. The pure-value counterpart of [bind](#bind-4).

###### Type Parameters

| Type Parameter         | Description                        |
| ---------------------- | ---------------------------------- |
| `K` _extends_ `string` | the key the value is stored under. |
| `U`                    | the value type.                    |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `name`    | `K`                                                         | the scope key.                               |
| `f`       | (`scope`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | computes a value from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E`&gt;

###### Remarks

`f` receives the scope and returns a value (not a `Result`); it is added as
`{ ...scope, [name]: value }`. Runs only on `Ok`; `Err`/`Defect` pass
through. A throw becomes a `Defect`. An async callback is rejected at
compile time ([NotThenable](#notthenable)).

###### Inherited from

```ts
ResultMethods.let;
```

##### map()

```ts
map<U>(f): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:119](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L119)

Transform the success value with `f`.

Runs `f` only on `Ok`; `Err` and `Defect` pass through untouched. If `f`
throws, the thrown value is captured as a `Defect`.

An async callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter | Description              |
| -------------- | ------------------------ |
| `U`            | the mapped success type. |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `f`       | (`value`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | maps the current success value to a new one. |

###### Returns

`Result`&lt;`U`, `E`&gt;

###### Inherited from

```ts
ResultMethods.map;
```

##### mapErrCases()

```ts
mapErrCases<M>(f): Result<T, Exclude<MatchOut<M>, Defect>>;
```

Defined in: [packages/core/src/types.ts:297](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L297)

Transform the modeled error by **matching it exhaustively**.

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                          |
| --------- | ---------------------------- | -------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match over the error (returns the un-terminated builder). |

###### Returns

`Result`&lt;`T`, `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;&gt;

###### Remarks

The callback receives `match(error)` (an [ErrMatcher](#errmatcher)) and the
injected `defect` helper. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `mapErrCases` calls `.exhaustive()` itself, so a
missing case is a compile error at the call site (there is no `.exhaustive()`
to forget, and no way to slip in `.otherwise()`). The outgoing error type is
the union of the branch returns with the `Defect` arm subtracted
(`Exclude<O, Defect>`) — a branch returning `defect(cause)` converts that case
to a `Defect` and drops it from `E`. Runs only on `Err`; `Ok` and `Defect`
pass through. A branch that throws also becomes a `Defect`.

**Name every case.** Match on anything the matcher supports — `_tag`,
`code`, structural shape, guards — and group the cases that share a handler
with `.with(a, b, handler)`. `.with(P._, …)` is the wildcard **escape
hatch**, not the default: it makes any match exhaustive, so it also absorbs
every case `E` grows later. Two uses are sanctioned — a helper generic in
`E`, where no arm list can prove exhaustiveness against an unresolved type
parameter, and an `E` that is a single type rather than a union of cases
(see [P](#p) for both). `@unthrown/oxlint`'s `no-catch-all-pattern` (in
its `recommended` preset) flags the rest.

###### Inherited from

```ts
ResultMethods.mapErrCases;
```

##### match()

```ts
match<ROk, RDefect, M>(cases): ROk | RDefect | MatchOut<M>;
```

Defined in: [packages/core/src/types.ts:470](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L470)

Exhaustively fold all three runtime states into a single value.

###### Type Parameters

| Type Parameter                                   | Description                                            |
| ------------------------------------------------ | ------------------------------------------------------ |
| `ROk`                                            | the `ok` handler return type.                          |
| `RDefect`                                        | the `defect` handler return type.                      |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the `errCases` handler returns. |

###### Parameters

| Parameter        | Type                                                                                              | Description                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `cases`          | \{ `defect`: (`cause`) => `RDefect`; `errCases`: (`matcher`) => `M`; `ok`: (`value`) => `ROk`; \} | the `ok`/`defect` handlers plus the `errCases` matcher builder. |
| `cases.defect`   | (`cause`) => `RDefect`                                                                            | -                                                               |
| `cases.errCases` | (`matcher`) => `M`                                                                                | -                                                               |
| `cases.ok`       | (`value`) => `ROk`                                                                                | -                                                               |

###### Returns

`ROk` \| `RDefect` \| `MatchOut`&lt;`M`&gt;

###### Remarks

Exactly one handler runs. Together with the throw-to-Defect guarantee, this
is typically the single place a pipeline is handled at the edge — mapping
`Ok`/`Err`/`Defect` to (for example) 2xx / 4xx / 5xx with no `try`/`catch`.

The `errCases` handler does not take a single blanket callback: it receives
`match(error)` (an [ErrMatcher](#errmatcher)) and **matches the error exhaustively**,
exactly like the error combinators — which is why the key carries the same
`…Cases` suffix. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `match` calls `.exhaustive()` itself, so a missing
case is a compile error at the call site (no `.exhaustive()` to forget).
Folding at the edge names every case too — `.with(P._, …)` is the wildcard
escape hatch, not the default. Unlike the combinators the branches
receive **no `defect` helper** — `match` is total elimination to a value,
with no `Defect` output channel; the `defect` case handles a `Result` that
already carries one. (A `Result` is also a discriminated union — for richer
whole-`Result` matching, `match(result).with(…)`.)

###### Inherited from

```ts
ResultMethods.match;
```

##### recoverDefect()

```ts
recoverDefect<U, E2>(f): Result<T | U, E | E2>;
```

Defined in: [packages/core/src/types.ts:406](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L406)

Recover from a `Defect` — the **only** combinator that can touch one.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `U`            | a success type the recovery may produce. |
| `E2`           | an error type the recovery may produce.  |

###### Parameters

| Parameter | Type                                   | Description                                               |
| --------- | -------------------------------------- | --------------------------------------------------------- |
| `f`       | (`cause`) => `Result`&lt;`U`, `E2`&gt; | maps the Defect's unknown cause to a recovering `Result`. |

###### Returns

`Result`&lt;`T` \| `U`, `E` \| `E2`&gt;

###### Remarks

Runs `f` only when a `Defect` is present, re-entering the modeled world by
returning a `Result` (an `Ok` or a fresh `Err`). `Ok` and `Err` pass
through. Recovering a Defect should be rare: usually you let it bubble to
the edge. If `f` throws, the throw becomes a new `Defect`.

###### Inherited from

```ts
ResultMethods.recoverDefect;
```

##### recoverErrCases()

```ts
recoverErrCases<M>(f): Result<T | Exclude<MatchOut<M>, Defect>, never>;
```

Defined in: [packages/core/src/types.ts:331](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L331)

Recover from an `Err` by producing a success value, emptying the error
channel — **matching the error exhaustively** ([ErrMatcher](#errmatcher)). Pairs
with [recoverDefect](#recoverdefect-4).

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                             |
| --------- | ---------------------------- | ------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a success value. |

###### Returns

`Result`&lt;`T` \| `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;, `never`&gt;

###### Remarks

The result type is `Result<T | U, never>`, but `never` describes only the
**error** channel — a `Defect` can still be present at runtime. A branch may
return `defect(cause)` (which stays a `Defect`, not a recovery). Runs only on
`Err`; `Ok` and `Defect` pass through.

###### Inherited from

```ts
ResultMethods.recoverErrCases;
```

##### tap()

```ts
tap<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:149](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L149)

Run a side effect on the success value and pass the `Result` through
unchanged.

Runs only on `Ok`. If `f` throws, the throw becomes a `Defect`. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                                    |
| --------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `f`       | (`value`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f`'s return value is **ignored** — a `Result` returned by the effect
compiles but is discarded, `Err` and all. If the effect can fail, sequence
it instead of tapping it: a `Result`-returning effect goes in
[flatTap](#flattap-4); an `AsyncResult`-returning effect
cannot be sequenced from the sync surface — lift the chain with
[toAsync](#toasync-3) and use the async
[flatTap](#flattap-3) (which accepts both).

###### Inherited from

```ts
ResultMethods.tap;
```

##### tapDefect()

```ts
tapDefect<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:416](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L416)

Run a side effect on a present `Defect`'s cause (e.g. logging) and pass the
`Defect` through unchanged. If `f` throws, the result is a `Defect` whose
cause is an `AggregateError` of `[thrown, original failure]` — observing a
failure never destroys it. An async callback is rejected at compile time
([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                             |
| --------- | ----------------------------------------------------------- | --------------------------------------- |
| `f`       | (`cause`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the unknown cause. |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Inherited from

```ts
ResultMethods.tapDefect;
```

##### tapErrCases()

```ts
tapErrCases<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:358](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L358)

Run a side effect on the error — **matched exhaustively** ([ErrMatcher](#errmatcher))
— and pass the `Result` through unchanged.

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                                                             | Description                                                        |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`R` & [`NotThenable`](#notthenable)&lt;`R`&gt;&gt; | builds the match; branch returns are ignored, bar `defect(cause)`. |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

The callback builds a match whose branches run side effects; their return
values are ignored and the original `Err` flows through. Exhaustive like the
transformers, and like them it wants every case named — `.with(P._, …)`
remains the wildcard escape hatch. If a branch throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown, original
failure]` — observing a failure never destroys it. An **async branch is
rejected at compile time** ([NotThenable](#notthenable) on the builder output):
because the branch results are discarded, a returned `Promise` would float
unobserved and its rejection would vanish. The one branch return that is
**not** discarded is the injected `defect(cause)` marker: it is the
lint-clean, expression-position form of a `throw`, so it follows the throw
rule above (an `AggregateError` of `[the branch's cause, original
failure]`), never a silent no-op. A failable
`Result`-returning effect belongs in
[flatTapErrCases](#flattaperrcases-4).

###### Inherited from

```ts
ResultMethods.tapErrCases;
```

##### tapFailure()

```ts
tapFailure<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:442](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L442)

Run a side effect on **any failure** — `Err` or `Defect` — and pass the
`Result` through unchanged. The one cross-channel observer, for the shared
"it went KO" concern (logging, metrics, rollback) that would otherwise be
duplicated across [tapErrCases](#taperrcases-4) and
[tapDefect](#tapdefect-4).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                          | Description                                                             |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `f`       | (`failure`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the failure variant (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f` receives the narrowed **failure variant** ([FailureView](#failureview)), not a
payload — the payload union `E | unknown` would collapse to `unknown` and
lose `E`'s typing. Branch on `failure.tag` to reach the typed payload
(`"Err"` → `failure.error: E`, `"Defect"` → `failure.cause: unknown`), or
treat it opaquely for a shared logger. Runs on `Err` and `Defect`; `Ok`
passes through. It **observes without consuming**: the failure flows on
unchanged — to also recover, use
[recoverErrCases](#recovererrcases-4) /
[recoverDefect](#recoverdefect-4) (deliberately separate
acts) or [match](#match-4) at the edge. If `f` throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown,
original failure]` — observing a failure never destroys it. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Inherited from

```ts
ResultMethods.tapFailure;
```

##### toAsync()

```ts
toAsync(): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:572](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L572)

Lift this synchronous `Result` into an [AsyncResult](#asyncresult).

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

###### Inherited from

```ts
ResultMethods.toAsync;
```

---

### AsyncErrOf

```ts
type AsyncErrOf<R> = R extends Awaitable<infer Res> ? ErrOf<Res> : never;
```

Defined in: [packages/core/src/types.ts:1046](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L1046)

Extract the error type `E` from an [AsyncResult](#asyncresult) type — the async
counterpart of [ErrOf](#errof).

#### Type Parameters

| Type Parameter | Description                        |
| -------------- | ---------------------------------- |
| `R`            | the `AsyncResult` type to inspect. |

#### Example

```ts
type E = AsyncErrOf<AsyncResult<User, NotFound>>; // NotFound
```

---

### AsyncOkOf

```ts
type AsyncOkOf<R> = R extends Awaitable<infer Res> ? OkOf<Res> : never;
```

Defined in: [packages/core/src/types.ts:1032](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L1032)

Extract the success type `T` from an [AsyncResult](#asyncresult) type — the async
counterpart of [OkOf](#okof).

#### Type Parameters

| Type Parameter | Description                        |
| -------------- | ---------------------------------- |
| `R`            | the `AsyncResult` type to inspect. |

#### Example

```ts
type T = AsyncOkOf<AsyncResult<User, NotFound>>; // User
```

---

### Awaitable

```ts
type Awaitable<T> = object;
```

Defined in: [packages/core/src/types.ts:718](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L718)

A success-only thenable: awaitable, but deliberately **not** a full
`PromiseLike`.

#### Remarks

An [AsyncResult](#asyncresult)'s internal promise never rejects, so `await`-ing one
always yields a [Result](#result) and never throws — there is no rejection
channel to model, and none is advertised. At runtime it is still a thenable
(the only way `await` can collapse it), and `Promise.all` / `Promise.resolve`
will still adopt it — harmlessly, since it settles to a `Result` and never
rejects. What the narrowing prevents is treating it as a full promise:
`.catch()` / `.finally()` do not type-check, because there is no rejection to
handle.

#### Type Parameters

| Type Parameter | Description                    |
| -------------- | ------------------------------ |
| `T`            | the value `await` resolves to. |

#### Methods

##### then()

```ts
then<R>(onfulfilled?): PromiseLike<R>;
```

Defined in: [packages/core/src/types.ts:719](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L719)

###### Type Parameters

| Type Parameter | Default type |
| -------------- | ------------ |
| `R`            | `T`          |

###### Parameters

| Parameter      | Type                                                     |
| -------------- | -------------------------------------------------------- |
| `onfulfilled?` | ((`value`) => `R` \| `PromiseLike`&lt;`R`&gt;) \| `null` |

###### Returns

`PromiseLike`&lt;`R`&gt;

---

### ErrMatcher

```ts
type ErrMatcher<E> = ReturnType<typeof match>;
```

Defined in: [packages/core/src/types.ts:57](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L57)

The built-in match builder over an error union `E`, as produced by
`match(error)`. This is what an error combinator's callback receives — chain
`.with(pattern, handler)` on it; the combinator itself calls `.exhaustive()`,
so the callback returns the **un-terminated** builder.

#### Type Parameters

| Type Parameter | Description                    |
| -------------- | ------------------------------ |
| `E`            | the error union being matched. |

#### Remarks

Named via `ReturnType<typeof match<E>>` (i.e. `Matcher<E, E, never>`),
keeping this alias stable however the builder evolves.

---

### ErrOf

```ts
type ErrOf<R> = R extends object ? E : never;
```

Defined in: [packages/core/src/types.ts:1018](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L1018)

Extract the error type `E` from a `Result` type — the counterpart of
[OkOf](#okof).

#### Type Parameters

| Type Parameter | Description                   |
| -------------- | ----------------------------- |
| `R`            | the `Result` type to inspect. |

#### Example

```ts
type E = ErrOf<Result<User, NotFound>>; // NotFound
```

---

### FailureView

```ts
type FailureView<E, T> = ErrView<E, T> | DefectView<T, E>;
```

Defined in: [packages/core/src/types.ts:658](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L658)

A failure variant of a [Result](#result): an [ErrView](#errview) **or** a
[DefectView](#defectview). This is what a `tapFailure` callback receives — the
discriminated variant rather than a payload, because the payload union
`E | unknown` would collapse to `unknown` and lose `E`'s typing. Branch on
`tag` to narrow (`"Err"` → `.error: E`, `"Defect"` → `.cause: unknown`).

#### Type Parameters

| Type Parameter | Default type | Description                                                    |
| -------------- | ------------ | -------------------------------------------------------------- |
| `E`            | -            | the modeled error type.                                        |
| `T`            | `never`      | the success value type (phantom here; a failure carries none). |

#### Remarks

Like [ErrView](#errview), the error type comes **first** (`FailureView<E, T>`) —
the error is the payload you are usually here for, and a shared observer can
spell just `FailureView<MyError>`.

#### Example

```ts
const logKo = (f: FailureView<ApiError>) =>
  f.tag === "Err" ? logger.warn(f.error) : logger.error(f.cause);
result.tapFailure(logKo);
```

---

### Matcher

```ts
type Matcher<E, Remaining, O, Declared> = object;
```

Defined in: [packages/core/src/matcher.ts:149](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L149)

The match builder over an input union `E`. `Remaining` tracks the cases not
yet covered by a `.with(…)` arm; `O` accumulates the branch output union.
`.exhaustive` is callable only once `Remaining` is `never` — which is what
the `ExhaustiveMatch` constraint requires — and `.run()` executes it.

#### Type Parameters

| Type Parameter | Default type | Description                              |
| -------------- | ------------ | ---------------------------------------- |
| `E`            | -            | the full input union being matched.      |
| `Remaining`    | -            | the cases not yet covered.               |
| `O`            | -            | the union of branch return types so far. |
| `Declared`     | `Unset`      | -                                        |

#### Properties

| Property                             | Type                                                                                                                                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Defined in                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="exhaustive"></a> `exhaustive` | \[`Remaining`\] _extends_ \[`never`\] ? () => `PinnedOut`&lt;`Declared`, `O`&gt; : `NonExhaustive`&lt;`Remaining`&gt;                                                             | Terminate the match. Typed callable only when every case is covered (`Remaining` is `never`); otherwise it is a branded diagnostic object naming the remaining cases, and the builder fails the `ExhaustiveMatch` constraint at the combinator call site.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [packages/core/src/matcher.ts:221](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L221) |
| <a id="returntype"></a> `returnType` | \[`O`\] _extends_ \[`never`\] ? \[`Declared`\] _extends_ \[`Unset`\] ? &lt;`R`&gt;() => [`Matcher`](#matcher)&lt;`E`, `Remaining`, `never`, `R`&gt; : `PinTooLate` : `PinTooLate` | Declare the match's output type up front: every subsequent branch handler is checked against `R`, and the match evaluates to `R` instead of the union of whatever the branches happened to return. **Remarks** Reach for it when the output is **decided by a signature rather than by the branches** — most sharply in code generic in `E`, where the fold's type has to be declared. It also stops a drifting branch from silently widening the outgoing type, reports the mismatch **on the offending branch**, and gives branch returns a contextual type (so object literals need no annotation). A branch may still return the injected `defect` helper's marker; the defect channel is not part of the declared output. Callable **before any arm has produced an output**, and only once (mirroring ts-pattern's up-front pin): once there is an inferred output for the pin to contradict — or the builder is already pinned — this is typed as a non-callable diagnostic. In practice that means calling it directly after `match(…)`; the gate is about output rather than position, so an earlier arm whose handler returns `never` (it always throws) contributes nothing and does not close it — sound, since a `never` branch can contradict no declared type. A no-op at runtime. **Type Param** **R** the declared output type of every branch. | [packages/core/src/matcher.ts:209](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L209) |

#### Methods

##### run()

```ts
run(): PinnedOut<Declared, O>;
```

Defined in: [packages/core/src/matcher.ts:228](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L228)

Execute the match (the combinators call this; it runs `.exhaustive()`).
A value with no matching arm throws [NonExhaustiveError](#nonexhaustiveerror) —
unreachable for well-typed callers.

###### Returns

`PinnedOut`&lt;`Declared`, `O`&gt;

##### with()

###### Call Signature

```ts
with<O2>(pattern, handler): Matcher<E, never, O | O2, Declared>;
```

Defined in: [packages/core/src/matcher.ts:164](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L164)

The catch-all arm: `.with(P._, handler)` / `.with(P.any, handler)` — the
wildcard **escape hatch**, not the way to handle a concrete error union
(name those cases; `@unthrown/oxlint`'s `no-catch-all-pattern`, in its
`recommended` preset, flags the wildcard).

It is a **state transition**, not a computation — it returns
`Matcher<E, never, …>` with the remaining cases literally `never`, so the
builder is provably exhaustive even when `E` is an unresolved type
parameter (a lazily-deferred `Exclude<E, unknown>` would not resolve
there). That is what makes it irreplaceable for a helper generic in `E`:
it can terminate a match no arm list could (issue #145) — one of the two
sanctioned uses (see [P](#p)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `O2`           |

###### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `pattern` | [`UniversalPattern`](#universalpattern)             |
| `handler` | (`value`) => `BranchReturn`&lt;`Declared`, `O2`&gt; |

###### Returns

[`Matcher`](#matcher)&lt;`E`, `never`, `O` \| `O2`, `Declared`&gt;

###### Call Signature

```ts
with<Pts, O2>(...args): Matcher<E, Exclude<Remaining, MatchedOf<Pts[number]>>, O | O2, Declared>;
```

Defined in: [packages/core/src/matcher.ts:175](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L175)

Add an arm: one or more patterns sharing a single handler (grouped
patterns — `matcher.with(P.tag("A"), P.tag("B"), handler)`). The handler
receives the input narrowed to what the patterns match (computed against
`Remaining`, so cases already handled by earlier arms are excluded); the
matched cases are subtracted from `Remaining`.

###### Type Parameters

| Type Parameter                                    |
| ------------------------------------------------- |
| `Pts` _extends_ readonly \[`unknown`, `unknown`\] |
| `O2`                                              |

###### Parameters

| Parameter | Type                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| ...`args` | \[`...patterns: Pts[]`, (`value`) => `BranchReturn`&lt;`Declared`, `O2`&gt;\] |

###### Returns

[`Matcher`](#matcher)&lt;`E`, `Exclude`&lt;`Remaining`, `MatchedOf`&lt;`Pts`\[`number`\]&gt;&gt;, `O` \| `O2`, `Declared`&gt;

---

### NotThenable

```ts
type NotThenable<R> = [R] extends [PromiseLike<unknown>]
  ? "unthrown: combinator callbacks are synchronous — lift async work with fromPromise and compose with flatMap"
  : unknown;
```

Defined in: [packages/core/src/types.ts:40](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L40)

Compile-time rejection of a thenable callback result — the type-level
enforcement of "combinator callbacks are synchronous" (see the
[AsyncResult](#asyncresult) remarks).

#### Type Parameters

| Type Parameter | Description                          |
| -------------- | ------------------------------------ |
| `R`            | the callback's inferred return type. |

#### Remarks

Resolves to `unknown` (a no-op in an intersection) for any non-thenable `R`,
and to an explanatory string-literal type when `R` is a `PromiseLike` — so an
`async` callback fails to compile with the explanation in the error. Without
this, `async () => …` would be assignable to `() => void`, and its rejection
would escape the pipeline as an unhandled rejection instead of a `Defect`.
Lift async work with [fromPromise](#frompromise) and compose it with `flatMap`.

---

### OkOf

```ts
type OkOf<R> = R extends object ? T : never;
```

Defined in: [packages/core/src/types.ts:1004](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L1004)

Extract the success type `T` from a `Result` type — derive one type from
another instead of restating it (e.g. the payload a function returns).

#### Type Parameters

| Type Parameter | Description                   |
| -------------- | ----------------------------- |
| `R`            | the `Result` type to inspect. |

#### Example

```ts
type R = Result<User, NotFound>;
type U = OkOf<R>; // User
type E = ErrOf<R>; // NotFound
```

---

### PatternMatcher

```ts
type PatternMatcher<M> = object;
```

Defined in: [packages/core/src/matcher.ts:49](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L49)

A `P.*` pattern: a runtime predicate plus the phantom type `M` it matches.
The phantom is declaration-only (never present at runtime); it drives the
type-level narrowing (`Extract`) and exhaustiveness (`Exclude`).

#### Type Parameters

| Type Parameter | Description                    |
| -------------- | ------------------------------ |
| `M`            | the type this pattern matches. |

#### Properties

| Property                                     | Modifier   | Type                   | Defined in                                                                                                                                               |
| -------------------------------------------- | ---------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="matches"></a> `[MATCHES]?`            | `readonly` | `M`                    | [packages/core/src/matcher.ts:51](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L51) |
| <a id="pattern_brand"></a> `[PATTERN_BRAND]` | `readonly` | (`value`) => `boolean` | [packages/core/src/matcher.ts:50](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L50) |

---

### TaggedErrorConstructor

```ts
type TaggedErrorConstructor<Tag> = <A>(args) => TaggedErrorInstance<Tag, A>;
```

Defined in: [packages/core/src/tagged.ts:39](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/tagged.ts#L39)

The class constructor returned by [TaggedError](#taggederror). Generic in its payload:
apply it with an instantiation expression at the `extends` site.

#### Type Parameters

| Type Parameter           | Description                      |
| ------------------------ | -------------------------------- |
| `Tag` _extends_ `string` | the string literal discriminant. |

#### Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `args`    | keyof `A` _extends_ `never` ? `void` : `A` & `object` |

#### Returns

[`TaggedErrorInstance`](#taggederrorinstance)&lt;`Tag`, `A`&gt;

#### Remarks

When the payload is empty, the constructor takes **no** arguments (the
`keyof A extends never ? void : A` trick); otherwise it takes the payload. The
`name`, `message`, and `stack` keys are all **rejected** (`?: never`) because
all three are reserved: `name` is the display label, `message` is the human
string owned by `Error`, and `stack` is `Error`'s trace. Set the message the
standard way — `override message = "…"` (or a constructor override) on the
subclass — never as a free-form per-call payload field. The reservations are
enforced at the call site, mirroring how [TaggedErrorInstance](#taggederrorinstance) excludes
all three. (`cause` is deliberately **not** reserved: `Error.cause` is
`unknown`, so a typed payload `cause` is a legitimate structured field.)

---

### TaggedErrorInstance

```ts
type TaggedErrorInstance<Tag, A> = Error &
  Readonly<Omit<A, "name" | "message" | "stack">> &
  object;
```

Defined in: [packages/core/src/tagged.ts:16](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/tagged.ts#L16)

The instance shape produced by a [TaggedError](#taggederror) class: an `Error` plus a
`_tag` discriminant and the (readonly) payload fields.

#### Type Declaration

| Name   | Type  | Defined in                                                                                                                                             |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_tag` | `Tag` | [packages/core/src/tagged.ts:17](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/tagged.ts#L17) |

#### Type Parameters

| Type Parameter           | Description                      |
| ------------------------ | -------------------------------- |
| `Tag` _extends_ `string` | the string literal discriminant. |
| `A` _extends_ `Props`    | the payload object type.         |

---

### UniversalPattern

```ts
type UniversalPattern = PatternMatcher<unknown> & object;
```

Defined in: [packages/core/src/matcher.ts:63](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L63)

The statically-known universal pattern — the type of `P._` / `P.any` only.
The phantom `UNIVERSAL` marker is _required_, so no other
`PatternMatcher<unknown>` (e.g. a `P.when` guard that happens to be
universal) is assignable: the catch-all `.with` overload must only fire for
a pattern the type system KNOWS covers everything.

#### Type Declaration

| Name          | Type   | Defined in                                                                                                                                               |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[UNIVERSAL]` | `true` | [packages/core/src/matcher.ts:64](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L64) |

## Methods

### AsyncResultMethods

```ts
type AsyncResultMethods<T, E> = object;
```

Defined in: [packages/core/src/types.ts:742](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L742)

The async method surface every [AsyncResult](#asyncresult) carries — the combinators
(`map`, `flatMap`, `mapErrCases`, `match`, `get`, …) with their asynchronous
signatures, documented one per entry below. The async mirror of
[ResultMethods](#resultmethods): each entry links its synchronous counterpart and states
only the async delta.

#### Remarks

Like [ResultMethods](#resultmethods), this type exists to **document** the surface — not
to be authored against; you obtain it by holding an `AsyncResult`. Its
combinator callbacks are **synchronous** (a raw `Promise` may never enter — see
the [AsyncResult](#asyncresult) remarks); async work re-enters via [fromPromise](#frompromise)
and composes with `flatMap`. Systematic differences from the sync surface: the
binds return an `AsyncResult` (and additionally accept one), and the
eliminators return a `Promise`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Methods

##### as()

```ts
as<U>(value): AsyncResult<U, E>;
```

Defined in: [packages/core/src/types.ts:809](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L809)

Asynchronous [as](#as-4): replaces the value with `value`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `U`            |

###### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `U`  |

###### Returns

`AsyncResult`&lt;`U`, `E`&gt;

##### bind()

```ts
bind<K, U, E2>(name, f): AsyncResult<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E | E2>;
```

Defined in: [packages/core/src/types.ts:793](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L793)

Asynchronous [bind](#bind-4) (do-notation). `f` may return
a `Result` **or** an `AsyncResult`; its value is bound under `name` in the
accumulating scope.

###### Type Parameters

| Type Parameter         |
| ---------------------- |
| `K` _extends_ `string` |
| `U`                    |
| `E2`                   |

###### Parameters

| Parameter | Type                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `name`    | `K`                                                                                                                |
| `f`       | (`scope`) => \| `Result`&lt;`U`, `E2`&gt; \| [`Awaitable`](#awaitable)&lt;`Result`&lt;`U`, `E2`&gt;&gt; & `object` |

###### Returns

`AsyncResult`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E` \| `E2`&gt;

##### discard()

```ts
discard(): AsyncResult<void, E>;
```

Defined in: [packages/core/src/types.ts:811](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L811)

Asynchronous [discard](#discard-4): drops the value, collapsing the success type to `void`.

###### Returns

`AsyncResult`&lt;`void`, `E`&gt;

##### ensure()

###### Call Signature

```ts
ensure<U, E2>(predicate, onFail): AsyncResult<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:819](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L819)

Asynchronous [ensure](#ensure-4): validate the success
value — and, with a type-guard predicate (this overload), **refine** it —
failing into the modeled channel with `Err(onFail(value))`. Both callbacks
are synchronous (an async `onFail` is rejected at compile time,
[NotThenable](#notthenable)); a throw in either becomes a `Defect`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `U`            |
| `E2`           |

###### Parameters

| Parameter   | Type                                                          |
| ----------- | ------------------------------------------------------------- |
| `predicate` | (`value`) => `value is U`                                     |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; |

###### Returns

`AsyncResult`&lt;`U`, `E` \| `E2`&gt;

###### Call Signature

```ts
ensure<E2>(predicate, onFail): AsyncResult<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:824](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L824)

Boolean form of the asynchronous [ensure](#ensure-4) — validates without refining, keeping `T`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter   | Type                                                          |
| ----------- | ------------------------------------------------------------- |
| `predicate` | (`value`) => `boolean`                                        |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; |

###### Returns

`AsyncResult`&lt;`T`, `E` \| `E2`&gt;

##### flatMap()

```ts
flatMap<U, E2>(f): AsyncResult<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:762](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L762)

Asynchronous [flatMap](#flatmap-4). Unlike the sync form,
`f` may return a `Result` **or** an `AsyncResult` (never a raw `Promise`); a
throw becomes a `Defect`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `U`            |
| `E2`           |

###### Parameters

| Parameter | Type                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `f`       | (`value`) => \| `Result`&lt;`U`, `E2`&gt; \| [`Awaitable`](#awaitable)&lt;`Result`&lt;`U`, `E2`&gt;&gt; & `object` |

###### Returns

`AsyncResult`&lt;`U`, `E` \| `E2`&gt;

###### Remarks

The async branch of `f`'s return type is spelled `Awaitable<Result<U, E2>> &
{ flatMap: unknown }` rather than `AsyncResult<U, E2>`: this is what you get
by returning an `AsyncResult` (it satisfies both), but inference runs through
the `Awaitable` then-channel so `U`/`E2` stay precise instead of collapsing
to `unknown`, while the `{ flatMap: unknown }` marker still rejects a bare
`Promise` (it has no `flatMap`). Just return a `Result` or an `AsyncResult`.

##### flatMapErrCases()

```ts
flatMapErrCases<M>(f): AsyncResult<
  | T
  | OkOf<MatchOut<M>>
  | AsyncOkOf<MatchOut<M>>,
  | ErrOf<MatchOut<M>>
  | AsyncErrOf<MatchOut<M>>>;
```

Defined in: [packages/core/src/types.ts:842](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L842)

Asynchronous [flatMapErrCases](#flatmaperrcases-4) — the same
exhaustive [ErrMatcher](#errmatcher) form. Unlike the sync form, a branch may
return a `Result` **or** an `AsyncResult`.

###### Type Parameters

| Type Parameter                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt; \| `Result`&lt;`unknown`, `unknown`&gt; \| `AsyncResult`&lt;`unknown`, `unknown`&gt; \| `Defect`&gt; |

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `f`       | (`matcher`, `defect`) => `M` |

###### Returns

`AsyncResult`&lt;
\| `T`
\| [`OkOf`](#okof)&lt;`MatchOut`&lt;`M`&gt;&gt;
\| [`AsyncOkOf`](#asyncokof)&lt;`MatchOut`&lt;`M`&gt;&gt;,
\| [`ErrOf`](#errof)&lt;`MatchOut`&lt;`M`&gt;&gt;
\| [`AsyncErrOf`](#asyncerrof)&lt;`MatchOut`&lt;`M`&gt;&gt;&gt;

##### flatTap()

```ts
flatTap<E2>(f): AsyncResult<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:783](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L783)

Asynchronous [flatTap](#flattap-4) — a failable tap that
keeps the original value. `f` may return a `Result` **or** an `AsyncResult`;
its `Ok` value is discarded, an `Err`/`Defect` short-circuits, and a throw
becomes a `Defect`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter | Type                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `f`       | (`value`) => \| `Result`&lt;`unknown`, `E2`&gt; \| [`Awaitable`](#awaitable)&lt;`Result`&lt;`unknown`, `E2`&gt;&gt; & `object` |

###### Returns

`AsyncResult`&lt;`T`, `E` \| `E2`&gt;

##### flatTapErrCases()

```ts
flatTapErrCases<E2>(f): AsyncResult<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:889](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L889)

Asynchronous [flatTapErrCases](#flattaperrcases-4) — the
error-channel mirror of `flatTap`. `f` may return a `Result` **or** an
`AsyncResult`; its `Ok` value is discarded, an `Err`/`Defect` from `f`
threads through, and if `f` throws — or a branch returns the injected
`defect(cause)` marker, the expression-position form of a throw — the result
is a `Defect` whose cause is an `AggregateError` of `[thrown, original
failure]` — observing a failure never destroys it.

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter | Type                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `E2`&gt; \| `AsyncResult`&lt;`unknown`, `E2`&gt;&gt; |

###### Returns

`AsyncResult`&lt;`T`, `E` \| `E2`&gt;

##### get()

```ts
get(this): Promise<T>;
```

Defined in: [packages/core/src/types.ts:936](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L936)

Asynchronous [get](#get-4). Compiles only when the
error channel is empty (`this: AsyncResult<T, never>`); the returned promise
rejects on a `Defect` (rethrowing its cause).

###### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `this`    | `AsyncResult`&lt;`T`, `never`&gt; |

###### Returns

`Promise`&lt;`T`&gt;

##### getErr()

```ts
getErr(this): Promise<E>;
```

Defined in: [packages/core/src/types.ts:942](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L942)

Asynchronous [getErr](#geterr-4). Compiles only when
the success channel is empty (`this: AsyncResult<never, E>`); the returned
promise rejects on a `Defect` (rethrowing its cause).

###### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `this`    | `AsyncResult`&lt;`never`, `E`&gt; |

###### Returns

`Promise`&lt;`E`&gt;

##### getOr()

```ts
getOr<U>(fallback): Promise<T | U>;
```

Defined in: [packages/core/src/types.ts:944](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L944)

Asynchronous [getOr](#getor-4).

###### Type Parameters

| Type Parameter |
| -------------- |
| `U`            |

###### Parameters

| Parameter  | Type |
| ---------- | ---- |
| `fallback` | `U`  |

###### Returns

`Promise`&lt;`T` \| `U`&gt;

##### getOrElse()

```ts
getOrElse<U>(f): Promise<T | U>;
```

Defined in: [packages/core/src/types.ts:946](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L946)

Asynchronous [getOrElse](#getorelse-4).

###### Type Parameters

| Type Parameter |
| -------------- |
| `U`            |

###### Parameters

| Parameter | Type             |
| --------- | ---------------- |
| `f`       | (`error`) => `U` |

###### Returns

`Promise`&lt;`T` \| `U`&gt;

##### getOrNull()

```ts
getOrNull(): Promise<T | null>;
```

Defined in: [packages/core/src/types.ts:948](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L948)

Asynchronous [getOrNull](#getornull-4).

###### Returns

`Promise`&lt;`T` \| `null`&gt;

##### getOrThrow()

```ts
getOrThrow(this): Promise<T>;
```

Defined in: [packages/core/src/types.ts:957](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L957)

Asynchronous [getOrThrow](#getorthrow-4) — the returned
promise **rejects** with the modeled error on `Err` (or the original cause
on a `Defect`), rather than throwing synchronously. Gated the same way: it
compiles only when the error channel is non-empty (`E` is not `never`).

###### Parameters

| Parameter | Type                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this`    | \[`E`\] _extends_ \[`never`\] ? `"unthrown: getOrThrow is unnecessary here — the Err channel is empty (E = never), so there is nothing to throw. Use get() instead."` : `AsyncResult`&lt;`T`, `E`&gt; |

###### Returns

`Promise`&lt;`T`&gt;

##### getOrUndefined()

```ts
getOrUndefined(): Promise<T | undefined>;
```

Defined in: [packages/core/src/types.ts:950](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L950)

Asynchronous [getOrUndefined](#getorundefined-4).

###### Returns

`Promise`&lt;`T` \| `undefined`&gt;

##### let()

```ts
let<K, U>(name, f): AsyncResult<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E>;
```

Defined in: [packages/core/src/types.ts:804](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L804)

Asynchronous [let](#let-4) (do-notation). `f` returns a
plain value, bound under `name`. An async callback is rejected at compile
time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter         |
| ---------------------- |
| `K` _extends_ `string` |
| `U`                    |

###### Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `name`    | `K`                                                         |
| `f`       | (`scope`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; |

###### Returns

`AsyncResult`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E`&gt;

##### map()

```ts
map<U>(f): AsyncResult<U, E>;
```

Defined in: [packages/core/src/types.ts:748](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L748)

Asynchronous [map](#map-4): transforms the success value
with `f`. `f` is synchronous; a throw becomes a `Defect`. An async callback
is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `U`            |

###### Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `f`       | (`value`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; |

###### Returns

`AsyncResult`&lt;`U`, `E`&gt;

##### mapErrCases()

```ts
mapErrCases<M>(f): AsyncResult<T, Exclude<MatchOut<M>, Defect>>;
```

Defined in: [packages/core/src/types.ts:833](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L833)

Asynchronous [mapErrCases](#maperrcases-4) — the same exhaustive
[ErrMatcher](#errmatcher) form; the combinator calls `.exhaustive()`.

###### Type Parameters

| Type Parameter                                   |
| ------------------------------------------------ |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; |

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `f`       | (`matcher`, `defect`) => `M` |

###### Returns

`AsyncResult`&lt;`T`, `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;&gt;

##### match()

```ts
match<ROk, RDefect, M>(cases): Promise<ROk | RDefect | MatchOut<M>>;
```

Defined in: [packages/core/src/types.ts:926](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L926)

Asynchronous [match](#match-4). Handlers are synchronous
(the `errCases` handler returns an exhaustive [ErrMatcher](#errmatcher) builder, no
`defect` helper); resolves to a `Promise` of the folded value.

###### Type Parameters

| Type Parameter                                   |
| ------------------------------------------------ |
| `ROk`                                            |
| `RDefect`                                        |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; |

###### Parameters

| Parameter        | Type                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `cases`          | \{ `defect`: (`cause`) => `RDefect`; `errCases`: (`matcher`) => `M`; `ok`: (`value`) => `ROk`; \} |
| `cases.defect`   | (`cause`) => `RDefect`                                                                            |
| `cases.errCases` | (`matcher`) => `M`                                                                                |
| `cases.ok`       | (`value`) => `ROk`                                                                                |

###### Returns

`Promise`&lt;`ROk` \| `RDefect` \| `MatchOut`&lt;`M`&gt;&gt;

##### recoverDefect()

```ts
recoverDefect<U, E2>(f): AsyncResult<T | U, E | E2>;
```

Defined in: [packages/core/src/types.ts:900](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L900)

Asynchronous [recoverDefect](#recoverdefect-4). `f` may
return a `Result` or an `AsyncResult`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `U`            |
| `E2`           |

###### Parameters

| Parameter | Type                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `f`       | (`cause`) => `Result`&lt;`U`, `E2`&gt; \| `AsyncResult`&lt;`U`, `E2`&gt; |

###### Returns

`AsyncResult`&lt;`T` \| `U`, `E` \| `E2`&gt;

##### recoverErrCases()

```ts
recoverErrCases<M>(f): AsyncResult<T | Exclude<MatchOut<M>, Defect>, never>;
```

Defined in: [packages/core/src/types.ts:856](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L856)

Asynchronous [recoverErrCases](#recovererrcases-4) — the same
exhaustive [ErrMatcher](#errmatcher) form. Branches are synchronous; a throw
becomes a `Defect`.

###### Type Parameters

| Type Parameter                                   |
| ------------------------------------------------ |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; |

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `f`       | (`matcher`, `defect`) => `M` |

###### Returns

`AsyncResult`&lt;`T` \| `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;, `never`&gt;

##### tap()

```ts
tap<R>(f): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:776](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L776)

Asynchronous [tap](#tap-4). `f` is synchronous; a throw
becomes a `Defect`. An async callback is rejected at compile time
([NotThenable](#notthenable)) — and so is a returned `AsyncResult` (it is
awaitable). Beware the near-miss: _calling_ an `AsyncResult`-returning
effect inside the callback without returning it compiles and leaves the
effect floating — fire-and-forget, never awaited, its `Err`/`Defect`
unobserved. If the effect returns a `Result`/`AsyncResult`, use
[flatTap](#flattap-3).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `f`       | (`value`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; |

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

##### tapDefect()

```ts
tapDefect<R>(f): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:909](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L909)

Asynchronous [tapDefect](#tapdefect-4). If `f` throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown,
original failure]` — observing a failure never destroys it. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `f`       | (`cause`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; |

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

##### tapErrCases()

```ts
tapErrCases<R>(f): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:873](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L873)

Asynchronous [tapErrCases](#taperrcases-4). `f` is synchronous; if it
throws — or a branch returns the injected `defect(cause)` marker, the
expression-position form of a throw — the result is a `Defect` whose cause
is an `AggregateError` of `[thrown, original failure]` — observing a failure
never destroys it. An
async branch is rejected at compile time ([NotThenable](#notthenable) on the
builder output) — other branch results are discarded, so a rejected
`Promise` would float unobserved. The
[tap](#tap-3) fire-and-forget caveat applies here
too — a failable effect belongs in
[flatTapErrCases](#flattaperrcases-3).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`R` & [`NotThenable`](#notthenable)&lt;`R`&gt;&gt; |

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

##### tapFailure()

```ts
tapFailure<R>(f): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:919](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L919)

Asynchronous [tapFailure](#tapfailure-4) — the
cross-channel observer. `f` receives the narrowed failure variant
([FailureView](#failureview)); if it throws, the result is a `Defect` whose cause
is an `AggregateError` of `[thrown, original failure]` — observing a
failure never destroys it. An async callback is rejected at compile time
([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `f`       | (`failure`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; |

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

---

### ResultMethods

```ts
type ResultMethods<T, E> = object;
```

Defined in: [packages/core/src/types.ts:107](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L107)

The fluent method surface every [Result](#result) variant carries — the
combinators (`map`, `flatMap`, `mapErrCases`, `match`, `get`, …), documented one
per entry below. Factored out so the three variants ([OkView](#okview),
[ErrView](#errview), [DefectView](#defectview)) can each intersect it; [AsyncResult](#asyncresult)
mirrors this surface with async signatures.

#### Remarks

This type exists to **document** the surface and to power narrowing — not to be
authored against. You obtain it by holding a `Result` (or `AsyncResult`), never
by implementing your own `Result`-like; treat it as read-only reference.

#### Extended by

- [`DefectView`](#defectview)
- [`ErrView`](#errview)
- [`OkView`](#okview)

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |
| `E`            | the modeled error type. |

#### Methods

##### as()

```ts
as<U>(value): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:213](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L213)

Replace the success value with a constant `value`.

Runs only on `Ok`; `Err` and `Defect` pass through.

###### Type Parameters

| Type Parameter | Description                 |
| -------------- | --------------------------- |
| `U`            | the replacement value type. |

###### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `U`  |

###### Returns

`Result`&lt;`U`, `E`&gt;

##### bind()

```ts
bind<K, U, E2>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E | E2>;
```

Defined in: [packages/core/src/types.ts:186](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L186)

Do-notation: run `f` for a `Result` and **bind its value** under `name` in
an accumulating object scope.

###### Type Parameters

| Type Parameter         | Description                              |
| ---------------------- | ---------------------------------------- |
| `K` _extends_ `string` | the key the bound value is stored under. |
| `U`                    | the bound value type.                    |
| `E2`                   | the error type `f` may introduce.        |

###### Parameters

| Parameter | Type                                   | Description                                     |
| --------- | -------------------------------------- | ----------------------------------------------- |
| `name`    | `K`                                    | the scope key.                                  |
| `f`       | (`scope`) => `Result`&lt;`U`, `E2`&gt; | produces a `Result` from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E` \| `E2`&gt;

###### Remarks

Begin a chain with [Do](#do) (an empty object scope) and grow it step by
step. `f` receives the scope accumulated so far and returns a `Result`; on
`Ok` the value is added as `{ ...scope, [name]: value }`, on `Err`/`Defect`
the chain short-circuits. Errors union (`E | E2`). A throw becomes a
`Defect` — as does calling `bind` on a non-object scope (e.g. `Ok(5).bind`),
which is misuse: the scope is always an object inside a real `Do()` chain.
(`let` is the pure-value counterpart.)

##### discard()

```ts
discard(): Result<void, E>;
```

Defined in: [packages/core/src/types.ts:222](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L222)

Drop the success value, collapsing the success type to `void`.

The named form of `map(() => undefined)`. Runs only on `Ok` (the value is
replaced with `undefined`); `Err` and `Defect` pass through. Unlike
`as(undefined)` — which produces `Result<undefined, E>` — the success type
is `void`: the value's story ends here.

###### Returns

`Result`&lt;`void`, `E`&gt;

##### ensure()

###### Call Signature

```ts
ensure<U, E2>(predicate, onFail): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:257](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L257)

Validate the success value — keep the `Ok` when `predicate` holds,
otherwise fail into the **modeled** channel with `Err(onFail(value))`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the refined success type (type-guard form). |
| `E2`           | the error type `onFail` produces.           |

###### Parameters

| Parameter   | Type                                                          | Description                                  |
| ----------- | ------------------------------------------------------------- | -------------------------------------------- |
| `predicate` | (`value`) => `value is U`                                     | the check; a type guard refines `T` to `U`.  |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; | maps the failing value to the modeled error. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

###### Remarks

The named form of `flatMap((v) => (p(v) ? Ok(v) : Err(e)))`. With a
**type-guard** predicate (`(v): v is U`) the success type is **refined** to
`U` on the way through (this overload). Runs only on `Ok` — a passing value
flows through as the _same_ `Ok`; `Err` and `Defect` pass through
untouched. A throw in `predicate` or `onFail` becomes a `Defect`.

Both callbacks are synchronous: an async `onFail` is rejected at compile
time ([NotThenable](#notthenable)), and an async predicate does not type-check
either — its `Promise<boolean>` is not a `boolean` (and, being truthy,
would have silently always passed).

###### Example

```ts
// boolean form: gate a value
Ok(-1).ensure(
  (n) => n > 0,
  (n) => `negative: ${n}`,
); // Err("negative: -1")

// type-guard form: refine the success type
declare const r: Result<string | number, "e">;
const s = r.ensure(
  (v): v is string => typeof v === "string",
  () => "not_a_string" as const,
); // Result<string, "e" | "not_a_string">
```

###### Call Signature

```ts
ensure<E2>(predicate, onFail): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:265](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L265)

Boolean form of [ensure](#ensure-4) — validates without
refining, keeping the success type `T`.

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter   | Type                                                          |
| ----------- | ------------------------------------------------------------- |
| `predicate` | (`value`) => `boolean`                                        |
| `onFail`    | (`value`) => `E2` & [`NotThenable`](#notthenable)&lt;`E2`&gt; |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

##### flatMap()

```ts
flatMap<U, E2>(f): Result<U, E | E2>;
```

Defined in: [packages/core/src/types.ts:130](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L130)

Sequence a dependent, `Result`-returning step (monadic bind).

Runs `f` only on `Ok`; `Err` and `Defect` pass through. The error channels
combine, widening to `E | E2`. If `f` throws, the throw becomes a `Defect`.

###### Type Parameters

| Type Parameter | Description                                 |
| -------------- | ------------------------------------------- |
| `U`            | the success type of the next step.          |
| `E2`           | the error type the next step may introduce. |

###### Parameters

| Parameter | Type                                   | Description                                                |
| --------- | -------------------------------------- | ---------------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`U`, `E2`&gt; | produces the next `Result` from the current success value. |

###### Returns

`Result`&lt;`U`, `E` \| `E2`&gt;

##### flatMapErrCases()

```ts
flatMapErrCases<M>(f): Result<T | OkOf<MatchOut<M>>, ErrOf<MatchOut<M>>>;
```

Defined in: [packages/core/src/types.ts:313](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L313)

Sequence from an `Err` by producing another `Result` — the error-channel
mirror of [flatMap](#flatmap-4), **matching the error
exhaustively** ([ErrMatcher](#errmatcher); the combinator calls `.exhaustive()`).

Each branch returns a `Result`; the outgoing channels are the unions of the
branch-returned `Result`s' channels. A branch may return `defect(cause)`.
Runs only on `Err`; `Ok` and `Defect` pass through.

###### Type Parameters

| Type Parameter                                                                          | Description                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `unknown`&gt; \| `Defect`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                 |
| --------- | ---------------------------- | ----------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a fallback `Result`. |

###### Returns

`Result`&lt;`T` \| [`OkOf`](#okof)&lt;`MatchOut`&lt;`M`&gt;&gt;, [`ErrOf`](#errof)&lt;`MatchOut`&lt;`M`&gt;&gt;&gt;

##### flatTap()

```ts
flatTap<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:166](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L166)

Run a **failable** side effect on the success value, keeping the original
value but threading the effect's error.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `E2`           | the error type the effect may introduce. |

###### Parameters

| Parameter | Type                                         | Description                                          |
| --------- | -------------------------------------------- | ---------------------------------------------------- |
| `f`       | (`value`) => `Result`&lt;`unknown`, `E2`&gt; | the failable side effect; its `Ok` value is ignored. |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

This is to [tap](#tap-4) what
[flatMap](#flatmap-4) is to [map](#map-4):
`f` returns a `Result`, but its **success value is discarded** — on success
the original value flows through (`Result<T, E | E2>`), while an `Err` (or
`Defect`) from `f` short-circuits. Runs only on `Ok`; `Err` and `Defect` pass
through. If `f` throws, the throw becomes a `Defect`. Use it for a validation
or write whose _result_ matters but whose _value_ you don't need.

##### flatTapErrCases()

```ts
flatTapErrCases<E2>(f): Result<T, E | E2>;
```

Defined in: [packages/core/src/types.ts:386](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L386)

Run a **failable** side effect on the error, keeping the original error but
threading the effect's own error — **matched exhaustively**
([ErrMatcher](#errmatcher)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `E2`           |

###### Parameters

| Parameter | Type                                                                              | Description                                                               |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`Result`&lt;`unknown`, `E2`&gt;&gt; | builds the match; each branch is a failable effect (its `Ok` is ignored). |

###### Returns

`Result`&lt;`T`, `E` \| `E2`&gt;

###### Remarks

The error-channel mirror of [flatTap](#flattap-4): each
branch returns a `Result` whose **success value is discarded** — on the
effect's `Ok` the original `Err` flows through, while an `Err`/`Defect` from a
branch short-circuits and threads its error. Note the asymmetry with a
_throw_: a branch that **returns** a Defect-state `Result` **replaces** the
original `Err` (Defect-dominance, the short-circuit rule — it is not
aggregated), whereas a branch that **throws** produces a `Defect`
aggregating `[thrown, original failure]` (observing a failure by throwing
never destroys it). A branch returning the injected `defect(cause)` marker —
reachable under a `returnType` pin — follows the _throw_ rule, since it is
the lint-clean, expression-position form of one.

##### get()

```ts
get(this): T;
```

Defined in: [packages/core/src/types.ts:491](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L491)

Extract the success value.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`T`, `never`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

Compiles only when the error channel is empty (`E = never`) — eliminate
modeled errors first (`match` / `recoverErrCases` / `flatMapErrCases`), or reach for the
`getOr` / `getOrElse` / `getOrNull` / `getOrUndefined` family (which
recover an `Err`). If you get a `'this' context` type error here, that is
the gate: the receiver still has a non-`never` error channel.

`E = never` empties only the **modeled** error channel — a `Defect` can
still be present, and `get()` **rethrows its original cause** (it
_panics_); `Result<T, never>` does not mean `get()` cannot throw.

##### getErr()

```ts
getErr(this): E;
```

Defined in: [packages/core/src/types.ts:505](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L505)

Extract the modeled error.

###### Parameters

| Parameter | Type                         |
| --------- | ---------------------------- |
| `this`    | `Result`&lt;`never`, `E`&gt; |

###### Returns

`E`

the `Err` value.

###### Remarks

Compiles only when the success channel is empty (`T = never`) — eliminate
the success case first. `T = never` is rarely the case in practice (a
`Result` you hold usually still has a success type), so to inspect an
error prefer an `isErr()` guard or, in tests, `@unthrown/vitest`'s
`toBeErrWith`. A `Defect` still **rethrows its original cause** (a defect is
a bug, not an absent value), so this does not mean `getErr()` can't throw.

##### getOr()

```ts
getOr<U>(fallback): T | U;
```

Defined in: [packages/core/src/types.ts:514](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L514)

The success value, or `fallback` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter  | Type | Description                                                                            |
| ---------- | ---- | -------------------------------------------------------------------------------------- |
| `fallback` | `U`  | returned when the result is an `Err` (may be a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect` — a Defect is a bug, not an absent value, so
it is never silently replaced.

##### getOrElse()

```ts
getOrElse<U>(f): T | U;
```

Defined in: [packages/core/src/types.ts:522](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L522)

The success value, or `f(error)` on `Err`.

###### Type Parameters

| Type Parameter | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `U`            | the fallback type (may differ from `T`; the return widens to `T | U`). |

###### Parameters

| Parameter | Type             | Description                                                                                       |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `f`       | (`error`) => `U` | lazily computes the fallback from the error (may return a different type; the return widens to `T | U`). |

###### Returns

`T` \| `U`

###### Throws

Re-throws on a `Defect`.

##### getOrNull()

```ts
getOrNull(): T | null;
```

Defined in: [packages/core/src/types.ts:528](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L528)

The success value, or `null` on `Err`.

###### Returns

`T` \| `null`

###### Throws

Re-throws on a `Defect`.

##### getOrThrow()

```ts
getOrThrow(this): T;
```

Defined in: [packages/core/src/types.ts:558](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L558)

The success value, or **throw** the modeled error on `Err`.

###### Parameters

| Parameter | Type                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `this`    | \[`E`\] _extends_ \[`never`\] ? `"unthrown: getOrThrow is unnecessary here — the Err channel is empty (E = never), so there is nothing to throw. Use get() instead."` : `Result`&lt;`T`, `E`&gt; |

###### Returns

`T`

the `Ok` value.

###### Remarks

A deliberate escape hatch off the errors-as-values model — it **throws the
`Err` value as-is** at the call site. Its purpose is to move a literal
`throw` behind a method, so a `no-throw` lint rule can ban raw throws while
this one sanctioned extraction remains — _not_ to replace principled
handling. When you can keep the error a value, prefer
[match](#match-4) / [recoverErrCases](#recovererrcases-4) /
[flatMapErrCases](#flatmaperrcases-4).

Type-gated as the **complement** of [get](#get-4): it
compiles only when the error channel is **non-empty** (`E` is not `never`) —
there must be a modeled error for it to throw. On a `Result<T, never>` there
is nothing to throw, so `getOrThrow` does not compile; use `get()` (which
gates the other way). Together they partition extraction by the error
channel's state, with no overlap.

###### Throws

the modeled `error` on `Err`; re-throws the original `cause` on a
`Defect` (a panic, like the rest of the `getOr…` family).

##### getOrUndefined()

```ts
getOrUndefined(): T | undefined;
```

Defined in: [packages/core/src/types.ts:534](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L534)

The success value, or `undefined` on `Err`.

###### Returns

`T` \| `undefined`

###### Throws

Re-throws on a `Defect`.

##### isDefect()

```ts
isDefect(): this is DefectView<T, E>;
```

Defined in: [packages/core/src/types.ts:569](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L569)

Whether this result is a `Defect` — narrows `this` to its [DefectView](#defectview) on `true`.

###### Returns

`this is DefectView<T, E>`

##### isErr()

```ts
isErr(): this is ErrView<E, T>;
```

Defined in: [packages/core/src/types.ts:567](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L567)

Whether this result is `Err` — narrows `this` to its [ErrView](#errview) on `true`.

###### Returns

`this is ErrView<E, T>`

##### isOk()

```ts
isOk(): this is OkView<T, E>;
```

Defined in: [packages/core/src/types.ts:565](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L565)

Whether this result is `Ok` — narrows `this` to its [OkView](#okview) on `true`.

###### Returns

`this is OkView<T, E>`

##### let()

```ts
let<K, U>(name, f): Result<{ [K in string | number | symbol]: (Omit<T, K> & { readonly [P in string]: U })[K] }, E>;
```

Defined in: [packages/core/src/types.ts:205](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L205)

Do-notation: run `f` for a **plain value** and bind it under `name` in the
accumulating object scope. The pure-value counterpart of [bind](#bind-4).

###### Type Parameters

| Type Parameter         | Description                        |
| ---------------------- | ---------------------------------- |
| `K` _extends_ `string` | the key the value is stored under. |
| `U`                    | the value type.                    |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `name`    | `K`                                                         | the scope key.                               |
| `f`       | (`scope`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | computes a value from the accumulated scope. |

###### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: (Omit\<T, K\> & \{ readonly \[P in string\]: U \})\[K\] \}, `E`&gt;

###### Remarks

`f` receives the scope and returns a value (not a `Result`); it is added as
`{ ...scope, [name]: value }`. Runs only on `Ok`; `Err`/`Defect` pass
through. A throw becomes a `Defect`. An async callback is rejected at
compile time ([NotThenable](#notthenable)).

##### map()

```ts
map<U>(f): Result<U, E>;
```

Defined in: [packages/core/src/types.ts:119](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L119)

Transform the success value with `f`.

Runs `f` only on `Ok`; `Err` and `Defect` pass through untouched. If `f`
throws, the thrown value is captured as a `Defect`.

An async callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter | Description              |
| -------------- | ------------------------ |
| `U`            | the mapped success type. |

###### Parameters

| Parameter | Type                                                        | Description                                  |
| --------- | ----------------------------------------------------------- | -------------------------------------------- |
| `f`       | (`value`) => `U` & [`NotThenable`](#notthenable)&lt;`U`&gt; | maps the current success value to a new one. |

###### Returns

`Result`&lt;`U`, `E`&gt;

##### mapErrCases()

```ts
mapErrCases<M>(f): Result<T, Exclude<MatchOut<M>, Defect>>;
```

Defined in: [packages/core/src/types.ts:297](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L297)

Transform the modeled error by **matching it exhaustively**.

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                                          |
| --------- | ---------------------------- | -------------------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match over the error (returns the un-terminated builder). |

###### Returns

`Result`&lt;`T`, `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;&gt;

###### Remarks

The callback receives `match(error)` (an [ErrMatcher](#errmatcher)) and the
injected `defect` helper. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `mapErrCases` calls `.exhaustive()` itself, so a
missing case is a compile error at the call site (there is no `.exhaustive()`
to forget, and no way to slip in `.otherwise()`). The outgoing error type is
the union of the branch returns with the `Defect` arm subtracted
(`Exclude<O, Defect>`) — a branch returning `defect(cause)` converts that case
to a `Defect` and drops it from `E`. Runs only on `Err`; `Ok` and `Defect`
pass through. A branch that throws also becomes a `Defect`.

**Name every case.** Match on anything the matcher supports — `_tag`,
`code`, structural shape, guards — and group the cases that share a handler
with `.with(a, b, handler)`. `.with(P._, …)` is the wildcard **escape
hatch**, not the default: it makes any match exhaustive, so it also absorbs
every case `E` grows later. Two uses are sanctioned — a helper generic in
`E`, where no arm list can prove exhaustiveness against an unresolved type
parameter, and an `E` that is a single type rather than a union of cases
(see [P](#p) for both). `@unthrown/oxlint`'s `no-catch-all-pattern` (in
its `recommended` preset) flags the rest.

##### match()

```ts
match<ROk, RDefect, M>(cases): ROk | RDefect | MatchOut<M>;
```

Defined in: [packages/core/src/types.ts:470](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L470)

Exhaustively fold all three runtime states into a single value.

###### Type Parameters

| Type Parameter                                   | Description                                            |
| ------------------------------------------------ | ------------------------------------------------------ |
| `ROk`                                            | the `ok` handler return type.                          |
| `RDefect`                                        | the `defect` handler return type.                      |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the `errCases` handler returns. |

###### Parameters

| Parameter        | Type                                                                                              | Description                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `cases`          | \{ `defect`: (`cause`) => `RDefect`; `errCases`: (`matcher`) => `M`; `ok`: (`value`) => `ROk`; \} | the `ok`/`defect` handlers plus the `errCases` matcher builder. |
| `cases.defect`   | (`cause`) => `RDefect`                                                                            | -                                                               |
| `cases.errCases` | (`matcher`) => `M`                                                                                | -                                                               |
| `cases.ok`       | (`value`) => `ROk`                                                                                | -                                                               |

###### Returns

`ROk` \| `RDefect` \| `MatchOut`&lt;`M`&gt;

###### Remarks

Exactly one handler runs. Together with the throw-to-Defect guarantee, this
is typically the single place a pipeline is handled at the edge — mapping
`Ok`/`Err`/`Defect` to (for example) 2xx / 4xx / 5xx with no `try`/`catch`.

The `errCases` handler does not take a single blanket callback: it receives
`match(error)` (an [ErrMatcher](#errmatcher)) and **matches the error exhaustively**,
exactly like the error combinators — which is why the key carries the same
`…Cases` suffix. Chain `.with(pattern, handler)` and **return the
un-terminated builder** — `match` calls `.exhaustive()` itself, so a missing
case is a compile error at the call site (no `.exhaustive()` to forget).
Folding at the edge names every case too — `.with(P._, …)` is the wildcard
escape hatch, not the default. Unlike the combinators the branches
receive **no `defect` helper** — `match` is total elimination to a value,
with no `Defect` output channel; the `defect` case handles a `Result` that
already carries one. (A `Result` is also a discriminated union — for richer
whole-`Result` matching, `match(result).with(…)`.)

##### recoverDefect()

```ts
recoverDefect<U, E2>(f): Result<T | U, E | E2>;
```

Defined in: [packages/core/src/types.ts:406](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L406)

Recover from a `Defect` — the **only** combinator that can touch one.

###### Type Parameters

| Type Parameter | Description                              |
| -------------- | ---------------------------------------- |
| `U`            | a success type the recovery may produce. |
| `E2`           | an error type the recovery may produce.  |

###### Parameters

| Parameter | Type                                   | Description                                               |
| --------- | -------------------------------------- | --------------------------------------------------------- |
| `f`       | (`cause`) => `Result`&lt;`U`, `E2`&gt; | maps the Defect's unknown cause to a recovering `Result`. |

###### Returns

`Result`&lt;`T` \| `U`, `E` \| `E2`&gt;

###### Remarks

Runs `f` only when a `Defect` is present, re-entering the modeled world by
returning a `Result` (an `Ok` or a fresh `Err`). `Ok` and `Err` pass
through. Recovering a Defect should be rare: usually you let it bubble to
the edge. If `f` throws, the throw becomes a new `Defect`.

##### recoverErrCases()

```ts
recoverErrCases<M>(f): Result<T | Exclude<MatchOut<M>, Defect>, never>;
```

Defined in: [packages/core/src/types.ts:331](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L331)

Recover from an `Err` by producing a success value, emptying the error
channel — **matching the error exhaustively** ([ErrMatcher](#errmatcher)). Pairs
with [recoverDefect](#recoverdefect-4).

###### Type Parameters

| Type Parameter                                   | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `M` _extends_ `ExhaustiveMatch`&lt;`unknown`&gt; | the exhaustive builder the callback returns. |

###### Parameters

| Parameter | Type                         | Description                                             |
| --------- | ---------------------------- | ------------------------------------------------------- |
| `f`       | (`matcher`, `defect`) => `M` | builds the match; each branch produces a success value. |

###### Returns

`Result`&lt;`T` \| `Exclude`&lt;`MatchOut`&lt;`M`&gt;, `Defect`&gt;, `never`&gt;

###### Remarks

The result type is `Result<T | U, never>`, but `never` describes only the
**error** channel — a `Defect` can still be present at runtime. A branch may
return `defect(cause)` (which stays a `Defect`, not a recovery). Runs only on
`Err`; `Ok` and `Defect` pass through.

##### tap()

```ts
tap<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:149](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L149)

Run a side effect on the success value and pass the `Result` through
unchanged.

Runs only on `Ok`. If `f` throws, the throw becomes a `Defect`. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                                    |
| --------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `f`       | (`value`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f`'s return value is **ignored** — a `Result` returned by the effect
compiles but is discarded, `Err` and all. If the effect can fail, sequence
it instead of tapping it: a `Result`-returning effect goes in
[flatTap](#flattap-4); an `AsyncResult`-returning effect
cannot be sequenced from the sync surface — lift the chain with
[toAsync](#toasync-3) and use the async
[flatTap](#flattap-3) (which accepts both).

##### tapDefect()

```ts
tapDefect<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:416](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L416)

Run a side effect on a present `Defect`'s cause (e.g. logging) and pass the
`Defect` through unchanged. If `f` throws, the result is a `Defect` whose
cause is an `AggregateError` of `[thrown, original failure]` — observing a
failure never destroys it. An async callback is rejected at compile time
([NotThenable](#notthenable)).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                        | Description                             |
| --------- | ----------------------------------------------------------- | --------------------------------------- |
| `f`       | (`cause`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the unknown cause. |

###### Returns

`Result`&lt;`T`, `E`&gt;

##### tapErrCases()

```ts
tapErrCases<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:358](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L358)

Run a side effect on the error — **matched exhaustively** ([ErrMatcher](#errmatcher))
— and pass the `Result` through unchanged.

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                                                             | Description                                                        |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `f`       | (`matcher`, `defect`) => `ExhaustiveMatch`&lt;`R` & [`NotThenable`](#notthenable)&lt;`R`&gt;&gt; | builds the match; branch returns are ignored, bar `defect(cause)`. |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

The callback builds a match whose branches run side effects; their return
values are ignored and the original `Err` flows through. Exhaustive like the
transformers, and like them it wants every case named — `.with(P._, …)`
remains the wildcard escape hatch. If a branch throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown, original
failure]` — observing a failure never destroys it. An **async branch is
rejected at compile time** ([NotThenable](#notthenable) on the builder output):
because the branch results are discarded, a returned `Promise` would float
unobserved and its rejection would vanish. The one branch return that is
**not** discarded is the injected `defect(cause)` marker: it is the
lint-clean, expression-position form of a `throw`, so it follows the throw
rule above (an `AggregateError` of `[the branch's cause, original
failure]`), never a silent no-op. A failable
`Result`-returning effect belongs in
[flatTapErrCases](#flattaperrcases-4).

##### tapFailure()

```ts
tapFailure<R>(f): Result<T, E>;
```

Defined in: [packages/core/src/types.ts:442](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L442)

Run a side effect on **any failure** — `Err` or `Defect` — and pass the
`Result` through unchanged. The one cross-channel observer, for the shared
"it went KO" concern (logging, metrics, rollback) that would otherwise be
duplicated across [tapErrCases](#taperrcases-4) and
[tapDefect](#tapdefect-4).

###### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

###### Parameters

| Parameter | Type                                                          | Description                                                             |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `f`       | (`failure`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | the side effect over the failure variant (its return value is ignored). |

###### Returns

`Result`&lt;`T`, `E`&gt;

###### Remarks

`f` receives the narrowed **failure variant** ([FailureView](#failureview)), not a
payload — the payload union `E | unknown` would collapse to `unknown` and
lose `E`'s typing. Branch on `failure.tag` to reach the typed payload
(`"Err"` → `failure.error: E`, `"Defect"` → `failure.cause: unknown`), or
treat it opaquely for a shared logger. Runs on `Err` and `Defect`; `Ok`
passes through. It **observes without consuming**: the failure flows on
unchanged — to also recover, use
[recoverErrCases](#recovererrcases-4) /
[recoverDefect](#recoverdefect-4) (deliberately separate
acts) or [match](#match-4) at the edge. If `f` throws, the
result is a `Defect` whose cause is an `AggregateError` of `[thrown,
original failure]` — observing a failure never destroys it. An async
callback is rejected at compile time ([NotThenable](#notthenable)).

##### toAsync()

```ts
toAsync(): AsyncResult<T, E>;
```

Defined in: [packages/core/src/types.ts:572](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/types.ts#L572)

Lift this synchronous `Result` into an [AsyncResult](#asyncresult).

###### Returns

`AsyncResult`&lt;`T`, `E`&gt;

## Constructors

### P

```ts
const P: Readonly<{
  _: UniversalPattern;
  any: UniversalPattern;
  instanceOf: <C>(cls) => PatternMatcher<InstanceType<C>>;
  number: PatternMatcher<number>;
  string: PatternMatcher<string>;
  tag: <Tag>(value) => object;
  union: <Pts>(...patterns) => PatternMatcher<MatchedOf<Pts[number]>>;
  when: <G>(guard) => PatternMatcher<G>;
}>;
```

Defined in: [packages/core/src/matcher.ts:409](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L409)

The pattern namespace (unthrown's own; the former ts-pattern `P`):

- `P._` / `P.any` — the universal catch-all, and an **escape hatch** rather
  than the default: matching the error channel means naming its cases, so
  reach for this only where they cannot be named. Matches anything, and
  (because its phantom type is `unknown`) makes the builder provably
  exhaustive even when the matched input is an unresolved type parameter.
  Two situations are legitimate: a **helper generic in `E`**, where no arm
  list can prove exhaustiveness against an unresolved type parameter; and an
  **`E` that is a single type**, not a union of cases (a validator's issues
  array, say), where one arm _is_ the enumeration. `@unthrown/oxlint`'s
  `no-catch-all-pattern` (in its `recommended` preset) flags every other use;
  keep the deliberate ones behind a targeted `oxlint-disable` saying which of
  the two it is.
- `P.tag<const Tag extends string>(value: Tag): { _tag: Tag }` — the
  `{ _tag: t }` object pattern, matching any value whose `_tag` equals `t` (a
  `TaggedError`, or any `_tag`-discriminated member) and narrowing the
  branch's parameter to that variant, payload included. The workhorse of the
  error channel: `matcher.with(P.tag("NotFound"), (e) => …)`. It composes like
  any other pattern — in a grouped arm
  (`.with(P.tag("A"), P.tag("B"), handler)`) and inside `P.union`.
- `P.instanceOf(Cls)` — an `instanceof` check, narrowing to the class
  instance type (for union members that are not tagged, e.g. a third-party
  error class).
- `P.when(guard)` — an arbitrary type-guard predicate.
- `P.union(…patterns)` — matches when any sub-pattern matches.
- `P.string` / `P.number` — primitive-type wildcards.

---

### Err()

```ts
function Err<E>(error): Result<never, E>;
```

Defined in: [packages/core/src/constructors.ts:61](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L61)

Construct a failed [Result](#result) carrying a **modeled** error.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type | Description               |
| --------- | ---- | ------------------------- |
| `error`   | `E`  | the domain error to wrap. |

#### Returns

`Result`&lt;`never`, `E`&gt;

#### Example

```ts
import { Err } from "unthrown";

Err("not_found").map((n) => n + 1); // => Err("not_found") (map skipped)
Err("not_found").getErr(); // => "not_found"
```

---

### ErrAsync()

```ts
function ErrAsync<E>(error): AsyncResult<never, E>;
```

Defined in: [packages/core/src/constructors.ts:133](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L133)

Construct a failed [AsyncResult](#asyncresult) carrying a **modeled** error — the
pre-lifted form of [Err](#err), sparing you `Err(error).toAsync()`.

#### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `E`            | the modeled error type. |

#### Parameters

| Parameter | Type | Description               |
| --------- | ---- | ------------------------- |
| `error`   | `E`  | the domain error to wrap. |

#### Returns

`AsyncResult`&lt;`never`, `E`&gt;

#### Remarks

The error-channel mirror of [OkAsync](#okasync); see it for the naming and the
`AsyncResult.Err` companion alias.

#### Example

```ts
import { ErrAsync } from "unthrown";

ErrAsync("not_found"); // AsyncResult<never, string>
```

---

### match()

```ts
function match<E>(value): Matcher<E, E, never>;
```

Defined in: [packages/core/src/matcher.ts:364](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L364)

Begin a match over `value`. Chain `.with(pattern, …patterns, handler)` arms;
terminate with `.exhaustive()` — or return the un-terminated builder to an
unthrown error combinator / `match({ errCases })`, which runs it for you.

#### Type Parameters

| Type Parameter |
| -------------- |
| `E`            |

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `E`  |

#### Returns

[`Matcher`](#matcher)&lt;`E`, `E`, `never`&gt;

#### Remarks

This is unthrown's own matcher (the former ts-pattern re-export): the same
call-site shape, with exhaustiveness computed by plain `Exclude` over the
builder's `Remaining` parameter. Name every case of the input union; the
`P._` catch-all is the escape hatch, and is provably exhaustive even over an
unresolved generic input — one of the two cases it is irreplaceable for (see
[P](#p)).

---

### Ok()

#### Call Signature

```ts
function Ok(): Result<void, never>;
```

Defined in: [packages/core/src/constructors.ts:20](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L20)

Construct a successful `void` [Result](#result) — `Result<void, never>` —
sparing you `Ok(undefined)` and typing the success channel `void`, not
`undefined`.

##### Returns

`Result`&lt;`void`, `never`&gt;

##### Example

```ts
import { Ok } from "unthrown";

Ok(); // => a void success: Result<void, never>
```

#### Call Signature

```ts
function Ok<T>(value): Result<T, never>;
```

Defined in: [packages/core/src/constructors.ts:37](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L37)

Construct a successful [Result](#result).

##### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |

##### Parameters

| Parameter | Type | Description                |
| --------- | ---- | -------------------------- |
| `value`   | `T`  | the success value to wrap. |

##### Returns

`Result`&lt;`T`, `never`&gt;

##### Example

```ts
import { Ok } from "unthrown";

Ok(2).map((n) => n + 1); // => Ok(3)
Ok(42).get(); // => 42
```

---

### OkAsync()

#### Call Signature

```ts
function OkAsync(): AsyncResult<void, never>;
```

Defined in: [packages/core/src/constructors.ts:79](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L79)

Construct a successful `void` [AsyncResult](#asyncresult) — `AsyncResult<void, never>`
— the pre-lifted form of the no-arg [Ok](#ok), sparing you
`Ok(undefined).toAsync()`.

##### Returns

`AsyncResult`&lt;`void`, `never`&gt;

##### Example

```ts
import { OkAsync } from "unthrown";

OkAsync(); // => a void success: AsyncResult<void, never>
```

#### Call Signature

```ts
function OkAsync<T>(value): AsyncResult<T, never>;
```

Defined in: [packages/core/src/constructors.ts:106](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L106)

Construct a successful [AsyncResult](#asyncresult) from a pure value — the pre-lifted
form of [Ok](#ok), sparing you `Ok(value).toAsync()`.

##### Type Parameters

| Type Parameter | Description             |
| -------------- | ----------------------- |
| `T`            | the success value type. |

##### Parameters

| Parameter | Type | Description                |
| --------- | ---- | -------------------------- |
| `value`   | `T`  | the success value to wrap. |

##### Returns

`AsyncResult`&lt;`T`, `never`&gt;

##### Remarks

Reach for this on the synchronous/early branch of an `AsyncResult`-returning
function, so both branches share one return type without a trailing
`.toAsync()`. Named with the `Async` suffix the async free functions carry
(`allAsync`, `allFromDictAsync`); the [AsyncResult](#asyncresult) companion aliases it
as `AsyncResult.Ok` (the namespace already says "async", so the suffix drops).

##### Example

```ts
import { OkAsync, type AsyncResult } from "unthrown";

function loadItems(ids: string[]): AsyncResult<Item[], never> {
  if (ids.length === 0) return OkAsync([]); // no more Ok([]).toAsync()
  return itemRepository.load(ids);
}
```

## Interop

### fromNullable()

```ts
function fromNullable<T, E>(value, onAbsent): Result<NonNullable<T>, E>;
```

Defined in: [packages/core/src/interop.ts:43](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L43)

Bridge a nullable value into a [Result](#result): absence becomes a **modeled**
`Err`. The sanctioned alternative to an `Option` type.

#### Type Parameters

| Type Parameter | Description                                  |
| -------------- | -------------------------------------------- |
| `T`            | the (nullable) value type.                   |
| `E`            | the error produced when the value is absent. |

#### Parameters

| Parameter  | Type                         | Description                                    |
| ---------- | ---------------------------- | ---------------------------------------------- |
| `value`    | `T` \| `null` \| `undefined` | the possibly-absent value.                     |
| `onAbsent` | () => `E`                    | lazily produces the error for the absent case. |

#### Returns

`Result`&lt;`NonNullable`&lt;`T`&gt;, `E`&gt;

#### Remarks

`null` and `undefined` map to `Err(onAbsent())`; any other value (including
falsy ones like `0`, `""`, `false`) maps to `Ok`.

#### Example

```ts
import { fromNullable } from "unthrown";

const map = new Map([["a", 1]]);
fromNullable(map.get("a"), () => "absent").getOr(0); // => 1
fromNullable(map.get("z"), () => "absent"); // => Err("absent")
fromNullable(0, () => "absent").getOr(-1); // => 0 (falsy but present)
```

---

### fromPromise()

```ts
function fromPromise<T, R>(
  promise,
  qualify,
  ..._guard
): AsyncResult<T, Exclude<R, Defect>>;
```

Defined in: [packages/core/src/interop.ts:196](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L196)

Wrap a `Promise` (or a thunk producing one) as an [AsyncResult](#asyncresult), forcing
every rejection to be triaged.

#### Type Parameters

| Type Parameter | Description                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `T`            | the resolved value type.                                                                                          |
| `R`            | `qualify`'s return type; the modeled error `E` is `Exclude<R, Defect>` (its `Defect` arm, if any, is subtracted). |

#### Parameters

| Parameter   | Type                                                                                                                                                                           | Description                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `promise`   | `Promise`&lt;`T`&gt; \| (() => `Promise`&lt;`T`&gt;)                                                                                                                           | the promise, or a thunk returning one.                                                                                                                                                                                                                                                                                                           |
| `qualify`   | (`cause`, `defect`) => `R`                                                                                                                                                     | triages a rejection `cause` into a modeled `E`, or marks it unmodeled by returning `defect(cause)` (the helper passed as its second arg).                                                                                                                                                                                                        |
| ...`_guard` | \[`Extract`&lt;`R`, `PromiseLike`&lt;`unknown`&gt;&gt;\] _extends_ \[`never`\] ? \[\] : \[`"unthrown: qualify must be synchronous — its Promise would land in E un-triaged"`\] | compile-time only; never pass it. The phantom rest-tuple that enforces "qualify is synchronous": an `async` qualify makes this demand an impossible extra argument (whose type spells out the error), while a synchronous one leaves it empty. Encoded here — not on `qualify`'s return type — so `T`'s inference from `promise` is undisturbed. |

#### Returns

`AsyncResult`&lt;`T`, `Exclude`&lt;`R`, `Defect`&gt;&gt;

#### Remarks

`qualify` **must** map each rejection cause into a modeled error `E` or a
`Defect` (via the injected `defect` helper, its second argument). The returned
`AsyncResult`'s internal promise never rejects; `await`-ing it always yields a
`Result`. A throw inside `qualify` is itself a `Defect`. `qualify` is
**synchronous**: an `async` qualify is rejected at compile time
([NotThenable](#notthenable)), and a thenable slipped past the types at runtime
becomes a `Defect` (never an `Err(Promise)`), its orphaned rejection silenced.

The modeled error type is `Exclude<R, Defect>` — the `Defect` arm of
`qualify`'s return is **subtracted** from `E`, never inferred into it. So a
`qualify` that returns _only_ `defect(cause)` yields `E = never`; when every
rejection is a Defect, prefer [fromSafePromise](#fromsafepromise).

#### Example

```ts
import { fromPromise } from "unthrown";

// A rejection with a NotFoundError becomes a modeled `Err`; anything else a Defect.
const user = await fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? ("not_found" as const) : defect(cause),
);

if (user.isOk()) user.value; // => the fetched user
// when fetchUser rejects with NotFoundError: user is Err("not_found")
```

---

### fromSafePromise()

```ts
function fromSafePromise<T>(promise): AsyncResult<T, never>;
```

Defined in: [packages/core/src/interop.ts:253](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L253)

Wrap a `Promise` asserted **not** to fail in any modeled way: any rejection
becomes a `Defect`.

#### Type Parameters

| Type Parameter | Description              |
| -------------- | ------------------------ |
| `T`            | the resolved value type. |

#### Parameters

| Parameter | Type                                                 | Description                            |
| --------- | ---------------------------------------------------- | -------------------------------------- |
| `promise` | `Promise`&lt;`T`&gt; \| (() => `Promise`&lt;`T`&gt;) | the promise, or a thunk returning one. |

#### Returns

`AsyncResult`&lt;`T`, `never`&gt;

#### Remarks

Use this only when a rejection genuinely indicates a bug rather than an
anticipated outcome — the error channel is `never`, so there is nothing to
triage. (`await`-ing still yields a `Result`; it never throws.) The
synchronous counterpart is [fromSafeThrowable](#fromsafethrowable).

#### Example

```ts
import { fromSafePromise } from "unthrown";

(await fromSafePromise(Promise.resolve(3))).get(); // => 3
// a rejection becomes a Defect (never a modeled Err):
await fromSafePromise(Promise.reject(new Error("boom"))); // => Defect(Error("boom"))
```

---

### fromSafeThrowable()

```ts
function fromSafeThrowable<A, T>(fn): (...args) => Result<T, never>;
```

Defined in: [packages/core/src/interop.ts:139](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L139)

Wrap a throwing synchronous function asserted **not** to fail in any modeled
way: any throw becomes a `Defect`.

#### Type Parameters

| Type Parameter            | Description                            |
| ------------------------- | -------------------------------------- |
| `A` _extends_ `unknown`[] | the wrapped function's argument tuple. |
| `T`                       | the wrapped function's return type.    |

#### Parameters

| Parameter | Type               | Description                    |
| --------- | ------------------ | ------------------------------ |
| `fn`      | (...`args`) => `T` | the throwing function to wrap. |

#### Returns

a function with the same arguments returning `Result<T, never>`.

(...`args`) => `Result`&lt;`T`, `never`&gt;

#### Remarks

The synchronous counterpart of [fromSafePromise](#fromsafepromise). Use it only when a
throw genuinely indicates a bug rather than an anticipated outcome — the
error channel is `never`, so there is nothing to triage; there is no
`qualify`. When some throws _are_ anticipated, reach for
[fromThrowable](#fromthrowable) and triage them.

#### Example

```ts
import { fromSafeThrowable } from "unthrown";

// A decode failure here is a bug (the row came from our own schema), so
// every throw is a defect — no throwaway `(cause, defect) => defect(cause)`.
const decode = fromSafeThrowable((row: Row) => userSchema.parse(row));

decode(row); // => Result<User, never> — a throw becomes a Defect
```

---

### fromThrowable()

```ts
function fromThrowable<A, T, R>(
  fn,
  qualify,
): (...args) => Result<T, Exclude<R, Defect>>;
```

Defined in: [packages/core/src/interop.ts:95](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L95)

Wrap a throwing synchronous function so it returns a [Result](#result) instead of
throwing.

#### Type Parameters

| Type Parameter            | Description                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `A` _extends_ `unknown`[] | the wrapped function's argument tuple.                                                                            |
| `T`                       | the wrapped function's return type.                                                                               |
| `R`                       | `qualify`'s return type; the modeled error `E` is `Exclude<R, Defect>` (its `Defect` arm, if any, is subtracted). |

#### Parameters

| Parameter | Type                                                                  | Description                                                                                                                            |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `fn`      | (...`args`) => `T`                                                    | the throwing function to wrap.                                                                                                         |
| `qualify` | (`cause`, `defect`) => `R` & [`NotThenable`](#notthenable)&lt;`R`&gt; | triages a thrown `cause` into a modeled `E`, or marks it unmodeled by returning `defect(cause)` (the helper passed as its second arg). |

#### Returns

a function with the same arguments returning `Result<T, E>`.

(...`args`) => `Result`&lt;`T`, `Exclude`&lt;`R`, `Defect`&gt;&gt;

#### Remarks

`qualify` **must** triage every thrown cause into a modeled error `E` or a
`Defect` (via the injected `defect` helper, its second argument) — there is no
path that leaves `unknown` in `E`. A throw inside `qualify` itself is treated
as a `Defect`. `qualify` is **synchronous**: an `async` qualify is rejected at
compile time ([NotThenable](#notthenable)) — its `Promise` would land in `E` un-triaged
— and a thenable slipped past the types at runtime becomes a `Defect` (never
an `Err(Promise)`), its orphaned rejection silenced.

The modeled error type is `Exclude<R, Defect>` — the `Defect` arm of
`qualify`'s return is **subtracted** from `E`, never inferred into it. So a
`qualify` that returns _only_ `defect(cause)` yields `E = never` (a Defect is
out-of-band and must not pollute the error channel); reach for
[fromSafeThrowable](#fromsafethrowable) when every throw is a Defect.

#### Example

```ts
import { fromThrowable } from "unthrown";

// Model the parse failure as an `Err`, everything unexpected as a `Defect`.
const parse = fromThrowable(
  (text: string) => JSON.parse(text) as unknown,
  (cause, defect) =>
    cause instanceof SyntaxError ? ("invalid_json" as const) : defect(cause),
);

parse('{"ok":true}').getOr(null); // => { ok: true }
parse("nope"); // => Err("invalid_json")
```

## Do-notation

### Do()

```ts
function Do(): Result<{}, never>;
```

Defined in: [packages/core/src/do.ts:48](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/do.ts#L48)

Start a do-notation chain with an empty object scope, grown step by step with
`bind` (for `Result`-returning steps) and `let` (for pure values).

#### Returns

`Result`&lt;\{
\}, `never`&gt;

#### Remarks

Capitalised because `do` is a reserved word. Each step receives the scope
accumulated so far; the error types union across `bind`s, and a throw in any
step becomes a `Defect`. To go asynchronous, lift the chain with `toAsync()`
(then a `bind` may return an `AsyncResult`).

#### Examples

```ts
import { Do, Ok } from "unthrown";

const result = Do()
  .bind("user", () => findUser(id)) // Result<User, NotFound>
  .bind("org", ({ user }) => findOrg(user.orgId)) // Result<Org, NotFound>
  .let("label", ({ user, org }) => `${user.name} @ ${org.name}`)
  .map(({ user, org, label }) => render(user, org, label));
// Result<View, NotFound>
```

```ts
import { Do, Ok, Err } from "unthrown";

// Ok path — the scope accumulates:
Do()
  .bind("a", () => Ok(2))
  .let("b", ({ a }) => a * 10)
  .map(({ a, b }) => a + b); // => Ok(22)

// Err path — the first Err short-circuits the rest:
Do()
  .bind("a", () => Err("boom"))
  .let("b", ({ a }) => a); // => Err("boom")
```

---

### DoAsync()

```ts
function DoAsync(): AsyncResult<{}, never>;
```

Defined in: [packages/core/src/do.ts:76](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/do.ts#L76)

Start an **asynchronous** do-notation chain with an empty object scope — the
pre-lifted form of [Do](#do), sparing you `Do().toAsync()`.

#### Returns

`AsyncResult`&lt;\{
\}, `never`&gt;

#### Remarks

From here a `bind` may return a `Result` **or** an `AsyncResult`; the scope
accumulates exactly as in a sync [Do](#do) chain, and a throw in any step
becomes a `Defect`. Named with the `Async` suffix the async free functions
carry (`OkAsync`, `allAsync`); the [AsyncResult](#asyncresult) companion aliases it as
`AsyncResult.Do` (the namespace already says "async", so the suffix drops).

#### Example

```ts
import { DoAsync, Ok } from "unthrown";

const result = await DoAsync()
  .bind("user", () => findUser(id)) // AsyncResult<User, NotFound>
  .bind("plan", ({ user }) => Ok(user.plan)) // a sync Result is accepted too
  .let("label", ({ user, plan }) => `${user.name} on ${plan}`);
// Result<{ user: User; plan: Plan; label: string }, NotFound>
```

## Guards

### isDefect()

```ts
function isDefect<T, E>(r): r is DefectView<T, E>;
```

Defined in: [packages/core/src/constructors.ts:204](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L204)

Type guard: narrow a [Result](#result) to its `Defect` variant, exposing `.cause`.

#### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |
| `E`            |

#### Parameters

| Parameter | Type                     |
| --------- | ------------------------ |
| `r`       | `Result`&lt;`T`, `E`&gt; |

#### Returns

`r is DefectView<T, E>`

`true` when `r` is a `Defect`.

#### Remarks

A `Defect` has no public constructor — it only arises at a boundary (e.g. a
callback throwing inside a combinator). This guard is how you detect one.

#### Example

```ts
import { isDefect, Ok } from "unthrown";

// A throw inside a combinator is captured as a Defect:
const r = Ok(1).map(() => {
  throw new Error("boom");
});
isDefect(r); // => true
isDefect(Ok(1)); // => false

if (isDefect(r)) r.cause; // unknown, narrowed
```

---

### isErr()

```ts
function isErr<T, E>(r): r is ErrView<E, T>;
```

Defined in: [packages/core/src/constructors.ts:176](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L176)

Type guard: narrow a [Result](#result) to its `Err` variant, exposing `.error`.

#### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |
| `E`            |

#### Parameters

| Parameter | Type                     |
| --------- | ------------------------ |
| `r`       | `Result`&lt;`T`, `E`&gt; |

#### Returns

`r is ErrView<E, T>`

`true` when `r` is `Err`.

#### Example

```ts
import { isErr, Ok, Err, type Result } from "unthrown";

isErr(Err("boom")); // => true
isErr(Ok(1)); // => false

declare const r: Result<number, string>;
if (isErr(r)) r.error; // string, narrowed
```

---

### isOk()

```ts
function isOk<T, E>(r): r is OkView<T, E>;
```

Defined in: [packages/core/src/constructors.ts:155](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/constructors.ts#L155)

Type guard: narrow a [Result](#result) to its `Ok` variant, exposing `.value`.

#### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |
| `E`            |

#### Parameters

| Parameter | Type                     |
| --------- | ------------------------ |
| `r`       | `Result`&lt;`T`, `E`&gt; |

#### Returns

`r is OkView<T, E>`

`true` when `r` is `Ok`.

#### Example

```ts
import { isOk, Ok, Err, type Result } from "unthrown";

isOk(Ok(1)); // => true
isOk(Err("boom")); // => false

declare const r: Result<number, string>;
if (isOk(r)) r.value; // number, narrowed
```

---

### isResult()

```ts
function isResult(x): x is Result<unknown, unknown>;
```

Defined in: [packages/core/src/core.ts:491](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/core.ts#L491)

Type guard: is `x` a [Result](#result) (any of `Ok` / `Err` / `Defect`)?

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `x`       | `unknown` |

#### Returns

`x is Result<unknown, unknown>`

`true` when `x` is a `Result` produced by this library.

#### Remarks

Unlike [isOk](#isok-4) / [isErr](#iserr-4) / [isDefect](#isdefect-4), which narrow a value
already known to be a `Result`, this narrows from `unknown` — useful at an
untyped boundary. It checks the value carries the `Result` prototype
(`instanceof` first, falling back to the `Symbol.for("unthrown.Result")`
brand the prototype carries — so a `Result` built by **another copy** of
unthrown, e.g. the CJS and ESM builds loaded side by side, is still
recognised). A look-alike plain object (`{ tag: "Ok" }`) carries neither and
is **not** matched. An `AsyncResult` is not a `Result` and returns `false`.

#### Example

```ts
import { isResult, Ok, P } from "unthrown";

isResult(Ok(1)); // => true
isResult({ tag: "Ok" }); // => false (look-alike, wrong prototype)
isResult(Ok(1).toAsync()); // => false (an AsyncResult is not a Result)

const x: unknown = Ok(1);
if (isResult(x))
  // `E` is `unknown` here — an untyped boundary has no cases to enumerate,
  // so the `P._` escape hatch is the only arm that can terminate the match:
  // oxlint-disable-next-line unthrown/no-catch-all-pattern -- untyped boundary: `E` is `unknown`
  x.match({
    ok: () => 1,
    errCases: (m) => m.with(P._, () => 0),
    defect: () => -1,
  });
```

## Tagged errors

### TaggedError()

```ts
function TaggedError<Tag>(tag, options?): TaggedErrorConstructor<Tag>;
```

Defined in: [packages/core/src/tagged.ts:110](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/tagged.ts#L110)

Build a base class for a tagged error — a class extending `Error` with a
`_tag` string discriminant, in the style of Effect's `Data.TaggedError`.

#### Type Parameters

| Type Parameter           | Description                      |
| ------------------------ | -------------------------------- |
| `Tag` _extends_ `string` | the string literal discriminant. |

#### Parameters

| Parameter       | Type                     | Description                                                                                      |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `tag`           | `Tag`                    | the discriminant value; also the default error `name`.                                           |
| `options?`      | \{ `name?`: `string`; \} | optional overrides. `options.name` sets `Error.name` independently of `tag` (defaults to `tag`). |
| `options.name?` | `string`                 | -                                                                                                |

#### Returns

[`TaggedErrorConstructor`](#taggederrorconstructor)&lt;`Tag`&gt;

#### Remarks

Extend the returned class to declare a concrete error. Supply the payload with
an instantiation expression; omit it for a payload-less error. The `message`
is **not** a payload field — it is the human string owned by `Error`, not
structured data, so it is reserved. Define it once per subclass the standard
way, `override message = "…"` (it may interpolate the payload via `this`,
which the base populates before the subclass field initialiser runs); a
payload `message` is rejected at compile time, so contextual detail lives in
typed fields, never baked into per-call prose. The `_tag` always reflects
`tag` and cannot be overridden by the payload. `name` is likewise reserved —
it is the display label (set it with `options.name`); a payload `name` is
rejected at compile time (and excluded from the instance type), so it can't
shadow `Error.name`. `stack` is reserved the same way — it is `Error`'s
trace, and even an untyped payload `stack` cannot clobber the real one.
`cause` is deliberately **not** reserved: `Error.cause` is typed `unknown`,
so a payload `cause` (e.g. a wrapped driver error) is a legitimate,
_narrowing_ structured field.

The matching half of the convention is `P.tag(t)` — the pattern constructor on
the `P` namespace, which builds the `{ _tag: t }` pattern this factory's `_tag`
is selected by (there is no standalone `tag` export).

`_tag` is the discriminant matched by `P.tag` in the error combinators
(`result.mapErrCases((matcher) => matcher.with(P.tag("NotFound"), …))`) and in
`match`'s `errCases` handler; `Error.name` is the human-facing label in stack
traces and logs. By default they coincide, but
they can be **decoupled** with `options.name` — so a tag can be namespaced for
collision-safety (`"@my-lib/RetryableError"`) without that slash-prefixed
string leaking into `Error.name`:

```ts
class RetryableError extends TaggedError("@my-lib/RetryableError", {
  name: "RetryableError",
}) {
  override message = "operation failed; safe to retry";
}

const e = new RetryableError();
e._tag; // "@my-lib/RetryableError" — namespaced discriminant
e.name; // "RetryableError"          — clean display name
e.message; // "operation failed; safe to retry" — the standard Error.message
```

#### Example

```ts
class NotFound extends TaggedError("NotFound") {}
class HttpError extends TaggedError("HttpError")<{ status: number }> {}

new NotFound()._tag; // => "NotFound"
new HttpError({ status: 500 }).status; // => 500
```

## Aggregate

### all()

```ts
function all<Rs>(
  results,
): Result<
  AllOk<Rs, { [K in string | number | symbol]: OkOf<Rs[K]> }>,
  ErrOf<Rs[number]>
>;
```

Defined in: [packages/core/src/interop.ts:421](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L421)

Collect a tuple/array of [Result](#result)s into a single `Result` of all their
success values.

#### Type Parameters

| Type Parameter                                                 |
| -------------------------------------------------------------- |
| `Rs` _extends_ readonly `Result`&lt;`unknown`, `unknown`&gt;[] |

#### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `results` | readonly \[`Rs`\] |

#### Returns

`Result`&lt;`AllOk`&lt;`Rs`, \{ \[K in string \| number \| symbol\]: OkOf\<Rs\[K\]\> \}&gt;, [`ErrOf`](#errof)&lt;`Rs`\[`number`\]&gt;&gt;

#### Remarks

Short-circuits on the **first** `Err` (later entries are not inspected for
their error); any `Defect` present **dominates**, winning even over an earlier
`Err`. A **fixed tuple** keeps its positional types — `all([Ok(1), Ok("a")])`
is `Result<[number, string], …>` — while a **dynamic array** `Result<T, E>[]`
collapses to `Result<T[], E>` with no cast. For a **record** keyed by name,
use [allFromDict](#allfromdict).

#### Example

```ts
import { all, Ok, Err } from "unthrown";

all([Ok(1), Ok("a"), Ok(true)]).get(); // => [1, "a", true] (typed [number, string, boolean])
all([Ok(1), Err("e"), Ok(3)]); // => Err("e") (short-circuits on the first Err)
```

---

### allAsync()

```ts
function allAsync<Rs>(
  results,
): AsyncResult<
  AllOk<Rs, { [K in string | number | symbol]: AsyncOkOf<Rs[K]> }>,
  AsyncErrOf<Rs[number]>
>;
```

Defined in: [packages/core/src/interop.ts:479](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L479)

The asynchronous counterpart of [all](#all): combine a tuple/array of
[AsyncResult](#asyncresult)s into one `AsyncResult` of all their success values.

#### Type Parameters

| Type Parameter                                                      |
| ------------------------------------------------------------------- |
| `Rs` _extends_ readonly `AsyncResult`&lt;`unknown`, `unknown`&gt;[] |

#### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `results` | readonly \[`Rs`\] |

#### Returns

`AsyncResult`&lt;`AllOk`&lt;`Rs`, \{ \[K in string \| number \| symbol\]: AsyncOkOf\<Rs\[K\]\> \}&gt;, [`AsyncErrOf`](#asyncerrof)&lt;`Rs`\[`number`\]&gt;&gt;

#### Remarks

The inputs are resolved **concurrently** (order preserved); the resolved
`Result`s are then folded with the same rules as [all](#all) — first `Err`
short-circuits, any `Defect` dominates. As ever, the returned `AsyncResult`'s
internal promise never rejects. For a **record**, use [allFromDictAsync](#allfromdictasync).

#### Example

```ts
import { allAsync, fromSafePromise } from "unthrown";

const both = allAsync([
  fromSafePromise(Promise.resolve(1)),
  fromSafePromise(Promise.resolve(2)),
]);
(await both).get(); // => [1, 2]
```

---

### allFromDict()

```ts
function allFromDict<R>(
  results,
): Result<{ [K in string | number | symbol]: OkOf<R[K]> }, ErrOf<R[keyof R]>>;
```

Defined in: [packages/core/src/interop.ts:450](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L450)

Collect a **record** of [Result](#result)s into a single `Result` of a record of
their success values — `allFromDict({ a: Result<A, E>, b: Result<B, E> })` is
`Result<{ a: A; b: B }, E>`. The named counterpart of [all](#all), for
parallel work you'd rather not tuple.

#### Type Parameters

| Type Parameter               |
| ---------------------------- |
| `R` _extends_ `ResultRecord` |

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `results` | `R`  |

#### Returns

`Result`&lt;\{ \[K in string \| number \| symbol\]: OkOf\<R\[K\]\> \}, [`ErrOf`](#errof)&lt;`R`\[keyof `R`\]&gt;&gt;

#### Remarks

Same folding rules as [all](#all): first `Err` short-circuits, any `Defect`
dominates. This is **not** error accumulation.

#### Example

```ts
import { allFromDict, Ok, Err } from "unthrown";

allFromDict({ id: Ok(1), name: Ok("ada") }).get(); // => { id: 1, name: "ada" }
allFromDict({ id: Ok(1), name: Err("missing") }); // => Err("missing")
```

---

### allFromDictAsync()

```ts
function allFromDictAsync<R>(
  results,
): AsyncResult<
  { [K in string | number | symbol]: AsyncOkOf<R[K]> },
  AsyncErrOf<R[keyof R]>
>;
```

Defined in: [packages/core/src/interop.ts:522](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/interop.ts#L522)

The asynchronous counterpart of [allFromDict](#allfromdict): combine a record of
[AsyncResult](#asyncresult)s into one `AsyncResult` of a record of their values.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| `R` _extends_ `AsyncResultRecord` |

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `results` | `R`  |

#### Returns

`AsyncResult`&lt;\{ \[K in string \| number \| symbol\]: AsyncOkOf\<R\[K\]\> \}, [`AsyncErrOf`](#asyncerrof)&lt;`R`\[keyof `R`\]&gt;&gt;

#### Remarks

Resolved concurrently (order preserved), folded with the [all](#all) rules,
and the internal promise never rejects.

#### Example

```ts
import { allFromDictAsync, fromSafePromise } from "unthrown";

const both = allFromDictAsync({
  a: fromSafePromise(Promise.resolve(1)),
  b: fromSafePromise(Promise.resolve("x")),
});
(await both).get(); // => { a: 1, b: "x" }
```

## Errors

### GetError

Defined in: [packages/core/src/core.ts:59](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/core.ts#L59)

Thrown by a [Result](#result)'s `get` / `getErr` when the assertion is
wrong on a _modeled_ result — `get()` on an `Err`, or `getErr()` on an
`Ok`.

#### Remarks

The offending value is exposed two ways: the typed [GetError.error](#error)
property for programmatic access, and the standard `Error.cause` for the
runtime and devtools to chain — when `E` is an `Error` (e.g. a `TaggedError`)
its original stack is printed under "caused by".

A `Defect` is never wrapped in a `GetError`: its original cause is
re-thrown (with its original stack) instead.

`get()` and `getErr()` are type-gated (`this: Result<T, never>` /
`Result<never, E>`), so the wrong-variant branch that throws this is
unreachable through well-typed code — it remains only as a defensive guard
against unsound runtime misuse (e.g. an `as` cast past the gate).

#### Extends

- `Error`

#### Type Parameters

| Type Parameter | Default type | Description                                          |
| -------------- | ------------ | ---------------------------------------------------- |
| `E`            | `unknown`    | the type of the [GetError.error](#error) it carries. |

#### Constructors

##### Constructor

```ts
new GetError<E>(error): GetError<E>;
```

Defined in: [packages/core/src/core.ts:65](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/core.ts#L65)

###### Parameters

| Parameter | Type |
| --------- | ---- |
| `error`   | `E`  |

###### Returns

[`GetError`](#geterror)&lt;`E`&gt;

###### Overrides

```ts
Error.constructor;
```

#### Properties

| Property                                       | Modifier   | Type      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                       | Inherited from          | Defined in                                                                                                                                         |
| ---------------------------------------------- | ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="cause"></a> `cause?`                    | `public`   | `unknown` | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.cause`           | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es2022.error.d.ts:24                                                         |
| <a id="error"></a> `error`                     | `readonly` | `E`       | The offending value: the `Err` error for `get()`, or the `Ok` value for `getErr()`.                                                                                                                                                                                                                                                                                                                                                               | -                       | [packages/core/src/core.ts:64](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/core.ts#L64) |
| <a id="message"></a> `message`                 | `public`   | `string`  | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.message`         | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1075                                                                |
| <a id="name"></a> `name`                       | `public`   | `string`  | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.name`            | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1074                                                                |
| <a id="stack"></a> `stack?`                    | `public`   | `string`  | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.stack`           | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1076                                                                |
| <a id="stacktracelimit"></a> `stackTraceLimit` | `static`   | `number`  | The `Error.stackTraceLimit` property specifies the number of stack frames collected by a stack trace (whether generated by `new Error().stack` or `Error.captureStackTrace(obj)`). The default value is `10` but may be set to any valid JavaScript number. Changes will affect any stack trace captured _after_ the value has been changed. If set to a non-number value, or set to a negative number, stack traces will not capture any frames. | `Error.stackTraceLimit` | node\_modules/.pnpm/@types+node@26.1.1/node\_modules/@types/node/globals.d.ts:67                                                                   |

#### Methods

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Defined in: node\_modules/.pnpm/@types+node@26.1.1/node\_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

###### Parameters

| Parameter         | Type       |
| ----------------- | ---------- |
| `targetObject`    | `object`   |
| `constructorOpt?` | `Function` |

###### Returns

`void`

###### Inherited from

```ts
Error.captureStackTrace;
```

##### prepareStackTrace()

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node\_modules/.pnpm/@types+node@26.1.1/node\_modules/@types/node/globals.d.ts:55

###### Parameters

| Parameter     | Type         |
| ------------- | ------------ |
| `err`         | `Error`      |
| `stackTraces` | `CallSite`[] |

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

```ts
Error.prepareStackTrace;
```

---

### NonExhaustiveError

Defined in: [packages/core/src/matcher.ts:241](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L241)

Thrown by `.run()` / `.exhaustive()` when no arm matched the value. For
well-typed callers the match is exhaustive by construction, so this is only
reachable by a value that slipped past the types (a widened cast, a raw-JS
caller); inside the error combinators the throw-to-defect net converts it to
a `Defect`, and at the `match` edge it surfaces (a genuinely unmodeled value
is a bug).

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new NonExhaustiveError(input): NonExhaustiveError;
```

Defined in: [packages/core/src/matcher.ts:244](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L244)

###### Parameters

| Parameter | Type      |
| --------- | --------- |
| `input`   | `unknown` |

###### Returns

[`NonExhaustiveError`](#nonexhaustiveerror)

###### Overrides

```ts
Error.constructor;
```

#### Properties

| Property                                         | Modifier   | Type      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                       | Inherited from          | Defined in                                                                                                                                                 |
| ------------------------------------------------ | ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="cause-1"></a> `cause?`                    | `public`   | `unknown` | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.cause`           | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es2022.error.d.ts:24                                                                 |
| <a id="input"></a> `input`                       | `readonly` | `unknown` | The value no arm matched.                                                                                                                                                                                                                                                                                                                                                                                                                         | -                       | [packages/core/src/matcher.ts:243](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/core/src/matcher.ts#L243) |
| <a id="message-1"></a> `message`                 | `public`   | `string`  | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.message`         | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1075                                                                        |
| <a id="name-1"></a> `name`                       | `public`   | `string`  | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.name`            | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1074                                                                        |
| <a id="stack-1"></a> `stack?`                    | `public`   | `string`  | -                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Error.stack`           | node\_modules/.pnpm/typescript@6.0.3/node\_modules/typescript/lib/lib.es5.d.ts:1076                                                                        |
| <a id="stacktracelimit-1"></a> `stackTraceLimit` | `static`   | `number`  | The `Error.stackTraceLimit` property specifies the number of stack frames collected by a stack trace (whether generated by `new Error().stack` or `Error.captureStackTrace(obj)`). The default value is `10` but may be set to any valid JavaScript number. Changes will affect any stack trace captured _after_ the value has been changed. If set to a non-number value, or set to a negative number, stack traces will not capture any frames. | `Error.stackTraceLimit` | node\_modules/.pnpm/@types+node@26.1.1/node\_modules/@types/node/globals.d.ts:67                                                                           |

#### Methods

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Defined in: node\_modules/.pnpm/@types+node@26.1.1/node\_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

###### Parameters

| Parameter         | Type       |
| ----------------- | ---------- |
| `targetObject`    | `object`   |
| `constructorOpt?` | `Function` |

###### Returns

`void`

###### Inherited from

```ts
Error.captureStackTrace;
```

##### prepareStackTrace()

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node\_modules/.pnpm/@types+node@26.1.1/node\_modules/@types/node/globals.d.ts:55

###### Parameters

| Parameter     | Type         |
| ------------- | ------------ |
| `err`         | `Error`      |
| `stackTraces` | `CallSite`[] |

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

```ts
Error.prepareStackTrace;
```
