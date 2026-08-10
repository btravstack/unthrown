# No-arg `Ok()` / `OkAsync()` Overload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add no-arg overloads `Ok(): Result<void, never>` and `OkAsync(): AsyncResult<void, never>` so a `void` success is constructed without `Ok(undefined)`.

**Architecture:** Pure overload addition in `packages/core/src/constructors.ts` — the implementation signatures take `value?: T` with a documented `value as T` cast; runtime is unchanged for 1-arg callers. The companions (`Result.Ok`, `AsyncResult.Ok`) alias these functions in `facade.ts`, so they inherit the overload with no facade change.

**Tech Stack:** TypeScript (strict), Vitest, type-level tests via `tsconfig.test-d.json`, changesets.

**Spec:** `docs/superpowers/specs/2026-07-23-ok-void-overload-design.md`

## Global Constraints

- Branch from **`main`** (this work is independent of `feat/discard-operator`; the shared-file overlap is only CLAUDE.md/changesets).
- Core has **zero runtime dependencies** — add none.
- Core coverage thresholds are 100% line/function.
- `Err`/`ErrAsync` get **no** overload (YAGNI). No `OkVoid`-style new exports; `index.ts` untouched.
- Conventional commits (commitlint enforces); lefthook runs on commit.
- Gate before finishing: `pnpm format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build` all green from the repo root; `pnpm --filter unthrown build:docs` warning-free.
- All commands run from the repo root: `/Users/frx29150/Projects/unthrown`.

---

### Task 1: The overloads, runtime tests, type tests

**Files:**

- Modify: `packages/core/src/constructors.ts` (the `Ok` block ~lines 6–24; the `OkAsync` block ~lines 50–74)
- Test: `packages/core/src/result.spec.ts` (insert before `describe("Result.map", …)` at ~line 11)
- Test: `packages/core/src/async-result.spec.ts` (insert before `describe("AsyncResult is awaitable and never rejects", …)` at ~line 15)
- Test: `packages/core/src/types.test-d.ts` (constructors section, after the `_errAsync` assertion ~line 57)

**Interfaces:**

- Consumes: existing `okRes` (already imported in `constructors.ts`); `Ok`/`OkAsync` imports in the spec files (add `OkAsync` to `async-result.spec.ts`'s import from `./index.js` if not present).
- Produces: `Ok(): Result<void, never>` and `OkAsync(): AsyncResult<void, never>` overloads — Task 2 documents them.

- [ ] **Step 1: Write the failing runtime tests**

In `packages/core/src/result.spec.ts`, insert directly before `describe("Result.map", …)` (~line 11):

```ts
describe("Ok() with no argument", () => {
  it("constructs a void success", () => {
    expect(Ok().isOk()).toBe(true);
    expect(Ok().get()).toBeUndefined();
  });
});
```

In `packages/core/src/async-result.spec.ts`, insert directly before `describe("AsyncResult is awaitable and never rejects", …)` (~line 15), adding `OkAsync` to the file's import from the core entry if it isn't already imported:

```ts
describe("OkAsync() with no argument", () => {
  it("constructs a void success", async () => {
    const r = await OkAsync();
    expect(r.isOk()).toBe(true);
    expect(r.get()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter unthrown typecheck`
Expected: FAIL — `Expected 1 arguments, but got 0` at the new `Ok()` / `OkAsync()` call sites. (This feature's RED is a compile error, not a runtime failure: the current 1-arg signatures reject the no-arg calls. `pnpm --filter unthrown test result.spec.ts async-result.spec.ts` may still pass at runtime since vitest strips types — the typecheck failure is the authoritative RED.)

- [ ] **Step 3: Implement the overloads**

In `packages/core/src/constructors.ts`, replace the `Ok` declaration + implementation (currently `export function Ok<T>(value: T): Result<T, never> { return okRes(value); }`) with:

```ts
export function Ok(): Result<void, never>;
export function Ok<T>(value: T): Result<T, never>;
export function Ok<T>(value?: T): Result<T, never> {
  // `value as T`: the only argument-less path in is the no-arg overload, which
  // fixes the result type to `void` — exactly what the omitted `undefined`
  // inhabits. Invisible to callers.
  return okRes(value as T);
}
```

And replace the `OkAsync` declaration + implementation (currently `export function OkAsync<T>(value: T): AsyncResult<T, never> { return Ok(value).toAsync(); }`) with:

```ts
export function OkAsync(): AsyncResult<void, never>;
export function OkAsync<T>(value: T): AsyncResult<T, never>;
export function OkAsync<T>(value?: T): AsyncResult<T, never> {
  // Same deliberate cast as `Ok` above: argument-less means the no-arg
  // overload already fixed the type to `void`.
  return Ok(value as T).toAsync();
}
```

Update both TSDoc blocks (keep everything currently there; adjust/add only these parts):

For `Ok` — after the summary line `Construct a successful {@link Result}.` add a paragraph, change the `@param` line, and extend the `@example`:

````ts
/**
 * Construct a successful {@link Result}.
 *
 * With no argument, constructs a `void` success — `Result<void, never>` —
 * sparing you `Ok(undefined)` and typing the success channel `void`, not
 * `undefined`.
 *
 * @typeParam T - the success value type.
 * @param value - the success value to wrap; omit it for a `void` success.
 *
 * @example
 * ```ts
 * import { Ok } from "unthrown";
 *
 * Ok(2).map((n) => n + 1); // => Ok(3)
 * Ok(42).get(); // => 42
 * Ok(); // => a void success: Result<void, never>
 * ```
 *
 * @category Constructors
 */
````

For `OkAsync` — keep its existing prose; change its `@param` line to `@param value - the success value to wrap; omit it for a \`void\` success.`and add this line at the end of the existing`@example` code fence (before the closing backticks):

```ts
 * OkAsync(); // => a void success: AsyncResult<void, never>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter unthrown test result.spec.ts async-result.spec.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 5: Add the type-level assertions**

In `packages/core/src/types.test-d.ts`, insert directly after the `_errAsync` assertion (~line 57):

```ts
// no-arg overloads construct a `void` success (not `undefined`); the existing
// _ok/_okAsync assertions above pin that 1-arg inference is unchanged
const okVoidV = Ok();
type _okVoid = Expect<Equal<typeof okVoidV, Result<void, never>>>;
const okAsyncVoidV = OkAsync();
type _okAsyncVoid = Expect<
  Equal<typeof okAsyncVoidV, AsyncResult<void, never>>
>;
```

- [ ] **Step 6: Typecheck (includes the test-d config)**

Run: `pnpm --filter unthrown typecheck`
Expected: exit 0, no errors — this is also the GREEN for Step 2's compile-error RED.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/constructors.ts packages/core/src/result.spec.ts packages/core/src/async-result.spec.ts packages/core/src/types.test-d.ts
git commit -m "feat(core): no-arg Ok()/OkAsync() overloads for void successes"
```

---

### Task 2: Docs, changeset, full gate

**Files:**

- Modify: `CLAUDE.md` (the "constructors:" bullet in Public surface, ~line 165)
- Create: `.changeset/ok-void-overload.md`
- Check (likely no-op): `docs/guide/**`, `README.md`, `packages/*/README.md` for `Ok(undefined)` occurrences

**Interfaces:**

- Consumes: the `Ok(): Result<void, never>` / `OkAsync(): AsyncResult<void, never>` overloads from Task 1.
- Produces: nothing downstream — terminal task.

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, the constructors bullet begins (~line 165):

```
- constructors: `Ok`, `Err` (there is **no** `Defect` constructor — a defect-state
```

Change that opening to:

```
- constructors: `Ok` (a no-arg overload — `Ok()` — constructs a `void` success,
  `Result<void, never>`, sparing `Ok(undefined)`; `OkAsync()` mirrors it),
  `Err` (there is **no** `Defect` constructor — a defect-state
```

Leave the rest of the bullet untouched.

- [ ] **Step 2: Sweep the docs for `Ok(undefined)`**

Run: `grep -rn "Ok(undefined)\|OkAsync(undefined)" docs/guide README.md packages/*/README.md docs/index.md 2>/dev/null || echo "no occurrences"`
Expected: `no occurrences` (verified at planning time). If any appear, replace each with the no-arg form and include those files in the commit.

- [ ] **Step 3: Write the changeset**

Create `.changeset/ok-void-overload.md`:

```markdown
---
"unthrown": minor
---

Add no-arg overloads `Ok()` and `OkAsync()` — construct a `void` success
(`Result<void, never>` / `AsyncResult<void, never>`) without writing
`Ok(undefined)`, and with the success channel typed `void`, not `undefined`.
The 1-arg forms are unchanged. The companions pick the overload up unchanged
(`Result.Ok()` / `AsyncResult.Ok()`).
```

- [ ] **Step 4: Run the full gate**

```bash
pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build
```

Expected: all six green. Then: `pnpm --filter unthrown build:docs`
Expected: exit 0, no typedoc warnings.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .changeset/ok-void-overload.md
git commit -m "docs: document no-arg Ok()/OkAsync(); add changeset"
```

(Include any Step-2 sweep files in the `git add` if the grep found occurrences.)
