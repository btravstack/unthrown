# unthrown

A small, focused TypeScript library for **explicit errors as values**, with a
separate **defect channel** for the unexpected.

It exists because the alternatives fall short: `boxed` and `neverthrow` don't
model unexpected errors through a defect channel and don't enforce error
qualification when crossing async boundaries; `effect` is too heavy and conflates
error handling with context, runtime, etc. `unthrown` does one thing.

The name states the concern: ordinary errors are _unthrown_ — returned as values,
not flung up the stack. Only a true defect ever throws (at `unwrap`).

This file is the authoritative spec — the rules _and_ the reasoning behind them.
Keep it in sync with the code as the library evolves (describe what _is_, not what
was planned).

## Thesis (do not drift from these)

1. **`Result<T, E>` where `E` is only the _anticipated_ domain failures.** A
   defect (an unmodeled failure) is the third variant of the `Result` union
   (`{ tag: "Defect" }`), but it **never appears in `E`**. If a failure mode
   appears in `E`, it is by definition modeled and is no longer a defect. The
   defect is matchable like any variant, but you never thread it through your
   domain error type.
2. **No `Option` type.** Absence is expressed with the type system we already
   trust: `T | undefined`, `T | null`, or `Result<T, NotFound>`. Interop with
   nullable third-party APIs goes through `fromNullable`. Do not add `Option`.
3. **Qualification is enforced at every boundary.** `fromPromise` / `fromThrowable`
   take a mandatory `qualify: (cause: unknown) => E | Defect`. There is no path
   that produces `unknown` in `E`. The boundary forces a triage decision. This is
   also why **`AsyncResult` combinator callbacks are synchronous** — a raw
   `Promise` may never enter an `AsyncResult` method (its rejection would
   silently become a defect, skipping the triage). Async work re-enters only
   through `fromPromise` / `fromSafePromise` and composes via `flatMap`.
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

## Public surface (implemented in packages/core/src/, split into focused modules)

`Result<T, E>` is a **discriminated union** — `{ tag: "Ok"; value } | { tag:
"Err"; error } | { tag: "Defect"; cause }`, each intersected with the shared
method surface — so it matches **natively** (a `switch` on `tag`, or
`ts-pattern`'s `match(r).with({ tag: "Ok" }, …).exhaustive()`) **and** chains
fluently. The payload is reachable only after narrowing, so "check before you
access" still holds.

`AsyncResult<T, E>` shares that method surface as an awaitable wrapper typed
`Awaitable<Result<T, E>>` — a **success-only thenable**, not a full `PromiseLike`
(its internal promise never rejects, so there is no rejection channel to model).
Its **combinator callbacks are synchronous** (no raw `Promise` — see Thesis #3);
async work re-enters via `fromPromise` / `fromSafePromise` and composes with
`flatMap`. `await` collapses an `AsyncResult` to a `Result` (then match it).

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
- tagged errors: `TaggedError(tag)` (the error-class factory) and
  `matchTags(result, handlers)` (an exhaustive `{ Ok, Defect } & per-tag` fold);
  see the `TaggedError` convention in Thesis #4.

Deliberately **excluded** for now: `gen`/do-notation (heaviest possible
addition; revisit only if sequential code demands it), accumulation/`Validation`,
and aliases (`andThen`, etc. — one name per concept). Keep the surface small
enough that the library can be "done".

## Internal design (don't break these)

- **`Result` / `AsyncResult` are the public types; `Res` / `AsyncRes` are the
  internal classes** (in `core.ts`, **never re-exported from `index.ts`**).
  `Result` is a discriminated union (`{ tag; value/error/cause } & methods`) where
  each variant is `Res` (a method holder, like boxed's `__Result`) intersected
  with its `tag`/payload. `Res` is **never `new`'d**: the builders
  `okRes`/`errRes`/`defectRes` create instances with `Object.create(Res.prototype)`
  and return them as the variant type (`OkView`/`ErrView`/`DefectView`) — so a
  builder yields a value that already _is_ a union member, with **no construction
  cast**. `Res` methods type `this` as `Result<T, E>` and narrow on `tag`. The
  only remaining casts are the inherent type-changing pass-throughs (`map` reusing
  an `Err` as a differently-typed `Result`) — the same `as unknown as` boxed uses,
  sound because the passed-through variant carries no value of the changed type.
- "Check before you access" is enforced by the union: `result.value` only
  type-checks on the `Ok` variant. `AsyncRes` operates purely on the public
  `Result` union (wraps a `Promise<Result>`, branches on `r.tag`), never on `Res`
  internals.
- **Builders are free functions** (`ok`, `err`, …) because they tree-shake — and
  there is a `bundle-size` CI gate that protects this. The `Result` companion
  object is additive sugar (value + type share the name via a re-alias in
  `facade.ts`); it must stay a separate export so `import { ok }` never pulls it
  in.
- **`AsyncResult` is `Awaitable<Result<T,E>>`, not `PromiseLike`.** Its `then`
  stays a runtime thenable (so `await` collapses it) and forwards `onrejected`
  defensively, but the type advertises no rejection channel — because the internal
  promise never rejects.
- **Source layout** (`packages/core/src/`): `types.ts` (public types), `defect.ts`
  (the `Defect` marker), `core.ts` (the `Res`/`AsyncRes` engine + `UnwrapError`),
  `constructors.ts` (`ok`/`err` + guards), `interop.ts` (`from*`/`qualify`/`all`),
  `facade.ts` (the `Result` object), `tagged.ts` (`TaggedError`/`matchTags`), and
  `index.ts` (the curated public re-exports — the one place the API is decided).

## Monorepo layout

- `packages/core` → `unthrown` (zero runtime dependencies)
- `packages/pattern` → `@unthrown/pattern` (peerDep `ts-pattern`)
- `packages/vitest` → `@unthrown/vitest` (peerDep `vitest`)
- `tools/tsconfig`, `tools/typedoc` → private shared config (`@unthrown/tsconfig`,
  `@unthrown/typedoc`)
- `docs` → `@unthrown/docs`, the VitePress site (guide + TypeDoc-generated API
  reference); deployed to GitHub Pages by `deploy-docs.yml`

Never pull `ts-pattern` or `vitest` into core.

## Status (all four roadmap items shipped)

1. ✅ **Scaffold the workspace.** Done — pnpm + turbo workspace, dual CJS/ESM
   tsdown build, strict shared tsconfig, oxlint/oxfmt, knip, changesets, CI. The
   core `unthrown` package is split into focused modules, fully TSDoc'd, and
   covered by a 108-test suite (100% line/function coverage). (Publishing the
   names to npm remains a manual step.)
2. ✅ **`packages/core/src/tagged.ts`** — Done. `TaggedError(tag)` factory
   (extends `Error`, `_tag`, no-arg constructor when payload is empty via the
   `keyof A extends never ? void : A` trick) and `matchTags(result, handlers)`:
   a zero-dependency exhaustive fold whose handler object is
   `{ Ok, Defect } & { [K in E["_tag"]]: (e: Extract<E, {_tag: K}>) => R }`.
3. ✅ **`packages/vitest`** — Done. Custom matchers `toBeOk`, `toBeOkWith`,
   `toBeErr`, `toBeErrTagged`, `toBeDefect`, registered via `expect.extend` and
   augmenting Vitest's `Matchers` interface. They detect a thenable `AsyncResult`
   and await internally, so a test reads `await expect(asyncResult).toBeOk()`
   (the required `await` is documented loudly — a forgotten one passes silently).
4. ✅ **`packages/pattern`** — Done. Thin `ts-pattern` integration: `tag(t)`
   sugar (the `{ _tag: t }` pattern, narrowing to the variant + payload) and
   `toMatchable(result)` exposing the ok/err/defect channels as a `_kind`
   discriminated union. Kept small — the power is ts-pattern's; `matchTags`
   covers the everyday exhaustive case.

Also shipped: a root `README` + `LICENSE`, per-package READMEs, and the VitePress
docs site (guide + generated API reference). **Remaining work is manual** and
cannot be automated from here: publish `unthrown` + the `@unthrown` scope to npm,
create the `RELEASE_PAT` secret, and configure npm Trusted Publishers for the
changesets `release.yml` (plus enabling GitHub Pages for `deploy-docs.yml`).

## Toolchain & conventions

- **Stack:** pnpm (catalog) + turbo; build with **tsdown** (dual CJS/ESM + d.ts);
  lint/format with **oxlint** / **oxfmt**; **knip** for dead-code/deps; **vitest**
  (+ v8 coverage); **typedoc** (markdown) feeding **vitepress**; **changesets**
  for releases; **lefthook** + **commitlint** (conventional commits) on commit.
- **Gate (all must stay green):** `pnpm format --check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build`. CI mirrors these.
- TypeScript `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`;
  ESM-first; `moduleResolution: NodeNext` (relative imports use `.js`).
- **oxlint rules are binding:** no `interface` (use `type`), no `any` (use
  `unknown`). Genuine exceptions (e.g. the `vitest` `Matchers` augmentation, the
  `AsyncRes.then` thenable) carry a targeted `oxlint-disable` with a reason.
- Tests: Vitest. Every load-bearing invariant above gets an explicit test
  (`invariants.spec.ts` guards them 1:1); core holds 100% line/function coverage,
  enforced by thresholds in its `vitest.config.ts`.
- Public API carries full **TSDoc**; `pnpm --filter <pkg> build:docs` must stay
  typedoc-warning-free.
- One concept = one name. Resist convenience aliases.
- The core has **no runtime dependencies**. This is a feature; protect it.
