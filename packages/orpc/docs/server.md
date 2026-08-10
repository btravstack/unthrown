[**@unthrown/orpc**](index.md)

---

[@unthrown/orpc](index.md) / server

# server

## Server

### ResultHandler

```ts
type ResultHandler<TCurrentContext, TInput, TOutput, TError, TErrorMap> = (
  opts,
  input,
) =>
  | Result<TOutput, TError>
  | Promise<Result<TOutput, TError>>
  | AsyncResult<TOutput, TError>;
```

Defined in: [server.ts:36](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/orpc/src/server.ts#L36)

A procedure handler that speaks `Result`: same options as a plain oRPC
handler (`input`, `context`, `errors`, …), returning a
`Result<TOutput, TError>` — synchronous, promised, or as an
`AsyncResult`.

#### Type Parameters

| Type Parameter                        |
| ------------------------------------- |
| `TCurrentContext` _extends_ `Context` |
| `TInput`                              |
| `TOutput`                             |
| `TError` _extends_ `AnyORPCError`     |
| `TErrorMap` _extends_ `ErrorMap`      |

#### Parameters

| Parameter | Type                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `opts`    | `ProcedureHandlerOptions`&lt;`TCurrentContext`, `TInput`, `ORPCErrorConstructorMap`&lt;`TErrorMap`&gt;&gt; |
| `input`   | `TInput`                                                                                                   |

#### Returns

\| `Result`&lt;`TOutput`, `TError`&gt;
\| `Promise`&lt;`Result`&lt;`TOutput`, `TError`&gt;&gt;
\| `AsyncResult`&lt;`TOutput`, `TError`&gt;

---

### handlerResult()

```ts
function handlerResult<TCurrentContext, TInput, TOutput, TError, TErrorMap>(
  handler,
): ProcedureHandler<
  TCurrentContext,
  TInput,
  TOutput | TError,
  ORPCErrorConstructorMap<TErrorMap>
>;
```

Defined in: [server.ts:84](https://github.com/BtravStack/unthrown/blob/178f0fe556a901384c2c7d02bd6fe151dfc25b24/packages/orpc/src/server.ts#L84)

Adapt a `Result`-returning handler into a plain oRPC procedure handler.

#### Type Parameters

| Type Parameter                        |
| ------------------------------------- |
| `TCurrentContext` _extends_ `Context` |
| `TInput`                              |
| `TOutput`                             |
| `TError` _extends_ `AnyORPCError`     |
| `TErrorMap` _extends_ `ErrorMap`      |

#### Parameters

| Parameter | Type                                                                                                   | Description                             |
| --------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `handler` | [`ResultHandler`](#resulthandler)&lt;`TCurrentContext`, `TInput`, `TOutput`, `TError`, `TErrorMap`&gt; | the `Result`-speaking handler to adapt. |

#### Returns

`ProcedureHandler`&lt;`TCurrentContext`, `TInput`, `TOutput` \| `TError`, `ORPCErrorConstructorMap`&lt;`TErrorMap`&gt;&gt;

#### Remarks

The elimination boundary of the server half: `Ok` becomes the procedure's
output; `Err` (constrained to `ORPCError` — build one with the injected
`errors.CODE(...)` constructors, or map a domain error via `mapErrCases` first)
is returned as a value, which oRPC marks _inferable_ so the client sees it
fully typed; a `Defect` rethrows its original cause, which oRPC collapses
to `INTERNAL_SERVER_ERROR` — a bug stays a defect, never a typed error.

Like `match` handlers, the callback may be `async` (an edge elimination is
exempt from the no-thenable rule): a rejection or throw inside it cannot
skip triage, because oRPC's own boundary already treats it as the defect
path.

#### Example

```ts
import { P } from "unthrown";
import { handlerResult } from "@unthrown/orpc/server";

const find = os
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: {} })
  .handler(
    handlerResult(({ input, errors }) =>
      repo
        .findPlanet(input.id)
        .mapErrCases((matcher) =>
          matcher.with(P.tag("NotFound"), () => errors.NOT_FOUND()),
        ),
    ),
  );
```
