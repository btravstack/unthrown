[**@unthrown/orpc**](index.md)

---

[@unthrown/orpc](index.md) / client

# client

## Client

### ResultClient

```ts
type ResultClient<T> =
  T extends Client<infer UContext, infer UInput, infer UOutput, infer UError>
    ? (...rest) => AsyncResult<UOutput, Extract<UError, AnyORPCError>>
    : {
        [K in keyof T]: T[K] extends AnyNestedClient
          ? ResultClient<T[K]>
          : never;
      };
```

Defined in: [client.ts:88](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/orpc/src/client.ts#L88)

The type of a [createResultClient](#createresultclient) client: every procedure of `T`
returns an `AsyncResult` instead of a throwing promise.

#### Type Parameters

| Type Parameter                  |
| ------------------------------- |
| `T` _extends_ `AnyNestedClient` |

---

### createResultClient()

```ts
function createResultClient<T>(client): ResultClient<T>;
```

Defined in: [client.ts:132](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/orpc/src/client.ts#L132)

Wrap an oRPC client so every procedure call returns an
`AsyncResult` — [fromCall](#fromcall) applied to the whole router.

#### Type Parameters

| Type Parameter                  |
| ------------------------------- |
| `T` _extends_ `AnyNestedClient` |

#### Parameters

| Parameter | Type | Description                                             |
| --------- | ---- | ------------------------------------------------------- |
| `client`  | `T`  | the oRPC client (or any nested router segment) to wrap. |

#### Returns

[`ResultClient`](#resultclient)&lt;`T`&gt;

#### Remarks

The mirror of oRPC's own `createSafeClient`, producing `AsyncResult`s
instead of `SafeResult` tuples: inferable errors land in the error channel
(the raw `ORPCError` union, discriminated by `code`), everything else is a
`Defect`. Call options (`signal`, `context`, `lastEventId`) pass through
untouched.

Event-iterator (streaming) procedures are out of scope: a stream does not
collapse to one `Result`. Keep calling those on the raw client.

#### Example

```ts
import { createResultClient } from "@unthrown/orpc/client";

const rc = createResultClient(client);

const greeting = await rc.planet
  .find({ id })
  .map((planet) => `Hello, ${planet.name}!`)
  .match({
    ok: (msg) => msg,
    // the `errCases` handler matches the error exhaustively: one arm per
    // `code` the procedure declares — no catch-all to absorb a new one
    errCases: (matcher) =>
      matcher
        .with({ code: "NOT_FOUND" }, () => "Hello, void!")
        .with({ code: "CONFLICT" }, () => "Hello, again!"),
    defect: () => "Hello, bug tracker!",
  });
```

---

### fromCall()

```ts
function fromCall<TOutput, TError>(
  promise,
): AsyncResult<TOutput, Extract<TError, AnyORPCError>>;
```

Defined in: [client.ts:56](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/orpc/src/client.ts#L56)

Lift a single oRPC call into an `AsyncResult`.

#### Type Parameters

| Type Parameter | Default type | Description                                                                                                  |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `TOutput`      | -            | the procedure's output type.                                                                                 |
| `TError`       | `Error`      | the call's error union; only its `ORPCError` arm is modeled, the rest is subtracted into the defect channel. |

#### Parameters

| Parameter | Type                                          | Description                 |
| --------- | --------------------------------------------- | --------------------------- |
| `promise` | `PromiseWithError`&lt;`TOutput`, `TError`&gt; | the in-flight call to lift. |

#### Returns

`AsyncResult`&lt;`TOutput`, `Extract`&lt;`TError`, `AnyORPCError`&gt;&gt;

#### Remarks

The error channel is the call's _inferable_ errors — the `ORPCError`s the
procedure declares via `.errors({...})` or returns as values, extracted as
`Extract<TError, AnyORPCError>` and discriminated by `code`. Any other
rejection (network failure, an undeclared throw collapsed to
`INTERNAL_SERVER_ERROR`, a malformed response) is a `Defect`: unmodeled,
flowing past the error combinators, panicking at `get`.

Accepts the promise of a client procedure call or of oRPC's server-side
`call(procedure, input)` — anything typed `PromiseWithError`.

#### Example

```ts
import { fromCall } from "@unthrown/orpc/client";

const planet = await fromCall(client.planet.find({ id }));
// planet: Result<Planet, ORPCError<"NOT_FOUND", undefined>>
if (planet.isErr()) planet.error.code; // "NOT_FOUND"
```
