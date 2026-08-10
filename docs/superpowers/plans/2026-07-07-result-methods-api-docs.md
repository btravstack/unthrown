# Combinator Method Docs on the API Reference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fluent combinators (`map`, `flatMap`, `mapErr`, `match`, `unwrap`, …) appear on the generated API reference for both `Result` (via an exported, doc-only `ResultMethods`) and `AsyncResult` (via an exported, doc-only `AsyncResultMethods` with the async signatures).

**Architecture:** Both surfaces are documented the same way, because TypeScript forbids the alternative. A `Result`/`AsyncResult` is a value+type sharing one name (companion pattern) — which only compiles when both are declared **local to one module** (`facade.ts`). So the public type stays a facade re-alias, and the methods are documented on a separate exported object-literal type that TypeDoc renders in full: `ResultMethods<T,E>` for the sync surface, `AsyncResultMethods<T,E>` for the async surface. The type docs and variants link to them.

**Tech Stack:** TypeScript (strict, NodeNext ESM, `.js` relative imports), TypeDoc (markdown plugin) → VitePress, changesets, pnpm + turbo. No runtime code changes — TSDoc, two new doc-only type exports, and cross-links only.

> **Design correction (2026-07-07):** an earlier draft tried to _un-indirect_ `AsyncResult` (export its structural type from `types.ts`, value from `facade.ts`). That is impossible: a value re-export from one module and a type re-export of the same name from another give `TS2300: Duplicate identifier` (verified). The value+type merge must stay local to `facade.ts`; hence the `AsyncResultMethods` approach below, symmetric with `ResultMethods`.

## Global Constraints

- The core package has **zero runtime dependencies** — do not add any.
- oxlint rules are binding: no `interface` (use `type`), no `any` (use `unknown`). Genuine exceptions carry a targeted `oxlint-disable` with a reason.
- TypeScript `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`; ESM-first; relative imports use `.js`.
- Conventional commits (commitlint + lefthook run on commit). Use `docs(core): …` / `docs: …` scopes for these doc-only changes.
- The full gate must stay green: `pnpm format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build`. `pnpm --filter unthrown build:docs` must stay typedoc-warning-free.
- One concept = one name. No convenience aliases.
- `packages/core/docs/` is a gitignored build artifact — never commit it.
- CLAUDE.md is the authoritative spec — describe what _is_. Keep it in sync (Task 4).

---

## File Structure

- `packages/core/src/types.ts` — `ResultMethods` doc (done in Task 1); new exported `AsyncResultMethods` type + `AsyncResult` redefined as `Awaitable<…> & AsyncResultMethods<…>`; `OkView`/`ErrView`/`DefectView` cross-link lines.
- `packages/core/src/facade.ts` — update the `Result` and `AsyncResult` type `@remarks` to link `ResultMethods` / `AsyncResultMethods`. The re-aliases themselves stay.
- `packages/core/src/index.ts` — add `AsyncResultMethods` to the type-only re-export block (`ResultMethods` already added in Task 1).
- `packages/core/typedoc.json` — `"Methods"` category (added in Task 1); no further change (both `Result` and `AsyncResult` stay in `intentionallyNotExported` as re-aliased union/alias types; `ResultMethods`/`AsyncResultMethods` are exported, so absent from that list).
- `docs/guide/choosing-a-combinator.md` — a pointer to the API method reference.
- `CLAUDE.md` — reverse the "method surface" decision record.
- `.changeset/document-combinator-surface.md` — rewrite to describe the final state.

The "test" for each task is a `grep` assertion against the generated `packages/core/docs/index.md` plus the standard gate commands — there is no runtime unit test surface for doc generation.

---

## Task 1: Export & document `ResultMethods` (sync method reference) — ✅ COMPLETE

Committed as `ac47f34`. `ResultMethods` de-internalized, `@category Methods`, doc-only remark, exported from `index.ts`, `"Methods"` added to `typedoc.json` `categoryOrder`, removed from `intentionallyNotExported`. Do not redo.

---

## Task 2: Factor & export `AsyncResultMethods` (async method reference)

**Files:**

- Modify: `packages/core/src/types.ts:390-480` (replace the inline-method `AsyncResult` definition with a new `AsyncResultMethods` type + a slim `AsyncResult` alias)
- Modify: `packages/core/src/index.ts` (add `AsyncResultMethods` to the type re-export block)

**Interfaces:**

- Consumes: the `ResultMethods` export (Task 1) — the async method docs link `{@link ResultMethods.<name>}`.
- Produces: a public, doc-only type `AsyncResultMethods<T, E>` (`@category Methods`) rendered by TypeDoc; `AsyncResult<T, E>` becomes `Awaitable<Result<T, E>> & AsyncResultMethods<T, E>`. The `AsyncResult` value+type facade re-alias is unchanged.

- [ ] **Step 1: Establish the failing check — no `AsyncResultMethods` section today**

Run:

```bash
pnpm --filter unthrown build:docs >/dev/null 2>&1
grep -c '^### AsyncResultMethods' packages/core/docs/index.md
```

Expected: prints `0`.

- [ ] **Step 2: Replace the `AsyncResult` block with `AsyncResultMethods` + a slim alias**

In `packages/core/src/types.ts`, replace the entire current `AsyncResult` definition — the doc comment starting at line 390 (`/**\n * The asynchronous counterpart…`) through the closing `};` of its inline methods — with the following two declarations. The `AsyncResultMethods` methods keep the **exact signatures** from the current source; only their TSDoc is upgraded to link the sync counterpart and state the async delta.

```ts
/**
 * The async method surface every {@link AsyncResult} carries — the combinators
 * (`map`, `flatMap`, `mapErr`, `match`, `unwrap`, …) with their asynchronous
 * signatures, documented one per entry below. The async mirror of
 * {@link ResultMethods}: each entry links its synchronous counterpart and states
 * only the async delta.
 *
 * @remarks
 * Like {@link ResultMethods}, this type exists to **document** the surface — not
 * to be authored against; you obtain it by holding an `AsyncResult`. Its
 * combinator callbacks are **synchronous** (a raw `Promise` may never enter — see
 * the {@link AsyncResult} remarks); async work re-enters via {@link fromPromise}
 * and composes with `flatMap`. Systematic differences from the sync surface: the
 * binds return an `AsyncResult` (and additionally accept one), and the
 * eliminators return a `Promise`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 * @category Methods
 */
export type AsyncResultMethods<T, E> = {
  /**
   * Asynchronous {@link ResultMethods.map | map}: transforms the success value
   * with `f`. `f` is synchronous; a throw becomes a `Defect`.
   */
  map<U>(f: (value: T) => U): AsyncResult<U, E>;
  /**
   * Asynchronous {@link ResultMethods.flatMap | flatMap}. Unlike the sync form,
   * `f` may return a `Result` **or** an `AsyncResult` (never a raw `Promise`); a
   * throw becomes a `Defect`.
   */
  flatMap<U, E2>(
    f: (value: T) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<U, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.tap | tap}. `f` is synchronous; a throw
   * becomes a `Defect`.
   */
  tap(f: (value: T) => void): AsyncResult<T, E>;
  /**
   * Asynchronous {@link ResultMethods.flatTap | flatTap} — a failable tap that
   * keeps the original value. `f` may return a `Result` **or** an `AsyncResult`;
   * its `Ok` value is discarded, an `Err`/`Defect` short-circuits, and a throw
   * becomes a `Defect`.
   */
  flatTap<E2>(
    f: (value: T) => Result<unknown, E2> | AsyncResult<unknown, E2>,
  ): AsyncResult<T, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.bind | bind} (do-notation). `f` may return
   * a `Result` **or** an `AsyncResult`; its value is bound under `name` in the
   * accumulating scope.
   */
  bind<K extends string, U, E2>(
    name: K,
    f: (scope: T) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<Bound<T, K, U>, E | E2>;
  /**
   * Asynchronous {@link ResultMethods.let | let} (do-notation). `f` returns a
   * plain value, bound under `name`.
   */
  let<K extends string, U>(
    name: K,
    f: (scope: T) => U,
  ): AsyncResult<Bound<T, K, U>, E>;
  /** Asynchronous {@link ResultMethods.as | as}: replaces the value with `value`. */
  as<U>(value: U): AsyncResult<U, E>;

  /**
   * Asynchronous {@link ResultMethods.mapErr | mapErr}. `f` is synchronous; a
   * throw becomes a `Defect`.
   */
  mapErr<E2>(f: (error: E) => E2): AsyncResult<T, E2>;
  /**
   * Asynchronous {@link ResultMethods.orElse | orElse}. `f` may return a `Result`
   * or an `AsyncResult`.
   */
  orElse<U, E2>(
    f: (error: E) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<T | U, E2>;
  /**
   * Asynchronous {@link ResultMethods.recover | recover}. `f` is synchronous; a
   * throw becomes a `Defect`.
   */
  recover<U>(f: (error: E) => U): AsyncResult<T | U, never>;
  /**
   * Asynchronous {@link ResultMethods.tapErr | tapErr}. `f` is synchronous; a
   * throw becomes a `Defect`.
   */
  tapErr(f: (error: E) => void): AsyncResult<T, E>;
  /**
   * Asynchronous {@link ResultMethods.flatTapErr | flatTapErr} — the
   * error-channel mirror of `flatTap`. `f` may return a `Result` **or** an
   * `AsyncResult`; its `Ok` value is discarded, an `Err`/`Defect` from `f`
   * threads through, and a throw becomes a `Defect`.
   */
  flatTapErr<E2>(
    f: (error: E) => Result<unknown, E2> | AsyncResult<unknown, E2>,
  ): AsyncResult<T, E | E2>;

  /**
   * Asynchronous {@link ResultMethods.recoverDefect | recoverDefect}. `f` may
   * return a `Result` or an `AsyncResult`.
   */
  recoverDefect<U, E2>(
    f: (cause: unknown) => Result<U, E2> | AsyncResult<U, E2>,
  ): AsyncResult<T | U, E | E2>;
  /** Asynchronous {@link ResultMethods.tapDefect | tapDefect}. */
  tapDefect(f: (cause: unknown) => void): AsyncResult<T, E>;

  /**
   * Asynchronous {@link ResultMethods.match | match}. Handlers are synchronous;
   * resolves to a `Promise<R>`.
   */
  match<R>(cases: {
    ok: (value: T) => R;
    err: (error: E) => R;
    defect: (cause: unknown) => R;
  }): Promise<R>;
  /**
   * Asynchronous {@link ResultMethods.unwrap | unwrap}. The returned promise
   * rejects on `Err`/`Defect`.
   */
  unwrap(): Promise<T>;
  /** Asynchronous {@link ResultMethods.unwrapErr | unwrapErr}. */
  unwrapErr(): Promise<E>;
  /** Asynchronous {@link ResultMethods.unwrapOr | unwrapOr}. */
  unwrapOr(fallback: T): Promise<T>;
  /** Asynchronous {@link ResultMethods.unwrapOrElse | unwrapOrElse}. */
  unwrapOrElse(f: (error: E) => T): Promise<T>;
  /** Asynchronous {@link ResultMethods.getOrNull | getOrNull}. */
  getOrNull(): Promise<T | null>;
  /** Asynchronous {@link ResultMethods.getOrUndefined | getOrUndefined}. */
  getOrUndefined(): Promise<T | undefined>;
};

/**
 * The asynchronous counterpart of {@link Result}: an awaitable wrapper carrying
 * the {@link AsyncResultMethods} surface, collapsing to a `Result<T, E>` when
 * `await`-ed.
 *
 * @remarks
 * **Combinator callbacks are synchronous.** A raw `Promise` may never enter an
 * `AsyncResult` method — that would be an un-qualified async boundary, and its
 * rejection would silently become a `Defect`, skipping the triage that
 * {@link fromPromise} forces. To do further async work, re-enter through a
 * qualified boundary and compose it: `ar.flatMap((v) => fromPromise(work(v),
 * qualify))`. The eliminators (`unwrap`, …) return promises; the binds
 * (`flatMap`, `flatTap`, `orElse`, `recoverDefect`) additionally accept an
 * `AsyncResult`. Its combinators are documented one per entry on
 * {@link AsyncResultMethods}.
 *
 * To pattern-match an `AsyncResult`, `await` it first: `match(await ar)`.
 *
 * @typeParam T - the success value type.
 * @typeParam E - the modeled error type.
 */
export type AsyncResult<T, E> = Awaitable<Result<T, E>> &
  AsyncResultMethods<T, E>;
```

Everything after the old `};` (the `AsyncOkOf`/`AsyncErrOf` extractors etc.) is unchanged — `AsyncResult<infer T, unknown>` still resolves against the new definition.

- [ ] **Step 3: Export `AsyncResultMethods` from the barrel**

In `packages/core/src/index.ts`, add `AsyncResultMethods` to the `export type { … } from "./types.js"` block (which already contains `ResultMethods` from Task 1), keeping alphabetical order:

```ts
export type {
  AsyncErrOf,
  AsyncOkOf,
  AsyncResultMethods,
  Awaitable,
  DefectView,
  ErrOf,
  ErrView,
  OkOf,
  OkView,
  ResultMethods,
} from "./types.js";
```

- [ ] **Step 4: Verify it compiles and renders**

Run:

```bash
pnpm --filter unthrown typecheck
pnpm --filter unthrown build:docs 2>&1 | tee /tmp/td2.log
grep -c '^### AsyncResultMethods' packages/core/docs/index.md
grep -A200 '^### AsyncResultMethods' packages/core/docs/index.md | grep -Ec 'flatMap|mapErr|unwrap'
grep -Ei 'warning|error|unable to resolve' /tmp/td2.log || echo "typedoc clean"
```

Expected: `typecheck` passes (the mutually-recursive `AsyncResult`/`AsyncResultMethods` intersection resolves); `grep -c` prints `1`; the method grep prints `>= 3`; last prints `typedoc clean` (every `{@link ResultMethods.…}` resolves).

- [ ] **Step 5: Verify lint & knip**

Run:

```bash
pnpm lint && pnpm knip
```

Expected: pass. (`AsyncResultMethods` is a public barrel export, so knip does not flag it.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts
git commit -m "docs(core): render the AsyncResultMethods surface on the API reference"
```

---

## Task 3: Cross-link the union, async, and variant types to their method surfaces

**Files:**

- Modify: `packages/core/src/facade.ts` (the `Result` and `AsyncResult` type `@remarks`)
- Modify: `packages/core/src/types.ts` (the `OkView`/`ErrView`/`DefectView` doc comments)

**Interfaces:**

- Consumes: `ResultMethods` (Task 1) and `AsyncResultMethods` (Task 2).
- Produces: prose links only — no signature or structural changes.

- [ ] **Step 1: Point the `Result` facade doc at `ResultMethods`**

In `packages/core/src/facade.ts`, replace the `Result` type `@remarks` (the block beginning "A `Result` is a discriminated union, so its fluent combinators…") with:

```ts
 * @remarks
 * A `Result` is a discriminated union, so TypeDoc can't list its methods on this
 * alias. Its fluent combinators (`map`, `flatMap`, `match`, `unwrap`, …) are
 * documented one per entry on {@link ResultMethods} — the shared method surface
 * every variant carries. For "which one do I reach for?", see the
 * [Choosing a combinator](/guide/choosing-a-combinator) guide.
```

- [ ] **Step 2: Point the `AsyncResult` facade doc at `AsyncResultMethods`**

In `packages/core/src/facade.ts`, replace the `AsyncResult` type `@remarks` (the block beginning "`AsyncResult` shares `Result`'s fluent surface…") with:

```ts
 * @remarks
 * `AsyncResult` carries the async fluent surface; its combinators (`map`,
 * `flatMap`, `match`, `unwrap`, …) are documented one per entry — with their
 * async signatures — on {@link AsyncResultMethods}. For "which one do I reach
 * for?", see the [Choosing a combinator](/guide/choosing-a-combinator) guide.
```

- [ ] **Step 3: Mention `ResultMethods` on each variant**

In `packages/core/src/types.ts`, append one sentence to each of the three variant descriptions.

`OkView` — after "making `.value` reachable.":

```ts
 * what a successful `isOk` guard narrows to, making `.value` reachable. It also
 * carries the shared fluent surface ({@link ResultMethods}).
```

`ErrView` — after "exposing `.error`.":

```ts
 * This is what a successful `isErr` guard narrows to, exposing `.error`. It also
 * carries the shared fluent surface ({@link ResultMethods}).
```

`DefectView` — after "exposing\n \* `.cause`.":

```ts
 * `.cause`. It also carries the shared fluent surface ({@link ResultMethods}).
```

- [ ] **Step 4: Verify typedoc warning-free & gate**

Run:

```bash
pnpm --filter unthrown build:docs 2>&1 | grep -Ei 'warning|error|unable to resolve' || echo "typedoc clean"
pnpm --filter unthrown typecheck && pnpm lint
```

Expected: `typedoc clean`; typecheck and lint pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/facade.ts packages/core/src/types.ts
git commit -m "docs(core): link Result/AsyncResult and variants to their method surfaces"
```

---

## Task 4: Guide pointer, CLAUDE.md, and changeset

**Files:**

- Modify: `docs/guide/choosing-a-combinator.md` (add a pointer near the top)
- Modify: `CLAUDE.md` (the "method surface" bullet under "Public surface")
- Modify: `.changeset/document-combinator-surface.md` (rewrite to the final state)

**Interfaces:** none — documentation and release metadata.

- [ ] **Step 1: Add the API-reference pointer to the guide**

In `docs/guide/choosing-a-combinator.md`, insert this tip block immediately after the intro paragraph (after the line ending "[Result and AsyncResult](#result-and-asyncresult) at the bottom." on line 10, before `## By intent` on line 12):

```markdown
::: tip Full per-method reference
These tables are the _selection_ cheat-sheet — which combinator to reach for. For
each one's full signature and prose, see
[`ResultMethods`](/api/core/#resultmethods) (the surface every `Result` carries)
and [`AsyncResultMethods`](/api/core/#asyncresultmethods) (its async mirror) in
the API reference.
:::
```

- [ ] **Step 2: Reverse the "method surface" decision record in CLAUDE.md**

In `CLAUDE.md`, replace the entire `- method surface:` bullet (under "Public surface", beginning "the fluent combinators live on the **internal**") with:

```markdown
- method surface: the fluent combinators live on two exported, **documentation-only**
  object-literal types — `ResultMethods<T, E>` (the sync surface every `Result`
  variant intersects) and `AsyncResultMethods<T, E>` (its async mirror, with
  `AsyncResult`-returning / `Promise`-returning signatures) — both under a
  `Methods` category. They are not meant to be authored against (you get the
  surface by holding a `Result`/`AsyncResult`), but they **are** rendered so the
  API reference lists every combinator's signature and prose. `Result` /
  `AsyncResult` stay value+type companion pairs (value and type share one name,
  declared together in `facade.ts`), so their public type is a re-alias TypeDoc
  can't hang a method list on — that is _why_ the surface is factored out and
  documented on the separate `*Methods` types, which the `Result` / `AsyncResult`
  aliases and the `OkView`/`ErrView`/`DefectView` variants link to. The async
  method docs link back to their sync `ResultMethods` counterpart and state the
  async delta. The `docs/guide/choosing-a-combinator.md` guide remains the "by
  intent" selection cheat-sheet — one table covering both — and links to these API
  sections. The core `typedoc.json` sets an explicit `categoryOrder` (`Facade`,
  `Types`, `Methods`, `Constructors`, … then `Aggregate`, `Errors`) so the core
  surface leads the API reference instead of the default alphabetical order.
```

Also update the "Internal design" note that describes `ResultMethods` as `@internal` / in `intentionallyNotExported`: it and `AsyncResultMethods` are now exported documentation-only types; only the union/alias types (`Result`, `AsyncResult`) and pure-type helpers (`Props`, `AllOk`, `ResultRecord`, `AsyncResultRecord`, `Defect`) remain in `intentionallyNotExported`.

- [ ] **Step 3: Rewrite the changeset to the final state**

Replace the body of `.changeset/document-combinator-surface.md` with:

```markdown
---
"unthrown": patch
---

Document the fluent combinators on the generated API reference. The method
surface every `Result` / `AsyncResult` carries is now exported as two
**documentation-only** types — `ResultMethods` (sync) and `AsyncResultMethods`
(async, with the `AsyncResult`/`Promise`-returning signatures) — categorized
under `Methods`, so the reference lists every combinator's signature and prose.
The `Result` / `AsyncResult` aliases and the `OkView`/`ErrView`/`DefectView`
variants link to them, and the async method docs link to their sync counterparts.
The "Choosing a combinator" guide stays the "which one do I reach for?"
cheat-sheet and links to these API sections.
```

- [ ] **Step 4: Full gate**

Run:

```bash
pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build
pnpm --filter unthrown build:docs 2>&1 | grep -Ei 'warning|error|unable to resolve' || echo "typedoc clean"
```

Expected: every command passes; final line prints `typedoc clean`.

- [ ] **Step 5: Commit**

```bash
git add docs/guide/choosing-a-combinator.md CLAUDE.md .changeset/document-combinator-surface.md
git commit -m "docs: point the combinator guide and CLAUDE.md at the rendered method reference"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 = export/document `ResultMethods` (done); Task 2 = export/document `AsyncResultMethods` with upgraded async TSDoc (spec changes 4-5, revised from "un-indirect"); Task 3 = cross-links (spec change 6); Task 4 = guide + CLAUDE.md + changeset (spec changes 7-9).
- **Type consistency:** exported names are `ResultMethods` and `AsyncResultMethods`; async methods link via `{@link ResultMethods.<name>}` using the exact sync member names. `AsyncResult` = `Awaitable<Result<T,E>> & AsyncResultMethods<T,E>`; signatures copied verbatim from the pre-existing inline block — no drift.
- **Why not un-indirect (recorded):** value+type single-name merge requires both declarations local to one module; splitting value (facade) and type (types) gives `TS2300`. Verified by repro. The `AsyncResultMethods` factoring keeps the merge in `facade.ts` and renders the methods on a sibling type — symmetric with the sync side.
- **Generated-doc caveat:** `packages/core/docs/` is a build artifact (regenerated by `build:docs`); do not commit it. Only source, config, guide, CLAUDE.md, and the changeset are committed.
