# neverthrow → unthrown

Apply mechanically; the judgment calls live in SKILL.md's decide-once list.

## Mapping table

| neverthrow                                | unthrown                                          | Notes                                                                           |
| ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ok(v)` / `err(e)`                        | `Ok(v)` / `Err(e)`                                | capitalized free functions                                                      |
| `okAsync(v)` / `errAsync(e)`              | `OkAsync(v)` / `ErrAsync(e)`                      | pre-lifted async constructors                                                   |
| `result.map(f)`                           | same                                              | callback must be synchronous                                                    |
| `result.andThen(f)`                       | `result.flatMap(f)`                               | one name per concept                                                            |
| `result.andTee(f)` / `andThrough(f)`      | `tap(f)` / `flatTap(f)`                           |                                                                                 |
| `result.mapErr(f)`                        | `mapErrCases((matcher) => …)`                     | exhaustive: one `.with(…)` arm per case in `E` — see rewrite below              |
| `result.orElse(f)`                        | `flatMapErrCases(…)` or `recoverErrCases(…)`      | fallback `Result` vs plain recovery value — see rewrite below                   |
| `result.match(okFn, errFn)`               | `match({ ok, errCases: (matcher) => …, defect })` | object handlers; the `defect` arm is new and mandatory                          |
| `result.unwrapOr(v)`                      | `getOr(v)`                                        | all `unwrap*` names are removed; still panics on a Defect                       |
| `result.isOk()` / `isErr()`               | same                                              | plus `isDefect()`                                                               |
| `result.value` / `result.error`           | same, after narrowing                             |                                                                                 |
| `ResultAsync`                             | `AsyncResult`                                     | `await` collapses it to a `Result`; it never rejects                            |
| `ResultAsync.fromPromise(p, mapErr)`      | `fromPromise(p, qualify)`                         | `qualify(cause, defect)` must triage — the mapper was total, this is a decision |
| `ResultAsync.fromSafePromise(p)`          | `fromSafePromise(p)`                              | a rejection becomes a `Defect`, not an `Err`                                    |
| `Result.fromThrowable(fn, mapErr)`        | `fromThrowable(fn, qualify)`                      | wraps the function; same triage                                                 |
| `Result.combine([...])`                   | `all([...])` / `allAsync([...])`                  | record variant: `allFromDict` / `allFromDictAsync`                              |
| `Result.combineWithAllErrors([...])`      | —                                                 | accumulation is deliberately excluded — see gap below                           |
| `safeTry(function* () { yield* … })`      | `Do()` / `DoAsync()` + `.bind(name, f)` + `.let`  | see rewrite below                                                               |
| `fromPromise` re-thrown / `_unsafeUnwrap` | `get()` (needs `E = never`) / `getOrThrow()`      | type-gated extraction; no `_unsafe*` family                                     |

## The three non-mechanical rewrites

**`mapErr` → named cases.** The old callback silently absorbed every case; the
matcher makes each one explicit. Group cases sharing a handler — never `P._`:

```ts
// before: .mapErr((e) => new ApiError(e))
.mapErrCases((matcher) =>
  matcher.with(P.tag("NotFound"), P.tag("Conflict"), (e) => new ApiError({ cause: e })))
```

If the old `E` was `Error`/`unknown`, first apply the decide-once boundary
policy to give it real cases — do not port the blanket type.

**`orElse` → pick by what the fallback returns.** A fallback _value_ is
`recoverErrCases` (empties `E`); a fallback _Result_ (which may itself fail) is
`flatMapErrCases`. `okAsync(fallback)` inside an `orElse` is the value form:

```ts
// before: .orElse(() => okAsync({ ...user, orders: 0 }))
.recoverErrCases((matcher) => matcher.with("orders_unavailable", () => ({ ...user, orders: 0 })))
```

**`safeTry` → do-notation.** Each `yield* x.safeUnwrap()` becomes a
`.bind("name", (scope) => step)` (steps may return `Result` or `AsyncResult`;
errors union automatically); the final `ok(...)` becomes `.map(...)`:

```ts
// before: safeTry(async function* () { const u = yield* findUser(id).safeUnwrap(); … })
DoAsync()
  .bind("user", () => findUser(id))
  .bind("prefs", () => parseUser(raw))
  .map(({ user, prefs }) => ({ user, prefs }));
```

## Gap: `combineWithAllErrors`

unthrown has no error accumulation, deliberately. Options, in order: validate
with `@unthrown/standard-schema` (a validator's issue list is one modeled
error carrying all issues); or model the aggregate as one error case whose
payload holds the collected failures, built by folding the results yourself at
that one site. Do not fake a `Validation` type.

## The seam (untouched neverthrow callers)

Serve legacy callers the _exact_ legacy signature from a small compat file;
cut over the old module to `export * from "./the-seam"` so import paths don't
move:

```ts
// user-service.compat.ts — quarantined un-triage point; delete when the last
// legacy caller migrates.
import { toNeverthrowAsync } from "@unthrown/neverthrow";
import type { ResultAsync } from "neverthrow";
import { P } from "unthrown";
import { findUser as migrated, type User } from "./user-service.migrated";

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause), { cause });

export function findUser(id: string): ResultAsync<User, Error> {
  // onDefect folds a defect into the legacy blanket Error — byte-for-byte the
  // old behavior, where every rejection landed in E.
  return toNeverthrowAsync(
    migrated(id).mapErrCases(
      (matcher, defect) =>
        matcher
          .with(P.tag("DbError"), (e) => asError(e.cause)) // unwrap to the raw driver error
          .with(P.tag("UserNotFound"), (e) => e as Error), // TaggedError extends Error
    ),
    (cause) => asError(cause),
  );
}
```

Incoming legacy dependencies lift with `fromNeverthrow` / `fromNeverthrowAsync`
(two channels in — never a Defect). Removal: delete the compat file, grep for
its import and for `toNeverthrow`, drop `@unthrown/neverthrow`, then
`neverthrow` itself once nothing imports it.
