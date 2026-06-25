# unthrown

A small, focused TypeScript library for **explicit errors as values**, with a
separate **defect channel** for the unexpected.

It exists because the alternatives fall short: `boxed` and `neverthrow` don't
model unexpected errors through a defect channel and don't enforce error
qualification when crossing async boundaries; `effect` is too heavy and conflates
error handling with context, runtime, etc. `unthrown` does one thing.

The name states the concern: ordinary errors are _unthrown_ — returned as values,
not flung up the stack. Only a true defect ever throws (at `unwrap`).

> **Design rationale: [`docs/design-memory.md`](docs/design-memory.md).** This
> file is the _rules_; that file is the _reasoning_ — the why behind every
> decision below, plus the alternatives that were considered and rejected. Read
> it before changing anything in the Thesis, invariants, or surface sections, and
> keep both files in sync as the code evolves (describe what _is_, not what was
> planned).

## Thesis (do not drift from these)

1. **`Result<T, E>` where `E` is only the _anticipated_ domain failures.** A
   defect (an unmodeled failure) is a third runtime state — a `Defect` — that is
   **invisible to the type**. If a failure mode appears in `E`, it is by
   definition modeled and is no longer a defect.
2. **No `Option` type.** Absence is expressed with the type system we already
   trust: `T | undefined`, `T | null`, or `Result<T, NotFound>`. Interop with
   nullable third-party APIs goes through `fromNullable`. Do not add `Option`.
3. **Qualification is enforced at every boundary.** `fromPromise` / `fromThrowable`
   take a mandatory `qualify: (cause: unknown) => E | Defect`. There is no path
   that produces `unknown` in `E`. The boundary forces a triage decision.
4. **`TaggedError` is the error convention** (à la Effect's `Data.TaggedError`):
   a `_tag` discriminant on a class extending `Error`. Core `Result<T, E>` stays
   **generic in `E`** (unconstrained); only the tag-aware utilities require
   `E extends { _tag: string }`.

## Load-bearing runtime invariants (tests must guard these)

- **Throw → defect.** Any value thrown by a callback inside a combinator
  (`map`, `flatMap`, `mapErr`, `orElse`, `recover`, `tap*`, `recoverDefect`) is
  caught and converted to a `Defect`. Nothing escapes a pipeline as a raw throw.
  This is what lets an HTTP adapter do a single `match({ ok, err, defect })`
  with **no surrounding `try/catch`**.
- **A `Defect` flows through every method untouched EXCEPT `match()` and
  `recoverDefect()`.** Therefore `unwrapOr`, `unwrapOrElse`, `getOrNull`,
  `getOrUndefined` still **throw** on a `Defect` — they recover the modeled `Err`,
  never an unmodeled defect (a defect is a bug, not an absent value).
- **`unwrap()` is asymmetric.** On `Err` it throws a `UnwrapError` carrying `E`.
  On a `Defect` it **rethrows the original `cause`** (it _panics_) with its
  original stack, so an unhandled defect hits the global handler looking like the
  real failure.
- **`recover` returns `Result<T | U, never>`, and `never` means only the _error_
  channel is empty — a `Defect` can still be present at runtime.** This is the one
  place the type intentionally under-describes the runtime. Do not read `never`
  as "total".
- **An `AsyncResult`'s internal promise NEVER rejects.** Every rejection or
  thrown value is captured as `Err` (via `qualify`) or `Defect`. `await`-ing an
  `AsyncResult` always yields a `Result` and never throws.

## Public surface (already implemented in packages/core/src/result.ts)

`Result<T, E>` and `AsyncResult<T, E>` share one method surface. `AsyncResult`
is a thenable wrapper (method parity with `Result`); its callbacks may be async,
and `await` collapses it to a `Result`.

- success: `map`, `flatMap`, `tap`, `as`
- error: `mapErr`, `orElse`, `recover`, `tapErr`
- defect: `recoverDefect`, `tapDefect`
- eliminate: `match`, `unwrap`, `unwrapErr`, `unwrapOr`, `unwrapOrElse`,
  `getOrNull`, `getOrUndefined`
- guards: methods `isOk`/`isErr`/`isDefect` (boolean) + standalone
  `isOk`/`isErr`/`isDefect` (narrow to `OkView`/`ErrView`/`DefectView`)
- constructors: `ok`, `err`, `defect`
- interop: `fromNullable`, `fromThrowable`, `fromPromise`, `fromSafePromise`
- aggregate: `all` (first `Err` wins; any `Defect` dominates)
- facade: a `Result` companion object aliases the standalone entry points
  (`Result.ok`/`err`/`defect`/`from*`/`all`/`is*`) for discoverability; the free
  functions remain the primary, tree-shakeable API. One concept, two import
  styles — not a second concept.

Deliberately **excluded** for now: `gen`/do-notation (heaviest possible
addition; revisit only if sequential code demands it), accumulation/`Validation`,
and aliases (`andThen`, etc. — one name per concept). Keep the surface small
enough that the library can be "done".

## Monorepo layout

- `packages/core` → `unthrown` (zero runtime dependencies)
- `packages/pattern` → `@unthrown/pattern` (peerDep `ts-pattern`)
- `packages/vitest` → `@unthrown/vitest` (peerDep `vitest`)

Never pull `ts-pattern` or `vitest` into core.

## Roadmap (suggested order)

1. **Scaffold the workspace.** package.json `exports`, build (tsup or tsc),
   `tsconfig` (strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`),
   the `@unthrown` scope placeholder publishes so the util packages can depend on
   it. Publish `unthrown` and an empty `@unthrown/core` early to claim the names.
2. **`packages/core/src/tagged.ts`** — `TaggedError(tag)` factory (extends
   `Error`, `_tag`, no-arg constructor when payload is empty via the
   `keyof A extends never ? void : A` trick) and `matchTags(result, handlers)`:
   a zero-dependency exhaustive fold whose handler object is
   `{ Ok, Defect } & { [K in E["_tag"]]: (e: Extract<E, {_tag: K}>) => R }`.
3. **`packages/vitest`** — custom matchers: `toBeOk`, `toBeOkWith`, `toBeErr`,
   `toBeErrTagged`, `toBeDefect`. Augment the `Matchers` interface (Vitest 3.2+).
   Async matchers must detect a thenable `AsyncResult` and await internally; the
   test then reads `await expect(asyncResult).toBeOk()`.
4. **`packages/pattern`** — thin `ts-pattern` integration: a `P.tag(tag)` sugar
   and an adapter exposing the ok/err/defect channels. Keep it small — the power
   is ts-pattern's, `matchTags` covers the everyday exhaustive case.

## Conventions

- TypeScript `strict`; target modern ES; ESM-first with type exports.
- Tests: Vitest. Every load-bearing invariant above gets an explicit test.
- One concept = one name. Resist convenience aliases.
- The core has **no runtime dependencies**. This is a feature; protect it.
