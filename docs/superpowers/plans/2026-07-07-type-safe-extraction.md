# Type-Safe Value Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `unwrap()` / `unwrapErr()` safe by construction — they only compile when the opposite channel is provably empty (`unwrap` needs `E = never`; `unwrapErr` needs `T = never`), turning "unwrap a fallible Result" from a runtime `UnwrapError` into a compile error.

**Architecture:** Type-only change to the two throwing eliminators on both method surfaces (`ResultMethods`, `AsyncResultMethods`) via a `this:` parameter. The runtime in `core.ts` is **unchanged**; `UnwrapError`'s wrong-variant branch stays as a defensive guard, now unreachable through well-typed code. The one real internal consumer (`AsyncRes`'s `r.unwrap()` delegation) gets a sound cast. Everything else is migration: in-repo tests move to matchers / narrowing guards, docs examples update, and the invariant record is reworded.

**Tech Stack:** TypeScript (strict, NodeNext ESM, `.js` imports), Vitest (+ v8 coverage), TypeDoc→VitePress, changesets. Verified TS mechanics: the `this`-gate rejects a fallible receiver and accepts the `never`-channel form on both `Result` and `AsyncResult`, and `AsyncRes implements AsyncResult` survives the gated `this` (a `this`-less class method satisfies it).

## Global Constraints

- Core package has **zero runtime dependencies** — add none.
- oxlint binding: no `interface` (use `type`), no `any` (use `unknown`); genuine exceptions carry a targeted `oxlint-disable` with a reason.
- TypeScript `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`; ESM, `.js` relative imports.
- Conventional commits (commitlint + lefthook on commit).
- Full gate must be green at each task boundary: `pnpm format --check`, `pnpm lint`, `pnpm typecheck` (incl. `test-d`), `pnpm knip`, `pnpm test`, `pnpm build`; `pnpm --filter unthrown build:docs` typedoc-warning-free.
- `packages/core/docs/` and `docs/.vitepress/dist/` are generated artifacts — never edit or commit them.
- One concept = one name.
- **This is a breaking change → a `major` changeset (Task 4).**

> **Scope note (elevated from the spec's follow-up):** the spec parked a `toBeErrWith` vitest matcher as out-of-scope, but the migration's most common shape is asserting a _plain_ error value (`expect(r.unwrapErr()).toBe(x)`), which the matcher surface can't express without it. Since the design's core decision is "use matchers instead of unwrap", `toBeErrWith` is required to make that story hold, so it is **Task 1** here. If the reviewer prefers to keep it out, the fallback is the two-line `expect(r).toBeErr(); if (r.isErr()) expect(r.error)…` guard form everywhere.

---

## File Structure

- `packages/vitest/src/index.ts` — new `toBeErrWith` matcher (mirrors `toBeOkWith`), registration, export, type augmentation.
- `packages/vitest/src/index.spec.ts` — `toBeErrWith` tests.
- `packages/core/src/types.ts` — the 4 gated signatures (`ResultMethods` + `AsyncResultMethods`) and their `@throws` TSDoc.
- `packages/core/src/core.ts` — `AsyncRes.unwrap`/`unwrapErr` internal-delegation casts; `UnwrapError` TSDoc note (defensive/unreachable).
- `packages/core/src/types.test-d.ts` — `@ts-expect-error` gate guards + positive `never`-channel cases.
- Core specs (`result`, `invariants`, `async-result`, `aggregate`, `interop`, `do`, `facade`, `constructors`) + `@unthrown/standard-schema` spec — migrate fallible `unwrap`/`unwrapErr` call sites; rewrite the eliminator-behavior tests to the gated semantics.
- Docs (`docs/guide/*`, root + per-package READMEs) + core-source `@example` TSDoc — update snippets that unwrap a fallible result.
- `CLAUDE.md` — reword the "unwrap is asymmetric" invariant + the eliminator entry in Public surface.
- `.changeset/*.md` — one `major` changeset.

---

## Task 1: Add the `toBeErrWith` matcher to `@unthrown/vitest`

**Files:**

- Modify: `packages/vitest/src/index.ts`
- Test: `packages/vitest/src/index.spec.ts`

**Interfaces:**

- Produces: `toBeErrWith(value: unknown)` — passes when the result is an `Err` whose `error` deep-equals `value` (exact for a plain object, partial for an asymmetric matcher), mirroring `toBeOkWith`. Task 2's migration uses it.

- [ ] **Step 1: Write the failing test**

In `packages/vitest/src/index.spec.ts`, inside the `describe("toBeErr / toBeErrTagged", …)` block, add:

```ts
it("toBeErrWith compares the error value deeply", () => {
  expect(Err("boom")).toBeErrWith("boom");
  expect(Err({ code: 404 })).toBeErrWith({ code: 404 });
  expect(Err("boom")).not.toBeErrWith("other");
  expect(Ok(1)).not.toBeErrWith(1);
  expect(Err({ code: 404, detail: "x" })).toBeErrWith(
    expect.objectContaining({ code: 404 }),
  );
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @unthrown/vitest exec vitest run -t "toBeErrWith"`
Expected: FAIL — `toBeErrWith is not a function` (matcher not registered) or a type error.

- [ ] **Step 3: Implement the matcher**

In `packages/vitest/src/index.ts`, add `toBeErrWith` right after `toBeErr` (mirror `toBeOkWith` at lines ~83-98, but on the error channel):

```ts
function toBeErrWith(
  this: MatcherState,
  received: unknown,
  expected: unknown,
): MatcherResult {
  const { stringify } = this.utils;
  const { equals } = this;
  return settle(received, stringify, (result) => {
    const pass = isErr(result) && equals(result.error, expected);
    return {
      pass,
      message: () =>
        pass
          ? `expected result not to be Err(${stringify(expected)})`
          : `expected result to be Err(${stringify(expected)}), but got ${render(result, stringify)}`,
    };
  });
}
```

Register it (extend the `expect.extend({ … })` call) and export it (extend the `export { … }` list), keeping both alphabetized:

```ts
expect.extend({
  toBeDefect,
  toBeErr,
  toBeErrTagged,
  toBeErrWith,
  toBeOk,
  toBeOkWith,
});
export { toBeDefect, toBeErr, toBeErrTagged, toBeErrWith, toBeOk, toBeOkWith };
```

Add it to the `UnthrownMatchers` type (next to `toBeErrTagged`):

```ts
toBeErrWith: (value: unknown) => R;
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @unthrown/vitest exec vitest run -t "toBeErrWith"`
Expected: PASS.

- [ ] **Step 5: Verify the package gate (coverage stays at threshold)**

Run: `pnpm --filter @unthrown/vitest exec vitest run --coverage && pnpm --filter @unthrown/vitest typecheck`
Expected: all pass; coverage thresholds (statements/lines/functions 100, branches 95) still met.

- [ ] **Step 6: Commit**

```bash
git add packages/vitest/src/index.ts packages/vitest/src/index.spec.ts
git commit -m "feat(vitest): add toBeErrWith matcher for asserting a plain error value"
```

---

## Task 2: Gate `unwrap` / `unwrapErr` and migrate all call sites

This is the atomic breaking change: the type gate and the call-site migration must land together to keep `typecheck` green at the task boundary (a fallible `.unwrap()` stops compiling the moment the gate lands). Work compiler-driven — the type change surfaces every site to fix.

**Files:**

- Modify: `packages/core/src/types.ts` (4 signatures), `packages/core/src/core.ts` (`AsyncRes` casts)
- Modify: `packages/core/src/types.test-d.ts` (gate guards)
- Modify: core specs + `@unthrown/standard-schema` spec (migration + behavior-test rewrites)

**Interfaces:**

- Consumes: `toBeErrWith` (Task 1).
- Produces: `unwrap(this: Result<T, never>): T`, `unwrapErr(this: Result<never, E>): E`, and their async twins on `AsyncResult<T, never>` / `AsyncResult<never, E>`.

- [ ] **Step 1: Add the `test-d` gate guards (the failing type-test)**

In `packages/core/src/types.test-d.ts`, add (the `Result` / `AsyncResult` / `Ok` / `Err` imports already exist):

```ts
// --- unwrap / unwrapErr are gated on an empty opposite channel ---------------
declare const rNever: Result<number, never>;
declare const rFallible: Result<number, "e">;
declare const rErrOnly: Result<never, "e">;
rNever.unwrap(); // ok: E = never
rErrOnly.unwrapErr(); // ok: T = never
// @ts-expect-error - unwrap requires E = never
rFallible.unwrap();
// @ts-expect-error - unwrapErr requires T = never
rFallible.unwrapErr();

declare const arNever: AsyncResult<number, never>;
declare const arFallible: AsyncResult<number, "e">;
arNever.unwrap();
// @ts-expect-error - async unwrap requires E = never
arFallible.unwrap();
// @ts-expect-error - async unwrapErr requires T = never
arFallible.unwrapErr();
```

- [ ] **Step 2: Run test-d to confirm it fails**

Run: `pnpm --filter unthrown exec tsc --noEmit -p tsconfig.test-d.json`
Expected: FAIL — `Unused '@ts-expect-error' directive` on the four guarded lines (unwrap currently compiles on a fallible result, so the directive is unused).

- [ ] **Step 3: Apply the gate in `types.ts`**

In `packages/core/src/types.ts`, `ResultMethods` — change:

```ts
  unwrap(): T;
```

to

```ts
  unwrap(this: Result<T, never>): T;
```

and

```ts
  unwrapErr(): E;
```

to

```ts
  unwrapErr(this: Result<never, E>): E;
```

In `AsyncResultMethods` — change `unwrap(): Promise<T>;` to `unwrap(this: AsyncResult<T, never>): Promise<T>;` and `unwrapErr(): Promise<E>;` to `unwrapErr(this: AsyncResult<never, E>): Promise<E>;`.

- [ ] **Step 4: Fix the internal `AsyncRes` delegation in `core.ts`**

`AsyncRes.unwrap`/`unwrapErr` delegate to `r.unwrap()` on a generic `Result<T, E>`, which the gate now rejects. The delegation is sound because these methods are externally gated to the `never`-channel form, so cast:

```ts
  unwrap(): Promise<T> {
    return this.promise.then((r) => (r as Result<T, never>).unwrap());
  }
  unwrapErr(): Promise<E> {
    return this.promise.then((r) => (r as Result<never, E>).unwrapErr());
  }
```

Leave `Res.unwrap`/`unwrapErr` (the runtime switch in the `Res` class) **unchanged** — their `this: Result<T, E>` body still type-checks all three tags, and the defensive `UnwrapError` branches stay.

- [ ] **Step 5: Rewrite the eliminator-behavior tests to the gated semantics**

The tests that assert the _old_ "unwrap an Err throws UnwrapError" now exercise the **defensive, type-unreachable** branch, so they force it with a cast. Update:

`packages/core/src/result.spec.ts` (the "unwrap returns the Ok value; throws UnwrapError on Err" test) — replace `Err("e").unwrap();` with:

```ts
// The Err branch is unreachable in typed code (unwrap needs E = never);
// force it via a cast to exercise the defensive runtime guard.
(Err("e") as unknown as Result<number, never>).unwrap();
```

and in the "unwrapErr … throws UnwrapError on Ok" test, replace `Ok(1).unwrapErr();` with:

```ts
(Ok(1) as unknown as Result<never, number>).unwrapErr();
```

`packages/core/src/invariants.spec.ts` ("on Err throws an UnwrapError carrying E") — replace `Err("modeled").unwrap();` with `(Err("modeled") as unknown as Result<number, never>).unwrap();` and update the comment to note it guards the defensive branch.

`packages/core/src/async-result.spec.ts` ("unwrap resolves the value and rejects (via UnwrapError) on Err") — replace `asyncErr("e").unwrap()` with `(asyncErr("e") as unknown as AsyncResult<number, never>).unwrap()` (import `type AsyncResult` if not already imported).

- [ ] **Step 6: Migrate every remaining fallible call site (compiler-driven)**

Run `pnpm --filter unthrown typecheck` and `pnpm --filter @unthrown/standard-schema typecheck`. Each error is a `.unwrap()` on an inhabited-error result or `.unwrapErr()` on an inhabited-success result. Fix each by the matching pattern (do **not** add casts except the four defensive ones in Step 5):

- `expect(r.unwrapErr()).toBe(x)` → `expect(r).toBeErrWith(x)` (Task 1's matcher).
- `expect(r.unwrapErr()).toEqual(obj)` → `expect(r).toBeErrWith(obj)`.
- `expect(r.unwrap()).toBe(v)` on a fallible `r` → `expect(r).toBeOkWith(v)`.
- A value needed for further assertions → narrow first:
  ```ts
  expect(r).toBeOk();
  if (r.isOk()) expect(r.value.foo).toBe(1); // guard, so the value is typed
  ```
  (Always precede the `if (r.isOk())` guard with a `toBeOk()`/`toBeErr()` assertion so a wrong variant fails loudly instead of skipping the check.)
- An `await`ed `AsyncResult`: `await expect(ar).toBeErrWith(x)` / `toBeOkWith(v)` (the matchers detect and await a thenable).

Repeat until `pnpm typecheck` is green across the workspace.

- [ ] **Step 7: Verify test-d passes and the suite is green**

Run:

```bash
pnpm --filter unthrown exec tsc --noEmit -p tsconfig.test-d.json && echo "test-d ok"
pnpm typecheck
pnpm test
```

Expected: test-d passes (the four `@ts-expect-error` directives are now used); typecheck green workspace-wide; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src packages/standard-schema/src
git commit -m "feat(core)!: gate unwrap/unwrapErr on an empty opposite channel"
```

---

## Task 3: Update TSDoc and documentation examples

`@example` snippets in TSDoc and guide/README prose are **not** type-checked by CI, so they didn't break Task 2 — but several now show code that wouldn't compile. Update them and the `@throws` docs.

**Files:**

- Modify: `packages/core/src/types.ts` (unwrap/unwrapErr `@throws` TSDoc), `packages/core/src/core.ts` (`UnwrapError` class TSDoc)
- Modify: `docs/guide/*.md`, root `README.md`, `packages/*/README.md`, and core-source `@example` blocks that unwrap a fallible result

- [ ] **Step 1: Update the `@throws` TSDoc on the gated eliminators**

In `packages/core/src/types.ts`, replace the `unwrap()` `@throws` (currently "On `Err`, an `UnwrapError`…") with wording that reflects the gate:

```ts
   * @remarks
   * Compiles only when the error channel is empty (`E = never`) — eliminate
   * modeled errors first (`match` / `recover` / `orElse`). A `Defect` still
   * **rethrows its original cause** (a defect is a bug, not an absent value).
```

Do the symmetric edit for `unwrapErr()` (`T = never`). In `packages/core/src/core.ts`, add a one-line note to the `UnwrapError` class TSDoc that it is now a defensive guard for unsound runtime misuse (the wrong-variant branch is unreachable through well-typed code).

- [ ] **Step 2: Fix fallible-unwrap snippets in docs and `@example` blocks**

Find them: `grep -rn "\.unwrap()\|\.unwrapErr()" docs/guide packages/*/README.md README.md packages/core/src/*.ts` (skip `docs/.vitepress/dist/`, a build artifact). For each snippet where the receiver has an inhabited opposite channel, rewrite to the guarded/matched form or add the missing channel-elimination step so the example would compile. Snippets on `Ok(…)`, `fromSafePromise(…)`, or all-`Ok` aggregates already type-check (`E = never`) — leave them.

- [ ] **Step 3: Verify docs build clean**

Run: `pnpm --filter unthrown build:docs 2>&1 | grep -Ei 'warning|error' || echo "typedoc clean"`
Expected: `typedoc clean`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src docs/guide README.md packages/*/README.md
git commit -m "docs: update unwrap/unwrapErr docs and examples for the extraction gate"
```

---

## Task 4: Invariant record, changeset, and final gate

**Files:**

- Modify: `CLAUDE.md`
- Create: `.changeset/gate-unwrap.md`

- [ ] **Step 1: Reword the invariant in CLAUDE.md**

In `CLAUDE.md`, replace the "**`unwrap()` is asymmetric**" bullet under "Load-bearing runtime invariants" with:

```markdown
- **`unwrap()` / `unwrapErr()` are type-gated.** `unwrap()` compiles only when the
  error channel is empty (`this: Result<T, never>`); `unwrapErr()` only when the
  success channel is empty (`this: Result<never, E>`). On a `Defect` they **rethrow
  the original cause** (panic). The `UnwrapError`-on-wrong-variant branch remains at
  runtime as a defensive guard but is **unreachable through well-typed code**.
```

Update the eliminate-family entry in the "Public surface" section to note `unwrap`/`unwrapErr` are gated, and that the `unwrapOr`/`getOr*` family (unchanged) is the way to extract from a fallible result with a fallback.

- [ ] **Step 2: Write the changeset (major)**

Create `.changeset/gate-unwrap.md`:

```markdown
---
"unthrown": major
---

**Breaking:** `unwrap()` and `unwrapErr()` are now type-gated. `unwrap()` compiles
only on a `Result` / `AsyncResult` whose error channel is empty (`E = never`), and
`unwrapErr()` only when the success channel is empty (`T = never`). Calling `.unwrap()`
on a fallible `Result<T, E>` is now a **compile error** instead of a runtime
`UnwrapError` — eliminate the error channel first with `match` / `recover` / `orElse`,
or use the `unwrapOr` / `unwrapOrElse` / `getOrNull` / `getOrUndefined` family (which
recover an `Err`). `Ok(x).unwrap()` and error-free results are unaffected. The runtime
is unchanged and `UnwrapError` is retained as a defensive guard.

Also adds `toBeErrWith` to `@unthrown/vitest` for asserting a plain error value.
```

(Confirm `"unthrown": major` cascades correctly through the `fixed` group in `.changeset/config.json`.)

- [ ] **Step 3: Final full gate**

Run:

```bash
pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build
pnpm --filter unthrown build:docs 2>&1 | grep -Ei 'warning|error' || echo "typedoc clean"
```

Expected: every command passes; final line `typedoc clean`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .changeset/gate-unwrap.md
git commit -m "docs: record the unwrap gate invariant and add the major changeset"
```

---

## Self-Review Notes

- **Spec coverage:** the gate (spec "The gate") = Task 2 Steps 3-4; no-escape-hatch migration = Task 2 Steps 5-6 (+ Task 1's matcher, elevated with rationale above); test-d guards = Task 2 Steps 1-2; invariant/CLAUDE + TSDoc = Tasks 3-4; UnwrapError kept defensive = Task 2 Step 4 note + Task 3 Step 1; major changeset = Task 4.
- **Atomicity:** Task 2 is deliberately one task — the type change and its call-site migration cannot be split without a red `typecheck` between them. It ends green (Step 7).
- **Verified mechanics:** both `this`-gates and the `AsyncRes implements AsyncResult` compatibility were confirmed with standalone `tsc` probes before planning; the only internal code fix is the two casts in Task 2 Step 4.
- **Type consistency:** signatures are `unwrap(this: Result<T, never>): T` / `unwrapErr(this: Result<never, E>): E` and the async twins throughout; `toBeErrWith(value: unknown)` mirrors `toBeOkWith`.
- **No placeholder migration:** Task 2 Step 6 is compiler-driven with explicit per-shape patterns rather than an enumerated 60-site list — the `tsc` error set is the authoritative worklist.
