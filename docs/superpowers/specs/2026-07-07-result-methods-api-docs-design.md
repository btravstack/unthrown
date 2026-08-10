# Design: surface the fluent combinator methods on the API reference

**Date:** 2026-07-07
**Status:** approved (design)
**Package:** `unthrown` (`packages/core`)

## Problem

The generated API reference (`/api/core/`) documents the constructors, interop,
guards, aggregates, and tagged-error helpers, but **the fluent combinators
themselves — `map`, `flatMap`, `mapErr`, `match`, `unwrap`, etc. — appear
nowhere.** A visitor who lands on the `Result` or `AsyncResult` page finds a bare
type-alias line, a `@remarks` paragraph, and a link off to the "Choosing a
combinator" guide — but no per-method signature or prose on the reference itself.

### Root cause

The combinator prose is fully written; it just has no rendered home. Three
distinct facts combine to suppress it:

1. `ResultMethods<T, E>` (the object-literal type every variant intersects) is
   tagged `@internal`, listed in `typedoc.json`'s `intentionallyNotExported`, and
   **not re-exported from `index.ts`**. TypeDoc therefore neither documents it nor
   links to it.
2. `OkView`/`ErrView`/`DefectView` render as `ResultMethods<T, E> & object`.
   TypeDoc expands only the inline `object` half (`tag`, `value`/`error`/`cause`)
   and prints `ResultMethods` as an opaque, unlinked name — because it is not a
   documented symbol.
3. The public `Result`/`AsyncResult` come from `facade.ts` as re-aliases
   (`type Result<T, E> = ResultType<T, E>`). A type alias pointing at another
   **named** type is printed verbatim and never structurally expanded, so even
   `AsyncResult`'s inline methods (which _would_ otherwise render, being an inline
   object literal) are hidden behind the indirection.

By contrast, `Awaitable` — an exported inline object literal — renders its
`then()` method fully. That confirms the mechanism: TypeDoc renders inline
object-literal members of an **exported, documented** type, and only those.

## Goal

Surface real per-method documentation — each combinator's signature and its
existing TSDoc prose — on the API reference for **both** `Result` and
`AsyncResult`, so each type's page lists its own combinators, while keeping the
"Choosing a combinator" guide as the complementary "which one do I reach for?"
cheat-sheet.

> **Correction (2026-07-07, during implementation):** "un-indirecting
> `AsyncResult`" (below) proved **impossible** — a value re-export from one module
> and a same-name type re-export from another give `TS2300: Duplicate identifier`
> (the value+type companion merge must be local to one module). The async surface
> is instead documented by a second exported doc-only type,
> `AsyncResultMethods<T, E>`, exactly symmetric with `ResultMethods` — its own
> rendered block with async signatures, which `AsyncResult` links to. The plan
> (`docs/superpowers/plans/2026-07-07-result-methods-api-docs.md`) reflects this.

## Approach (chosen: hybrid — `ResultMethods` for the sync side, un-indirected

`AsyncResult` for the async side)

The sync and async surfaces are documented by two different mechanisms because
their **shapes** differ, and TypeDoc's rendering follows shape:

- **`Result` is a discriminated union** (`OkView | ErrView | DefectView`).
  TypeDoc cannot hang a method list off a union alias, so its combinators must be
  documented on the factored-out `ResultMethods<T, E>` object type. The fix is to
  make `ResultMethods` an **exported, documented** type and link the union/variant
  types to it.
- **`AsyncResult` is a single inline object-literal type** whose methods are
  already spelled out (`types.ts:404–478`). TypeDoc _will_ render an inline
  object literal's members — the only thing hiding them is the facade re-alias
  layer. The fix is to **un-indirect** the public `AsyncResult` type so TypeDoc
  expands its structure and lists its methods on its own page, with their genuine
  async signatures (returns `AsyncResult<U, E>`; binds also accept an
  `AsyncResult`; eliminators return a `Promise`).

The two method lists are not pure duplicates — they are the sync and async
surfaces, which differ in return/callback types. The cost is two lists to keep in
sync; accepted in exchange for each type documenting its own combinators on its
own page. Shared semantics are not re-litigated: each async method's TSDoc links
to its `ResultMethods` counterpart for the behavioural contract and states only
the async-specific delta.

### Surface stance: doc-only, discouraged for authoring

`ResultMethods` is exported **so the reference can render it**, not as an
invitation to implement or construct it. Its doc comment gains an explicit
`@remarks` note: this type documents the shared fluent surface every `Result`
carries and powers narrowing — you obtain it by holding a `Result`/`AsyncResult`,
never by authoring your own `Result`-like against it. The intent is unchanged from
today; only its **visibility** changes.

### Concrete changes

1. **`packages/core/src/types.ts` — `ResultMethods`:**
   - Remove the `@internal` tag.
   - Add `@category Methods`.
   - Add the "doc-only / do-not-implement" `@remarks` note described above.
   - Its per-method TSDoc is already complete and stays as-is.

2. **`packages/core/src/index.ts`:** add `ResultMethods` to the
   `export type { … } from "./types.js"` block.

3. **`packages/core/typedoc.json`:**
   - Remove `"ResultMethods"` from `intentionallyNotExported`.
   - Insert `"Methods"` into `categoryOrder`, immediately after `"Types"`, so the
     method reference sits with the core type surface rather than trailing
     alphabetically.

4. **Un-indirect the public `AsyncResult` type** so TypeDoc renders its inline
   methods instead of the opaque re-alias. Today `facade.ts` declares both the
   companion value (`const AsyncResult`) and a type re-alias
   (`type AsyncResult<T,E> = AsyncResultType<T,E>`) so one `export { AsyncResult }`
   carries both. Instead, export the **value** from `facade.ts` and the **type**
   from `types.ts` (the inline object literal) — `index.ts` merges them under one
   name via `export { AsyncResult } from "./facade.js"` (value) +
   `export type { AsyncResult } from "./types.js"` (structure). Remove the
   `type AsyncResult` re-alias from `facade.ts` and drop `"AsyncResult"` from
   `intentionallyNotExported`. (`Result` keeps its facade re-alias: it is a union
   and renders the same either way, so there is nothing to un-indirect.) The exact
   export wiring is validated by `typecheck` in the plan.

5. **Upgrade `AsyncResult`'s per-method TSDoc** (`types.ts:404–478`) from the
   current terse one-liners ("Asynchronous `map`.") to proper docs: each links to
   its `{@link ResultMethods}` counterpart for the shared behavioural contract and
   states the async-specific delta (return type, `Promise`-returning eliminator,
   or binds accepting an `AsyncResult`). No behaviour or signature changes.

6. **Cross-links (prose only, no signature changes):**
   - `Result` (`facade.ts`) `@remarks`: replace "aren't listed as a standalone
     type here" with a pointer to `{@link ResultMethods}` for the full per-method
     reference, keeping the guide link for "which one do I pick?".
   - `AsyncResult` (`types.ts`) `@remarks`: note that its methods are listed on
     this page and mirror `{@link ResultMethods}` with the async deltas.
   - `OkView`/`ErrView`/`DefectView` doc comments: mention that the fluent surface
     they carry is `{@link ResultMethods}` (the reference now renders as a link
     from their `ResultMethods<T,E> & object` type).

7. **`docs/guide/choosing-a-combinator.md`:** add one line near the top pointing
   to the `ResultMethods` / `AsyncResult` API sections for full per-method
   signatures and prose — framing the guide as the selection cheat-sheet and the
   API reference as the detailed reference. (The guide's tables stay; they are the
   "by intent" view.)

8. **`CLAUDE.md`:** update the "method surface" bullet and the internal-design
   notes to reflect the reversed decision — `ResultMethods` is now an exported,
   **documentation-only** type rendered under a "Methods" category, and the public
   `AsyncResult` type is un-indirected so its own methods render — replacing the
   previous "deliberately not a public/exported type / documented only by the
   guide" wording. Keep the rationale trail (why it was hidden, why it is now
   surfaced) so the file records what _is_.

9. **Changeset:** a `patch`/`docs`-level changeset noting that `ResultMethods` is
   now exported (documentation-only) and the combinators are documented on the API
   reference. Confirm the exact bump against repo convention when writing it.

## Out of scope

- Hand-authored Markdown method pages — would duplicate the source TSDoc and
  drift; the docs stay generated from TSDoc.
- Any change to runtime behaviour, method signatures, or the `Result`/
  `AsyncResult` public types beyond doc comments and the two export changes
  (exporting `ResultMethods`; re-wiring the `AsyncResult` value/type exports).

## Verification

- `pnpm --filter unthrown build:docs` is typedoc-warning-free **and** the
  generated `packages/core/docs/index.md` now contains (a) a `ResultMethods`
  section listing every combinator (`map`, `flatMap`, `mapErr`, `match`,
  `unwrap`, …) with its signature and prose, linked from `OkView`/`ErrView`/
  `DefectView` and `Result`; and (b) an `AsyncResult` section whose own methods
  (`map`, `flatMap`, …) render with their async signatures.
- Full gate stays green: `pnpm format --check`, `pnpm lint`, `pnpm typecheck`
  (incl. `types.test-d.ts`), `pnpm knip` (the new public export must not trip
  knip), `pnpm test`, `pnpm build`.
