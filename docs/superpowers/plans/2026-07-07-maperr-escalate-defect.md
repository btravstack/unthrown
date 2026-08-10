# `mapErr` → Escalate Errors to the Defect Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `mapErr` reclassify a modeled error into the defect channel. Its callback gains the injected `defect` marker as a second argument (exactly like `fromPromise`/`fromThrowable`'s `qualify`), so returning `defect(cause)` moves that error to the defect channel; the modeled error type is inferred as `Exclude<R, Defect>`.

**Architecture:** A backward-compatible generalization of one combinator. The callback goes from `(error: E) => E2` to `(error: E, defect: (cause: unknown) => Defect) => R`, returning `Result<T, Exclude<R, Defect>>`. The runtime reuses the same triage `fromThrowable` already uses (`isDefectMarker(r) ? defectRes(r.cause) : errRes(r)`), factored into a small `errOrDefect` helper to avoid duplicating it across the sync and async `mapErr`. One primitive covers selective, blanket, and single-error escalation by what the callback returns. No migration — existing `mapErr((e) => e2)` calls infer the same type and keep working (verified: a 1-arg callback is assignable to the 2-arg type, and `Exclude<E2, Defect> = E2` because `Defect` is `unique symbol`-branded).

**Tech Stack:** TypeScript (strict, NodeNext ESM, `.js` imports), Vitest (+ v8 coverage), TypeDoc→VitePress, changesets. Verified with a standalone `tsc` probe: backward-compat inference, selective narrowing, and blanket→`never` all behave.

## Global Constraints

- Core package has **zero runtime dependencies** — add none.
- oxlint binding: no `interface` (use `type`), no `any` (use `unknown`); genuine exceptions carry a targeted `oxlint-disable` with a reason.
- TypeScript `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`; ESM, `.js` relative imports.
- Conventional commits (commitlint + lefthook on commit).
- Full gate green at each task boundary: `pnpm format --check`, `pnpm lint`, `pnpm typecheck` (incl. `test-d`), `pnpm knip`, `pnpm test`, `pnpm build`; `pnpm --filter unthrown build:docs` typedoc-warning-free.
- `packages/core/docs/` and `docs/.vitepress/dist/` are generated artifacts — never edit or commit them.
- One concept = one name. (This deliberately reuses `mapErr` rather than adding a new method.)
- Additive, backward-compatible → a `minor` changeset.

---

## File Structure

- `packages/core/src/types.ts` — add `import type { Defect } from "./defect.js"`; regeneralize the two `mapErr` signatures (`ResultMethods` + `AsyncResultMethods`) and their TSDoc.
- `packages/core/src/core.ts` — add `import { defect, isDefectMarker } from "./defect.js"`; add an `errOrDefect` helper; update `Res.mapErr` and `AsyncRes.mapErr` bodies.
- `packages/core/src/types.test-d.ts` — inference guards (backward-compat, selective, blanket, async).
- `packages/core/src/result.spec.ts` + `packages/core/src/async-result.spec.ts` — runtime tests (escalation, selective, throw→defect).
- `docs/guide/choosing-a-combinator.md`, `docs/guide/the-defect-channel.md` — document escalation.
- `CLAUDE.md` — update the `mapErr` surface entry and the injected-`defect` note.
- `.changeset/maperr-defect.md` — `minor` changeset.

---

## Task 1: Generalize `mapErr` (types + runtime) with tests

TDD, atomic (types + runtime + tests land together, ending green). Backward-compatible, so no call-site migration.

**Files:**

- Modify: `packages/core/src/types.ts`, `packages/core/src/core.ts`, `packages/core/src/types.test-d.ts`
- Test: `packages/core/src/result.spec.ts`, `packages/core/src/async-result.spec.ts`

**Interfaces:**

- Produces: `mapErr<R>(f: (error: E, defect: (cause: unknown) => Defect) => R): Result<T, Exclude<R, Defect>>` (sync) and the `AsyncResult` twin. `defect(cause)` escalates an error to the defect channel.

- [ ] **Step 1: Write the failing type-level and runtime tests**

In `packages/core/src/types.test-d.ts`, add (the `Result`/`AsyncResult`/`Ok`/`Err` imports already exist):

```ts
// --- mapErr can escalate an error to the defect channel ----------------------
declare const rUnion: Result<number, { _tag: "A" } | { _tag: "B" }>;
// backward compat: a 1-arg callback infers the same E2
const _me1 = rUnion.mapErr((e) => e._tag);
type _me1t = Expect<Equal<typeof _me1, Result<number, "A" | "B">>>;
// selective escalation narrows E (the escalated arm is subtracted)
const _me2 = rUnion.mapErr((e, defect) => (e._tag === "B" ? defect(e) : e));
type _me2t = Expect<Equal<typeof _me2, Result<number, { _tag: "A" }>>>;
// blanket escalation empties the error channel
const _me3 = rUnion.mapErr((e, defect) => defect(e));
type _me3t = Expect<Equal<typeof _me3, Result<number, never>>>;
// async twin behaves the same
declare const arUnion: AsyncResult<number, { _tag: "A" } | { _tag: "B" }>;
const _me4 = arUnion.mapErr((e, defect) => defect(e));
type _me4t = Expect<Equal<typeof _me4, AsyncResult<number, never>>>;
```

In `packages/core/src/result.spec.ts`, inside the `mapErr` describe block (find it — it currently tests `Err("x").mapErr((e) => …)`), add:

```ts
it("escalates an error to the defect channel via the injected defect marker", () => {
  const r = Err("boom").mapErr((e, defect) => defect(e));
  expect(r.isDefect()).toBe(true);
  expect(r.match({ ok: () => "ok", err: () => "err", defect: (c) => c })).toBe(
    "boom",
  );
});

it("selectively escalates: the non-escalated error stays an Err", () => {
  const keep = Err<"A" | "B">("A").mapErr((e, defect) =>
    e === "B" ? defect(e) : e,
  );
  expect(keep.unwrapErr()).toBe("A");
  const gone = Err<"A" | "B">("B").mapErr((e, defect) =>
    e === "B" ? defect(e) : e,
  );
  expect(gone.isDefect()).toBe(true);
});
```

In `packages/core/src/async-result.spec.ts`, inside the async `mapErr` coverage, add:

```ts
it("escalates an error to a Defect (async)", async () => {
  const r = await asyncErr("boom").mapErr((e, defect) => defect(e));
  expect(r.isDefect()).toBe(true);
});
```

(`asyncErr` already exists in that spec; if its type is `AsyncResult<T, string>`, `.mapErr((e, defect) => defect(e))` yields `AsyncResult<T, never>` — fine.)

- [ ] **Step 2: Run the tests to confirm they fail**

Run:

```bash
pnpm --filter unthrown exec tsc --noEmit -p tsconfig.test-d.json
pnpm --filter unthrown exec vitest run -t "escalates|selectively escalates"
```

Expected: test-d FAILS — the 2-arg callback isn't assignable to the current 1-arg `mapErr` (the `defect` parameter has no matching type). Runtime FAILS — under the current runtime `mapErr` calls `f(this.error)` with one arg, so `defect` is `undefined`; `defect(e)` throws a `TypeError` that becomes a `Defect` whose cause is the `TypeError`, not `"boom"`, so the cause assertions fail.

- [ ] **Step 3: Add the runtime triage helper and imports in `core.ts`**

In `packages/core/src/core.ts`, add the value import near the top:

```ts
import { defect, isDefectMarker } from "./defect.js";
```

Add a small helper next to `errRes`/`defectRes` (mirrors `interop.ts`'s `qualifyToResult` inner line — a `Defect` marker becomes a defect result, anything else an error result):

```ts
// A qualify-style callback returns `E | Defect`; route it to the matching Result
// variant. Shared by `mapErr` (sync + async) so the triage isn't duplicated.
function errOrDefect<T, E>(r: E | Defect): Result<T, E> {
  return isDefectMarker(r) ? defectRes<T, E>(r.cause) : errRes<T, E>(r);
}
```

Add `type Defect` to the `./defect.js` import if the helper's signature needs it (import both: `import { type Defect, defect, isDefectMarker } from "./defect.js";`).

- [ ] **Step 4: Update `Res.mapErr` and `AsyncRes.mapErr` bodies**

Replace `Res.mapErr` (currently `mapErr<E2>(this, f: (error: E) => E2): Result<T, E2>`) with:

```ts
  mapErr<R>(
    this: Result<T, E>,
    f: (error: E, defect: (cause: unknown) => Defect) => R,
  ): Result<T, Exclude<R, Defect>> {
    if (this.tag !== "Err") return passThrough(this);
    try {
      return errOrDefect(f(this.error, defect) as Exclude<R, Defect> | Defect);
    } catch (cause) {
      return defectRes(cause);
    }
  }
```

Replace `AsyncRes.mapErr` with the delegating-equivalent inline form:

```ts
  mapErr<R>(
    f: (error: E, defect: (cause: unknown) => Defect) => R,
  ): AsyncResult<T, Exclude<R, Defect>> {
    return new AsyncRes<T, Exclude<R, Defect>>(
      this.promise.then((r) => {
        if (r.tag !== "Err") return passThrough(r);
        try {
          return errOrDefect(f(r.error, defect) as Exclude<R, Defect> | Defect);
        } catch (cause) {
          return defectRes(cause);
        }
      }),
    );
  }
```

(The `as Exclude<R, Defect> | Defect` cast mirrors `interop.ts`'s `const triage = qualify as (…) => E | Defect` — the callback's `R` is `Exclude<R, Defect> | Defect` at runtime; a single sound cast, consistent with the boundary code.)

- [ ] **Step 5: Update the `mapErr` type signatures + TSDoc in `types.ts`**

Add at the top of `packages/core/src/types.ts`:

```ts
import type { Defect } from "./defect.js";
```

Replace the `ResultMethods.mapErr` declaration + its TSDoc:

```ts
  /**
   * Transform the modeled error — to a new error, or **escalate it to a defect**.
   *
   * Runs `f` only on `Err`; `Ok` passes through and an existing `Defect` is
   * **never** touched. `f` returns either a new modeled error (kept as `Err`) or
   * `defect(cause)` — the marker injected as its second argument, exactly like
   * {@link fromThrowable}'s `qualify` — to move that error to the defect channel.
   * The result's error type is `Exclude<R, Defect>` (the escalated arm is
   * subtracted), so `(e, defect) => defect(e)` yields `Result<T, never>`. If `f`
   * throws, the throw becomes a `Defect`.
   *
   * @typeParam R - `f`'s return type; the new error `E2` is `Exclude<R, Defect>`.
   * @param f - maps the error to a new one, or escalates it via `defect(cause)`.
   */
  mapErr<R>(f: (error: E, defect: (cause: unknown) => Defect) => R): Result<T, Exclude<R, Defect>>;
```

Replace the `AsyncResultMethods.mapErr` declaration + its TSDoc:

```ts
  /**
   * Asynchronous {@link ResultMethods.mapErr | mapErr}. `f` is synchronous and may
   * escalate an error to a defect via the injected `defect` marker; a throw
   * becomes a `Defect`.
   */
  mapErr<R>(f: (error: E, defect: (cause: unknown) => Defect) => R): AsyncResult<T, Exclude<R, Defect>>;
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run:

```bash
pnpm --filter unthrown exec tsc --noEmit -p tsconfig.test-d.json && echo "test-d ok"
pnpm --filter unthrown test
pnpm --filter unthrown typecheck
```

Expected: test-d passes (all four `Expect<Equal<…>>` hold, including backward-compat `_me1t`); the full core suite passes (existing `mapErr((e) => …)` tests still green — no regression — plus the new escalation tests); typecheck green.

- [ ] **Step 7: Verify lint/knip/coverage**

Run: `pnpm lint && pnpm knip && pnpm --filter unthrown exec vitest run --coverage`
Expected: pass; core coverage stays at its 100% line/function threshold (the new `errOrDefect` branches are covered by the escalation + selective tests).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): let mapErr escalate an error to the defect channel"
```

---

## Task 2: Documentation, CLAUDE.md, and changeset

**Files:**

- Modify: `docs/guide/choosing-a-combinator.md`, `docs/guide/the-defect-channel.md`, `CLAUDE.md`
- Create: `.changeset/maperr-defect.md`

- [ ] **Step 1: Document escalation in the combinator guide**

In `docs/guide/choosing-a-combinator.md`, update the `mapErr` row/description so it notes `mapErr` can also escalate an error to a defect via the injected `defect` marker (returning `defect(cause)`), with `Exclude<R, Defect>` subtracting the escalated arm. Keep the row compiling and consistent with the API reference wording.

- [ ] **Step 2: Add an "escalating errors to defects" note to the defect-channel guide**

In `docs/guide/the-defect-channel.md`, add a short section showing the three shapes on a real tagged-error union:

```ts
// selective — keep some, escalate the rest
result.mapErr((e, defect) => (e._tag === "Corrupt" ? defect(e) : e)); // narrows E
// blanket — every remaining error is now unrecoverable
result.mapErr((e, defect) => defect(e)); // Result<T, never>
```

Frame it as the inverse of `recoverDefect` (Defect→Result): `mapErr` can now send a modeled error the other way, reusing the same injected `defect` marker as `fromPromise`/`fromThrowable`.

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md`'s "Public surface": update the `- error:` entry so `mapErr` reads as "transform the error, **or escalate it to a defect** via the injected `defect` marker (`(error, defect) => E2 | Defect`, inferred as `Exclude<R, Defect>`)". In the constructors note that currently says the qualify-time `defect` marker "is injected, not exported", add that `mapErr` is a second injection point for it (alongside `fromPromise`/`fromThrowable`). Confirm the "a `Defect` flows through every method untouched except `match`/`recoverDefect`" invariant line still reads correctly — it does (an _existing_ defect isn't touched by `mapErr`; the new behavior is that an `Err` can _become_ a defect), but add a parenthetical noting `mapErr` can now turn an `Err` into a defect.

- [ ] **Step 4: Write the changeset**

Create `.changeset/maperr-defect.md`:

```markdown
---
"unthrown": minor
---

`mapErr` can now escalate a modeled error to the defect channel. Its callback
takes the injected `defect` marker as a second argument (like `fromPromise` /
`fromThrowable`'s `qualify`): return `defect(cause)` to move that error to the
defect channel, or a new error to keep it modeled. The error type is inferred as
`Exclude<R, Defect>`, so `(e, defect) => defect(e)` empties the error channel to
`never`. Backward-compatible — existing `mapErr((e) => e2)` calls are unchanged.
```

- [ ] **Step 5: Final full gate**

Run:

```bash
pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build
pnpm --filter unthrown build:docs 2>&1 | grep -Ei 'warning|error' || echo "typedoc clean"
```

Expected: every command passes; final line `typedoc clean`.

- [ ] **Step 6: Commit**

```bash
git add docs/guide CLAUDE.md .changeset/maperr-defect.md
git commit -m "docs: document mapErr's defect-escalation and add the changeset"
```

---

## Self-Review Notes

- **Design coverage:** the generalized signature + injected marker + `Exclude<R, Defect>` = Task 1 Steps 3-5; backward-compat + selective + blanket + async inference = Task 1 Step 1 test-d; runtime escalation/selective/throw = Task 1 Step 1 specs; docs/CLAUDE/changeset = Task 2.
- **Non-breaking:** verified by `tsc` probe (a 1-arg callback is assignable to the 2-arg type; `Exclude<E2, Defect> = E2`). No call-site migration — Task 1 Step 6's full-suite pass is the regression guard.
- **DRY:** the triage is factored into `errOrDefect` and shared by the sync and async `mapErr`, rather than duplicating the `isDefectMarker(…) ? … : …` line.
- **Consistency:** the injected-`defect` + `Exclude<R, Defect>` shape and the single `as … | Defect` runtime cast mirror `interop.ts`'s `fromThrowable`/`qualifyToResult` exactly — no new pattern introduced.
- **Type names:** `mapErr<R>(f: (error: E, defect: (cause: unknown) => Defect) => R): Result<T, Exclude<R, Defect>>` throughout (sync + async); `errOrDefect<T, E>(r: E | Defect): Result<T, E>`.
