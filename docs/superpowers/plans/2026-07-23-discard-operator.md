# `discard()` Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `discard()` combinator to `Result`/`AsyncResult` that drops the `Ok` value and collapses the success type to `void` — the named replacement for `.map(() => undefined)`.

**Architecture:** A callback-free success-channel method on the internal `Res` class (next to `as`), mirrored on `AsyncRes`. `Ok` → fresh frozen `Ok(undefined)` typed `void`; `Err`/`Defect` pass through via the existing `passThrough` helper. Public signatures live on the documentation-carrying `ResultMethods`/`AsyncResultMethods` types.

**Tech Stack:** TypeScript (strict), Vitest, type-level tests via `tsconfig.test-d.json`, changesets.

**Spec:** `docs/superpowers/specs/2026-07-23-discard-operator-design.md`

## Global Constraints

- Core has **zero runtime dependencies** — add none.
- Core coverage thresholds are 100% line/function — every runtime branch needs a test.
- `discard` is **not** an alias of `as`; both stay. No `discardErr` mirror (YAGNI).
- No new exports — `index.ts` is untouched; `discard` is a method on the existing surfaces.
- Conventional commits (commitlint enforces); lefthook runs on commit.
- Gate before finishing: `pnpm format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build` all green from the repo root.
- All commands below run from the repo root: `/Users/frx29150/Projects/unthrown`.

---

### Task 1: Sync `discard` on `Result`

**Files:**

- Modify: `packages/core/src/types.ts` (after the `as` declaration, ~line 163)
- Modify: `packages/core/src/core.ts` (after the `as` implementation, ~line 150)
- Test: `packages/core/src/result.spec.ts` (after the `Result.as` describe, ~line 163)
- Test: `packages/core/src/invariants.spec.ts` (the defect pass-through sweep, ~line 47)
- Test: `packages/core/src/types.test-d.ts` (combinators section, after the `recoverErr` assertion ~line 150)

**Interfaces:**

- Consumes: existing internals `okRes`, `passThrough` in `core.ts`; test helpers `boom`, `defectOf` in `result.spec.ts`; `declare const r1: Result<number, "e1">` in `types.test-d.ts`.
- Produces: `ResultMethods.discard(): Result<void, E>` — Task 2's async mirror links to its TSDoc; Task 3's guide row documents it.

- [ ] **Step 1: Write the failing runtime tests**

In `packages/core/src/result.spec.ts`, insert after the closing `});` of the `describe("Result.as", …)` block (~line 163):

```ts
describe("Result.discard", () => {
  it("drops the Ok value", () => {
    expect(Ok(1).discard().get()).toBeUndefined();
  });

  it("passes Err and Defect through", () => {
    const r = Err("e").discard();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("e");
    expect(defectOf(boom).discard().isDefect()).toBe(true);
  });
});
```

In `packages/core/src/invariants.spec.ts`, in the `passesThrough` array of the "success/error combinators pass a Defect through" test, add one line directly after `defectOf(boom).as(1),`:

```ts
      defectOf(boom).discard(),
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter unthrown test result.spec.ts invariants.spec.ts`
Expected: FAIL — `TypeError: Ok(...).discard is not a function` (and the invariants sweep failing the same way). A compile error from vitest's transform is also an acceptable failure shape.

- [ ] **Step 3: Add the public type declaration**

In `packages/core/src/types.ts`, insert directly after the `as<U>(value: U): Result<U, E>;` member of `ResultMethods` (~line 163):

```ts
  /**
   * Drop the success value, collapsing the success type to `void`.
   *
   * The named form of `map(() => undefined)`. Runs only on `Ok` (the value is
   * replaced with `undefined`); `Err` and `Defect` pass through. Unlike
   * `as(undefined)` — which produces `Result<undefined, E>` — the success type
   * is `void`: the value's story ends here.
   */
  discard(): Result<void, E>;
```

- [ ] **Step 4: Add the implementation**

In `packages/core/src/core.ts`, insert directly after the `as` method body on `Res` (~line 150):

```ts
  discard(this: Result<T, E>): Result<void, E> {
    if (this.tag !== "Ok") return passThrough(this);
    return okRes<void, E>(undefined);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter unthrown test result.spec.ts invariants.spec.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Add the type-level assertion**

In `packages/core/src/types.test-d.ts`, in the combinators section after the `recoverErr` assertion (~line 150), add:

```ts
// discard collapses the success type to `void` (not `undefined`)
const discarded = r1.discard();
type _discarded = Expect<Equal<typeof discarded, Result<void, "e1">>>;
```

- [ ] **Step 7: Typecheck (includes the test-d config)**

Run: `pnpm --filter unthrown typecheck`
Expected: exit 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/core.ts packages/core/src/result.spec.ts packages/core/src/invariants.spec.ts packages/core/src/types.test-d.ts
git commit -m "feat(core): add discard() — drop the Ok value, success type void"
```

---

### Task 2: Async `discard` on `AsyncResult`

**Files:**

- Modify: `packages/core/src/types.ts` (after the async `as` declaration, ~line 623)
- Modify: `packages/core/src/core.ts` (`AsyncRes`, after its `as` method ~line 594)
- Test: `packages/core/src/async-result.spec.ts` (after the `as` test, ~line 139)
- Test: `packages/core/src/types.test-d.ts` (next to the sync `discard` assertion from Task 1)

**Interfaces:**

- Consumes: Task 1's `ResultMethods.discard` TSDoc (the `{@link}` target) and the same `okRes`/`passThrough` internals; test helpers `asyncOk`/`asyncErr`/`asyncDefect` in `async-result.spec.ts`; `declare const ar: AsyncResult<number, "e">` in `types.test-d.ts`.
- Produces: `AsyncResultMethods.discard(): AsyncResult<void, E>`.

- [ ] **Step 1: Write the failing test**

In `packages/core/src/async-result.spec.ts`, insert after the closing `});` of the `it("as replaces the Ok value, …")` test (~line 139), inside the same `describe`:

```ts
it("discard drops the Ok value, and passes Err/Defect through", async () => {
  expect((await asyncOk(1).discard()).get()).toBeUndefined();
  const r = await asyncErr("e").discard();
  expect(r.isErr()).toBe(true);
  if (r.isErr()) expect(r.error).toBe("e");
  expect((await asyncDefect().discard()).isDefect()).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter unthrown test async-result.spec.ts`
Expected: FAIL — `TypeError: … .discard is not a function`.

- [ ] **Step 3: Add the public type declaration**

In `packages/core/src/types.ts`, insert directly after the `as<U>(value: U): AsyncResult<U, E>;` member of `AsyncResultMethods` (~line 623):

```ts
  /** Asynchronous {@link ResultMethods.discard | discard}: drops the value, collapsing the success type to `void`. */
  discard(): AsyncResult<void, E>;
```

- [ ] **Step 4: Add the implementation**

In `packages/core/src/core.ts`, insert directly after the `as` method body on `AsyncRes` (~line 594):

```ts
  discard(): AsyncResult<void, E> {
    return new AsyncRes<void, E>(
      this.promise.then((r) => (r.tag === "Ok" ? okRes<void, E>(undefined) : passThrough(r))),
    );
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter unthrown test async-result.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add the type-level assertion**

In `packages/core/src/types.test-d.ts`, directly after the sync `_discarded` assertion added in Task 1:

```ts
const discardedAsync = ar.discard();
type _discardedAsync = Expect<
  Equal<typeof discardedAsync, AsyncResult<void, "e">>
>;
```

Note: `ar` is declared later in the file (~line 128) than `r1` (~line 74). If the two `discard` assertions end up before `ar`'s declaration, place the async pair after the `declare const ar` block instead — `const` declarations are not hoisted for value use.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter unthrown typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/core.ts packages/core/src/async-result.spec.ts packages/core/src/types.test-d.ts
git commit -m "feat(core): mirror discard() on AsyncResult"
```

---

### Task 3: Docs, changeset, full gate

**Files:**

- Modify: `docs/guide/choosing-a-combinator.md` (the combinator table, ~line 36)
- Modify: `CLAUDE.md` (the "success:" line of Public surface, ~line 122)
- Create: `.changeset/discard-operator.md`

**Interfaces:**

- Consumes: the `discard(): Result<void, E>` / `AsyncResult<void, E>` signatures from Tasks 1–2.
- Produces: nothing downstream — this is the terminal task.

- [ ] **Step 1: Add the guide row**

In `docs/guide/choosing-a-combinator.md`, insert directly after the `as` row (~line 36):

```markdown
| drop the value (success type becomes `void`) | `discard` | `()` → `Result<void, E>` | Ok |
```

Then check the table's pipes still align; if the new row's column widths differ, let `pnpm format` fix it in Step 4.

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`, the Public surface success line currently ends with `` `as` `` (~line 122). Change:

```
  error), `as`
```

to:

```
  error), `as`, `discard` (drop the value — the success type collapses to
  `void`; the named form of `map(() => undefined)`, distinct from `as`)
```

- [ ] **Step 3: Write the changeset**

Create `.changeset/discard-operator.md`:

```markdown
---
"unthrown": minor
---

Add `discard()` to `Result` and `AsyncResult` — drops the `Ok` value and
collapses the success type to `void`. The named form of `map(() => undefined)`:
unlike `as(undefined)`, which produces `Result<undefined, E>`, `discard()`
produces `Result<void, E>`. `Err` and `Defect` pass through untouched.
```

- [ ] **Step 4: Run the full gate**

Run, from the repo root:

```bash
pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build
```

Expected: all six green. If `pnpm format --check` flags the guide table, run `pnpm format` and re-run the gate.

Also verify the TSDoc renders warning-free: `pnpm --filter unthrown build:docs`
Expected: exit 0, no typedoc warnings.

- [ ] **Step 5: Commit**

```bash
git add docs/guide/choosing-a-combinator.md CLAUDE.md .changeset/discard-operator.md
git commit -m "docs: document discard(); add changeset"
```
