**@unthrown/pattern**

---

# @unthrown/pattern

## Functions

### Defect()

#### Call Signature

```ts
function Defect(): object;
```

Defined in: [index.ts:60](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L60)

A `ts-pattern` pattern matching the `Defect` variant of a `Result`. With no
argument it matches any `Defect`; pass a sub-pattern to constrain or select
the unknown `cause`.

##### Returns

`object`

| Name  | Type       | Defined in                                                                                                                            |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tag` | `"Defect"` | [index.ts:60](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L60) |

#### Call Signature

```ts
function Defect<V>(cause): object;
```

Defined in: [index.ts:61](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L61)

A `ts-pattern` pattern matching the `Defect` variant of a `Result`. With no
argument it matches any `Defect`; pass a sub-pattern to constrain or select
the unknown `cause`.

##### Type Parameters

| Type Parameter | Description                                         |
| -------------- | --------------------------------------------------- |
| `V`            | the sub-pattern matched against the `Defect` cause. |

##### Parameters

| Parameter | Type |
| --------- | ---- |
| `cause`   | `V`  |

##### Returns

`object`

| Name    | Type       | Defined in                                                                                                                            |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `cause` | `V`        | [index.ts:61](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L61) |
| `tag`   | `"Defect"` | [index.ts:61](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L61) |

---

### Err()

#### Call Signature

```ts
function Err(): object;
```

Defined in: [index.ts:47](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L47)

A `ts-pattern` pattern matching the `Err` variant of a `Result`. With no
argument it matches any `Err`; pass a sub-pattern (e.g. [tag](#tag)) to
constrain or select the `error`.

##### Returns

`object`

| Name  | Type    | Defined in                                                                                                                            |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tag` | `"Err"` | [index.ts:47](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L47) |

#### Call Signature

```ts
function Err<V>(error): object;
```

Defined in: [index.ts:48](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L48)

A `ts-pattern` pattern matching the `Err` variant of a `Result`. With no
argument it matches any `Err`; pass a sub-pattern (e.g. [tag](#tag)) to
constrain or select the `error`.

##### Type Parameters

| Type Parameter | Description                                      |
| -------------- | ------------------------------------------------ |
| `V`            | the sub-pattern matched against the `Err` error. |

##### Parameters

| Parameter | Type |
| --------- | ---- |
| `error`   | `V`  |

##### Returns

`object`

| Name    | Type    | Defined in                                                                                                                            |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `error` | `V`     | [index.ts:48](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L48) |
| `tag`   | `"Err"` | [index.ts:48](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L48) |

---

### Ok()

#### Call Signature

```ts
function Ok(): object;
```

Defined in: [index.ts:34](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L34)

A `ts-pattern` pattern matching the `Ok` variant of a `Result`. With no
argument it matches any `Ok`; pass a sub-pattern to constrain or select the
`value` — a literal, or any `ts-pattern` pattern (e.g. `ts-pattern`'s own
`P.string` / `P.select()`, imported from `ts-pattern`, not this package).

##### Returns

`object`

| Name  | Type   | Defined in                                                                                                                            |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tag` | `"Ok"` | [index.ts:34](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L34) |

#### Call Signature

```ts
function Ok<V>(value): object;
```

Defined in: [index.ts:35](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L35)

A `ts-pattern` pattern matching the `Ok` variant of a `Result`. With no
argument it matches any `Ok`; pass a sub-pattern to constrain or select the
`value` — a literal, or any `ts-pattern` pattern (e.g. `ts-pattern`'s own
`P.string` / `P.select()`, imported from `ts-pattern`, not this package).

##### Type Parameters

| Type Parameter | Description                                     |
| -------------- | ----------------------------------------------- |
| `V`            | the sub-pattern matched against the `Ok` value. |

##### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `V`  |

##### Returns

`object`

| Name    | Type   | Defined in                                                                                                                            |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tag`   | `"Ok"` | [index.ts:35](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L35) |
| `value` | `V`    | [index.ts:35](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L35) |

---

### tag()

```ts
function tag<Tag>(value): object;
```

Defined in: [index.ts:80](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L80)

A `ts-pattern` pattern matching any value whose `_tag` equals `value` (e.g. a
`TaggedError`). Equivalent to the object pattern `{ _tag: value }`, but reads
better nested inside an [Err](#err) pattern and narrows to the matching
variant — including its payload.

#### Type Parameters

| Type Parameter           | Description                      |
| ------------------------ | -------------------------------- |
| `Tag` _extends_ `string` | the string literal tag to match. |

#### Parameters

| Parameter | Type  | Description          |
| --------- | ----- | -------------------- |
| `value`   | `Tag` | the `_tag` to match. |

#### Returns

`object`

| Name   | Type  | Defined in                                                                                                                            |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `_tag` | `Tag` | [index.ts:80](https://github.com/BtravStack/unthrown/blob/cb127b11f3e2a218b10efdc43d4cd5bdf6ee26d6/packages/pattern/src/index.ts#L80) |

#### Example

```ts
.with(P.Err(P.tag("Forbidden")), ({ error }) => error.user)
```
