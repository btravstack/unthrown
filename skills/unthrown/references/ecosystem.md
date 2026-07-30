# @unthrown/* satellite packages

Contents: [Testing: @unthrown/vitest](#testing-unthrownvitest) ·
[Linting: @unthrown/oxlint](#linting-unthrownoxlint) ·
[Prisma](#prisma-unthrownprisma) · [oRPC](#orpc-unthrownorpc) ·
[Validation: @unthrown/standard-schema](#validation-unthrownstandard-schema) ·
[Interop bridges](#interop-bridges-effect-neverthrow-boxed)

Every satellite takes core (`unthrown`) as a peer/`workspace:^` dependency —
never pin core exactly (dual-copy hazard with `isResult`'s `instanceof`).

## Testing: @unthrown/vitest

Importing the package registers matchers via `expect.extend` (its one
import-time side effect) and a module-level `afterEach`.

| matcher                            | asserts                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toBeOk()` / `toBeOkWith(value)`   | Ok / Ok with deep-equal value                                                                                                                       |
| `toBeErr()` / `toBeErrWith(error)` | Err / Err with deep-equal error                                                                                                                     |
| `toBeErrTagged(tag, payload?)`     | Err carrying a TaggedError with `_tag === tag`; optional payload is deep-compared (exact for a plain object, partial for `expect.objectContaining`) |
| `toBeDefect()`                     | Defect                                                                                                                                              |

They detect a thenable `AsyncResult` and await internally:

```ts
await expect(asyncResult).toBeErrTagged("NotFound", { id: "42" });
```

A forgotten `await` on an async assertion fails the test at its end
(`failOnForgottenAwait`, auto-registered), naming the pending matchers. Manual
wiring exports: the six raw matcher functions, `failOnForgottenAwait`, and the
`UnthrownMatchers` type.

## Linting: @unthrown/oxlint

An oxlint JS plugin (peer `oxlint`). Seven rules; scope-analysis keyed to
unthrown imports, so they only fire on unthrown's `Result`.

**Recommended preset:**

- `no-ambiguous-error-type` — bans `unknown`/`any`/`Error`/`{}`/primitive
  keywords in `E` (annotations and `returnType<R>()` pins inside `mapErrCases`).
- `prefer-async-result` — reports `Promise<Result<T, E>>` in favour of
  `AsyncResult<T, E>` (no autofix on `async` function return annotations or
  function-type return positions — those must stay `Promise`).
- `no-unhandled-result` — flags a bare expression statement dropping a
  `Result` (syntactic; a dropped method chain is out of scope).
- `no-catch-all-pattern` — reports `P._` / `P.any`; keep-the-wildcard sites
  (generic-`E` helpers, single-type `E`) carry a targeted `oxlint-disable`
  with a reason.
- `no-unused-matcher` — reports a `…Cases` callback (or `match`'s `errCases`
  handler) whose matcher parameter is absent or never read, and a second
  `match(...)` built in the callback's own body — a borrowed builder matches
  whatever value it closed over, not the error. No escape hatch.

**Opt-in (not in the preset):**

- `no-throw` — reports every `throw`, pointing at
  `Err`/`getOrThrow`/`fromSafeThrowable`.
- `prefer-ensure` — flags `flatMap((x) => c ? Ok(x) : Err(e))` (a predicate
  wearing a bind costume); report-only, no autofix.

## Prisma: @unthrown/prisma

Peer `@prisma/client` ^7 (node >= 20.19). A client extension:

```ts
import { unthrownPrisma } from "@unthrown/prisma";
const db = new PrismaClient({ adapter }).$extends(unthrownPrisma);

db.user.tryFindUniqueOrThrow({ where: { id } });
// AsyncResult<User, RecordNotFound | DriverError>
```

- `try*` variants of all seventeen model delegate operations; the error
  channel is exactly the P-codes that operation can raise:
  `UniqueConstraintViolation` (P2002), `ForeignKeyViolation` (P2003),
  `RecordNotFound` (P2025), everything else `DriverError` with the cause
  preserved. `upsert` and `*Many` batch mutations never carry `RecordNotFound`.
- `$tryTransaction(cb)` — interactive transaction whose callback speaks
  `AsyncResult`: an `Err` rolls back and re-surfaces typed; a defect (throwing
  callback included) rolls back and stays a defect.
- `tryPaginate(...).withCursor(...)` — cursor pagination.
- `qualifyPrismaError` — the exported qualify, for hand-rolled boundaries.
- Raw methods remain the escape hatch for batch `$transaction([...])` and raw
  SQL.

## oRPC: @unthrown/orpc

Peers `@orpc/client` + optional `@orpc/server` (^2.0.0-beta). Mapping: `Ok` ↔
output, `Err` ↔ returned _inferable_ `ORPCError` (declared via `.errors({...})`
or returned as a value), `Defect` ↔ everything else (collapses to
`INTERNAL_SERVER_ERROR` on the wire). Three entry points, no root export:

- `@unthrown/orpc/server` — `handlerResult(fn)` adapts a `Result`-returning
  handler; `Err` must be an `ORPCError` (do the `mapErrCases` into
  `errors.CODE(...)` at the endpoint); a `Defect` rethrows its cause. The
  callback may be async (an elimination edge, exempt like `match`).
- `@unthrown/orpc/extensions/result` — opt-in `.result()` builder method
  (side-effectful import: prototype patches + module augmentation).
- `@unthrown/orpc/client` — `fromCall(promise)` lifts one call;
  `createResultClient(client)` wraps a whole router. `E` is the raw inferable
  `ORPCError` union discriminated by `code` — match with
  `.with({ code: "NOT_FOUND" }, …)`, not `P.tag`.
- Event-iterator (streaming) procedures are out of scope — use the raw client.

## Validation: @unthrown/standard-schema

Bridges any Standard Schema validator (Zod, Valibot, ArkType) to `Result`:

- `fromSchema(schema, input)` → `Result<Output, SchemaIssues>`
- `fromSchemaAsync(schema, input)` → `AsyncResult<Output, SchemaIssues>`

The validation issues are the modeled `E` — no throwing parse.

## Interop bridges (effect, neverthrow, boxed)

Thin `to*`/`from*` bridges. The shape rule: **does the neighbour have a defect
channel?**

- `@unthrown/effect` — Effect has one (`Cause.die`), so `Result ↔ Exit` is a
  bijection: `toExit`/`fromExit` (a die-cause defect dominates), plus
  `toEffect`/`fromEffect` and `toEither`/`fromEither` (`toEither` has no
  defect target, so it takes a mandatory `onDefect`).
- `@unthrown/neverthrow` — no defect channel: `fromNeverthrow` /
  `fromNeverthrowAsync` (only Ok/Err come in); `toNeverthrow` /
  `toNeverthrowAsync` take a **mandatory** `onDefect: (cause) => E` (forced
  triage; there is no one-arg form).
- `@unthrown/boxed` — same rule (peer is `@bloodyowl/boxed`, the maintained
  scope): `fromBoxed` / `fromBoxedFuture`; `toBoxed` / `toBoxedFuture` with
  mandatory `onDefect`.

The async names are deliberately asymmetric (`toNeverthrowAsync` vs
`toBoxedFuture`) — each names the neighbour's own async type.
