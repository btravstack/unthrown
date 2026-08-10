# Matcher `returnType<R>()` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-introduce ts-pattern's `.returnType<R>()` on unthrown's built-in matcher, so a match's output type can be **declared** once and every branch handler is checked against it.

**Architecture:** Entirely type-level. `Matcher<E, Remaining, O>` gains a fourth **defaulted** parameter `Declared`; two internal conditionals swap the handler's return position and the builder's output between "infer" (unpinned, today's behaviour) and "the declared type" (pinned). `returnType` is a gated _property_ — the same shape as the existing `exhaustive` gate. The runtime is a one-line `return this`, exactly as ts-pattern does it. No changes to `core.ts`, `types.ts`, or `index.ts`: the combinators read the builder's output through the existing `ExhaustiveMatch` / `MatchOut` / `MatchErrOut` plumbing, which picks up the declared type for free.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest (+ v8 coverage), `tsc` for type-level tests, TypeDoc → VitePress, changesets, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-07-28-matcher-return-type-design.md`

## Global Constraints

- **Core has zero runtime dependencies.** Add none. The only new import in `matcher.ts` is a **type-only** `import type { Defect } from "./defect.js"` (`defect.ts` imports nothing, so no cycle).
- **Purely additive.** `Declared` is defaulted, so `ErrMatcher<E>`, the exported `Matcher` type, and every existing call site stay source-compatible. No existing test or assertion may need editing — if one does, stop: the change is not additive.
- ESM-first, `moduleResolution: NodeNext` — **relative imports end in `.js`**.
- oxlint rules are binding: **no `interface`** (use `type`), **no `any`** (use `unknown`).
- Public API carries full **TSDoc**; `pnpm --filter unthrown build:docs` must stay **typedoc-warning-free**.
- Core holds **100% line/function coverage**, enforced by thresholds in `packages/core/vitest.config.ts`. The new runtime method needs a test that calls it.
- Conventional commits (commitlint via lefthook). Scope core changes `core`.
- The full gate, all must stay green: `pnpm format --check`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm build`.
- **Do not** re-introduce any other dropped ts-pattern surface (deep structural inversion, `P.select`, array/variadic patterns, `.narrow()`, `.otherwise()`).

## File Structure

| File                                            | Responsibility                        | Change                                               |
| ----------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| `packages/core/src/matcher.ts`                  | The matcher's types + runtime builder | **Modify** — the whole feature lives here            |
| `packages/core/typedoc.json`                    | TypeDoc config                        | **Modify** — 4 names into `intentionallyNotExported` |
| `packages/core/src/matcher.spec.ts`             | Matcher runtime tests                 | **Modify** — 2 tests                                 |
| `packages/core/src/types.test-d.ts`             | Type-level assertions                 | **Modify** — 2 new sections                          |
| `docs/explanation/exhaustive-error-matching.md` | The "why" of the error matcher        | **Modify** — new section                             |
| `docs/reference/combinators.md`                 | Combinator cheat-sheet                | **Modify** — one bullet                              |
| `CLAUDE.md`                                     | Authoritative spec                    | **Modify** — 3 spots                                 |
| `.changeset/matcher-return-type.md`             | Release note                          | **Create**                                           |

---

### Task 1: `returnType<R>()` in the matcher (types + runtime)

**Files:**

- Modify: `packages/core/src/matcher.ts`
- Modify: `packages/core/typedoc.json`
- Test: `packages/core/src/matcher.spec.ts` (runtime), `packages/core/src/types.test-d.ts` (types)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces, for Task 2 and 3 to rely on:
  - `Matcher<E, Remaining, O, Declared = Unset>` — the exported builder type, now with a 4th defaulted parameter.
  - `matcher.returnType<R>()` → `Matcher<E, Remaining, never, R>` — callable **only** when `O` is `never` (i.e. directly after `match(…)`); otherwise typed as the non-callable diagnostic `PinTooLate`.
  - Under a pin, a branch handler's return type is `R | Defect`; `run()` and `exhaustive()` return `R`.
  - Unpinned, everything behaves exactly as today.

- [ ] **Step 1: Write the failing runtime tests**

Append to the `describe("the built-in matcher engine", …)` block in `packages/core/src/matcher.spec.ts`:

```ts
it("returnType() pins the output type and is a runtime no-op", () => {
  // The pin is type-level only: the builder is returned unchanged and the
  // match evaluates exactly as it would unpinned.
  expect(
    match("a" as "a" | "b")
      .returnType<number>()
      .with("a", () => 1)
      .with("b", () => 2)
      .run(),
  ).toBe(1);
});

it("still throws NonExhaustiveError under a pin when no arm matches", () => {
  // A rogue value that slipped past the types: pinning must not swallow the
  // non-exhaustive throw (the combinators' throw-to-defect net relies on it).
  const rogue = "c" as unknown as "a" | "b";
  expect(() =>
    match(rogue)
      .returnType<number>()
      .with("a", () => 1)
      .with("b", () => 2)
      .run(),
  ).toThrow(NonExhaustiveError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter unthrown test matcher`
Expected: FAIL — `matcher.returnType is not a function` (and a `tsc` error on `.returnType` in the typecheck step, which is expected until Step 3).

- [ ] **Step 3: Add the type encoding**

In `packages/core/src/matcher.ts`, add the type-only import at the top of the file, directly under the file-header comment block:

```ts
import type { Defect } from "./defect.js";
```

Then, immediately **above** the `Matcher` type declaration (after `NonExhaustive`), add the sentinel and the two switch types:

```ts
/**
 * The "no output type declared" sentinel for a builder's `Declared` parameter.
 * A `unique symbol` so no user type can collide with it. Declaration-only —
 * `tsc` emits it into the `.d.ts` without it needing to be exported.
 *
 * @internal
 */
declare const UNSET: unique symbol;

/** @internal */
type Unset = typeof UNSET;

/**
 * A branch handler's return position: free inference (`O2`) while the builder
 * is unpinned — today's behaviour, unchanged — or the declared type once
 * `.returnType<R>()` has pinned it.
 *
 * `Defect` stays legal under a pin: the injected `defect` helper is the
 * sanctioned deliberate `Err`→`Defect` form (Thesis #5), and `Defect` is not a
 * nameable public type, so `returnType<R | Defect>()` cannot be spelled. The
 * marker is subtracted from the output by {@link PinnedOut} — the same net
 * result as the unpinned `Exclude<O, Defect>`, decided up front.
 *
 * @internal
 */
type BranchReturn<Declared, O2> = [Declared] extends [Unset]
  ? O2
  : Declared | Defect;

/**
 * The builder's output: the accumulated union of branch returns while
 * unpinned, or the declared type once pinned.
 *
 * @internal
 */
type PinnedOut<Declared, O> = [Declared] extends [Unset] ? O : Declared;

/**
 * The diagnostic type of `.returnType` on a builder that has already run a
 * `.with(…)` arm (or is already pinned): not callable, so the mistake is
 * caught where it is written.
 *
 * @internal
 */
type PinTooLate = {
  readonly "unthrown: `.returnType<R>()` is only allowed directly after `match(…)`": true;
};
```

- [ ] **Step 4: Thread `Declared` through the `Matcher` type**

Replace the whole `export type Matcher<E, Remaining, O> = { … }` declaration body in `packages/core/src/matcher.ts` with the version below. Keep every existing TSDoc comment on `with` / `exhaustive` / `run` exactly as it is — only the signatures change — and add the new `returnType` entry:

```ts
export type Matcher<E, Remaining, O, Declared = Unset> = {
  /**
   * The catch-all arm: `.with(P._, handler)` / `.with(P.any, handler)`. A
   * **state transition**, not a computation — it returns `Matcher<E, never, …>`
   * with the remaining cases literally `never`, so the builder is provably
   * exhaustive even when `E` is an unresolved type parameter (a lazily-deferred
   * `Exclude<E, unknown>` would not resolve there). This is what lets a
   * boundary helper generic in `E` terminate with the catch-all (issue #145).
   */
  with<O2>(
    pattern: UniversalPattern,
    handler: (value: Remaining) => BranchReturn<Declared, O2>,
  ): Matcher<E, never, O | O2, Declared>;
  /**
   * Add an arm: one or more patterns sharing a single handler (grouped
   * patterns — `matcher.with(tag("A"), tag("B"), handler)`). The handler
   * receives the input narrowed to what the patterns match (computed against
   * `Remaining`, so cases already handled by earlier arms are excluded); the
   * matched cases are subtracted from `Remaining`.
   */
  with<const Pts extends readonly [unknown, ...unknown[]], O2>(
    ...args: [
      ...patterns: Pts,
      handler: (
        value: Extract<Remaining, MatchedOf<Pts[number]>>,
      ) => BranchReturn<Declared, O2>,
    ]
  ): Matcher<E, Exclude<Remaining, MatchedOf<Pts[number]>>, O | O2, Declared>;

  /**
   * Declare the match's output type up front: every subsequent branch handler
   * is checked against `R`, and the match evaluates to `R` instead of the
   * union of whatever the branches happened to return.
   *
   * @remarks
   * Reach for it when the output is **decided by a signature rather than by
   * the branches** — most sharply in code generic in `E`, where the fold's type
   * has to be declared. It also stops a drifting branch from silently widening
   * the outgoing type, reports the mismatch **on the offending branch**, and
   * gives branch returns a contextual type (so object literals need no
   * annotation).
   *
   * A branch may still return the injected `defect` helper's marker; the defect
   * channel is not part of the declared output.
   *
   * Callable **only directly after `match(…)`** (mirroring ts-pattern): once an
   * arm has run — or the builder is already pinned — this is typed as a
   * non-callable diagnostic. A no-op at runtime.
   *
   * @typeParam R - the declared output type of every branch.
   */
  returnType: [O] extends [never]
    ? <R>() => Matcher<E, Remaining, never, R>
    : PinTooLate;

  /**
   * Terminate the match. Typed callable only when every case is covered
   * (`Remaining` is `never`); otherwise it is a branded diagnostic object
   * naming the remaining cases, and the builder fails the `ExhaustiveMatch`
   * constraint at the combinator call site.
   */
  exhaustive: [Remaining] extends [never]
    ? () => PinnedOut<Declared, O>
    : NonExhaustive<Remaining>;

  /**
   * Execute the match (the combinators call this; it runs `.exhaustive()`).
   * A value with no matching arm throws {@link NonExhaustiveError} —
   * unreachable for well-typed callers.
   */
  run(): PinnedOut<Declared, O>;
};
```

- [ ] **Step 5: Add the runtime no-op**

In `packages/core/src/matcher.ts`, add this method to `class MatcherImpl`, directly after `with` and before `exhaustive`:

```ts
  /**
   * Type-level only — pinning the output type has no runtime meaning, so the
   * builder is returned unchanged (as ts-pattern does).
   */
  returnType(): this {
    return this;
  }
```

`MatcherImpl.prototype` stays frozen — the existing `Object.freeze(MatcherImpl.prototype)` call below the class is unchanged.

- [ ] **Step 6: Run the runtime tests to verify they pass**

Run: `pnpm --filter unthrown test matcher`
Expected: PASS, all tests in `matcher.spec.ts` green.

- [ ] **Step 7: Write the type-level assertions for the standalone matcher**

First, `types.test-d.ts` does **not** currently import `match` (it only ever
reached the matcher through the combinators). Add it to the existing
`import { … } from "./index.js"` list at the top of the file:

```ts
  match,
```

The list is not strictly alphabetical, so drop it in and let `pnpm format`
normalise the ordering.

Then append a new section at the **end** of `packages/core/src/types.test-d.ts`:

```ts
// --- matcher: returnType<R>() declares the output, and binds every branch ----
// Pinning is what lets code that must DECLARE its output type (a signature, a
// generic helper) stop the branches from deciding it by inference.

{
  class NotFound extends TaggedError("NotFound")<{ id: string }> {}
  class Conflict extends TaggedError("Conflict")<{ key: string }> {}
  const e = new NotFound({ id: "1" }) as NotFound | Conflict;

  // pinned: the fold type is the DECLARED one, not the union of branch returns
  const pinned = match(e)
    .returnType<string>()
    .with(tag("NotFound"), (n) => n.id)
    .with(tag("Conflict"), () => "conflict")
    .exhaustive();
  type _Pinned = Expect<Equal<typeof pinned, string>>;

  // REGRESSION GUARD: unpinned, branch returns still infer exactly as before
  // (the `BranchReturn` conditional must not defer inference and collapse O2 —
  // the `fromPromise`-qualify hazard, see CLAUDE.md's internal design)
  const inferred = match(e)
    .with(tag("NotFound"), () => 1 as const)
    .with(tag("Conflict"), () => "x" as const)
    .exhaustive();
  type _Inferred = Expect<Equal<typeof inferred, 1 | "x">>;

  // narrowing is preserved under a pin
  match(e)
    .returnType<string>()
    .with(tag("NotFound"), (n) => {
      type _Narrowed = Expect<Equal<typeof n, NotFound>>;
      return n.id;
    })
    .with(tag("Conflict"), () => "c")
    .exhaustive();

  // a branch that violates the pin fails ON THE BRANCH, not downstream
  match(e)
    .returnType<string>()
    // @ts-expect-error — 42 is not assignable to the declared `string`
    .with(tag("NotFound"), () => 42)
    .with(tag("Conflict"), () => "c")
    .exhaustive();

  // `.returnType` is only allowed directly after `match(…)`
  match(e)
    .with(tag("NotFound"), () => "a")
    .with(tag("Conflict"), () => "c")
    // @ts-expect-error — not callable: an arm has already run
    .returnType<string>();

  // re-pinning is rejected by the same gate
  match(e)
    .returnType<string>()
    .with(tag("NotFound"), () => "a")
    // @ts-expect-error — not callable: the builder is already pinned
    .returnType<number>();

  // a missing case under a pin still makes `.exhaustive` uncallable
  const partial = match(e)
    .returnType<string>()
    .with(tag("NotFound"), (n) => n.id);
  // @ts-expect-error — Conflict is unhandled
  partial.exhaustive();
}
```

**Note on `@ts-expect-error` placement:** the directive suppresses errors on the **next line only**. The expected positions above were verified against the real overload shapes, but if `tsc` reports "Unused '@ts-expect-error' directive", move the comment to the line the error is actually reported on (run `pnpm --filter unthrown test:types` and read the position). Never delete an assertion to make the file compile — that would silently drop the guarantee under test.

- [ ] **Step 8: Run the type-level tests**

Run: `pnpm --filter unthrown test:types`
Expected: PASS — no output. Every `@ts-expect-error` above must be _used_ (an unused one is itself an error), and no `Expect<Equal<…>>` may fail.

- [ ] **Step 9: Keep TypeDoc warning-free**

The exported `Matcher` type now references four non-exported names. Add them to `intentionallyNotExported` in `packages/core/typedoc.json`, after the existing `"MatchedOf"` entry:

```json
    "MatchedOf",
    "Unset",
    "BranchReturn",
    "PinnedOut",
    "PinTooLate"
```

- [ ] **Step 10: Run the full gate**

Run each, expecting all green:

```bash
pnpm format --check
pnpm lint
pnpm typecheck
pnpm knip
pnpm test
pnpm build
pnpm --filter unthrown build:docs
```

If `pnpm format --check` fails, run `pnpm format` and re-check. `build:docs` must emit **no** typedoc warnings — if one names a type, add it to `intentionallyNotExported` rather than exporting the type.

Pay particular attention to the **`combine` inference regression guard** in `packages/core/src/aggregate.spec.ts` (the `<T, E>(rs: Result<T, E>[]) => Result<T[], E>` helpers at lines ~58 and ~170). It is the canary for the variance/inference collapse CLAUDE.md documents; `pnpm test` covers it, and it must stay green.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/matcher.ts packages/core/src/matcher.spec.ts packages/core/src/types.test-d.ts packages/core/typedoc.json
git commit -m "feat(core): returnType<R>() pins a match's output type

Declares the output once and checks every branch against it, so a
signature — not the branches — decides the fold's type. Type-level
only; the runtime is a no-op, as in ts-pattern."
```

---

### Task 2: Prove the combinator surfaces inherit the pin (type tests only)

**Files:**

- Test: `packages/core/src/types.test-d.ts`

**Interfaces:**

- Consumes: `matcher.returnType<R>()` from Task 1.
- Produces: nothing new. This task asserts that **no source change** is needed for the pin to reach the five `*ErrCases` combinators (sync and async), `match`'s `errCases` handler, and generic-`E` code — because those read the builder through `ExhaustiveMatch` / `MatchOut` / `MatchErrOut`, which resolve to the declared type. **If any assertion here requires touching `core.ts` or `types.ts`, stop and report** — the design claims it does not.

- [ ] **Step 1: Write the combinator-surface assertions**

Append a new section at the **end** of `packages/core/src/types.test-d.ts` (after Task 1's section):

```ts
// --- returnType<R>() reaches every combinator that hands out a matcher -------
// Nothing in core.ts/types.ts needed changing: the combinators read the
// builder's output through ExhaustiveMatch/MatchOut, which picks up the pin.

{
  class NotFound extends TaggedError("NotFound")<{ id: string }> {}
  class DriverError extends TaggedError("DriverError")<{ cause: unknown }> {}
  class ApiError extends TaggedError("ApiError")<{ status: number }> {}
  const r = Ok(1) as Result<number, NotFound | DriverError>;

  // mapErrCases: the outgoing E is the DECLARED type
  const pinned = r.mapErrCases((matcher) =>
    matcher
      .returnType<ApiError>()
      .with(tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(tag("DriverError"), () => new ApiError({ status: 500 })),
  );
  type _Pinned = Expect<Equal<typeof pinned, Result<number, ApiError>>>;

  // the injected `defect` helper stays legal under a pin, and never reaches
  // the outgoing modeled channel
  const withDefect = r.mapErrCases((matcher, defect) =>
    matcher
      .returnType<ApiError>()
      .with(tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(tag("DriverError"), (d) => defect(d.cause)),
  );
  type _WithDefect = Expect<Equal<typeof withDefect, Result<number, ApiError>>>;

  // flatMapErrCases: the declared Result's channels drive both outgoing channels
  const flat = r.flatMapErrCases((matcher) =>
    matcher
      .returnType<Result<string, ApiError>>()
      .with(tag("NotFound"), (n) => Ok(n.id))
      .with(tag("DriverError"), () => Err(new ApiError({ status: 500 }))),
  );
  type _Flat = Expect<Equal<typeof flat, Result<number | string, ApiError>>>;

  // recoverErrCases: the declared type is the recovered success type
  const rec = r.recoverErrCases((matcher) =>
    matcher.returnType<number>().with(P._, () => 0),
  );
  type _Rec = Expect<Equal<typeof rec, Result<number, never>>>;

  // THE REPORTED CALL SITE (issue #152): a typed HTTP layer folds its error
  // channel into a route's declared response union. Each arm is checked
  // against that union — which is the whole point: a mistyped body
  // discriminant, or a status the route does not declare, must be a compile
  // error rather than a silently widened result.
  type Response =
    | { status: 404; body: { code: "NOT_FOUND" } }
    | { status: 409; body: { code: "CONFLICT" } };

  const responded = r.recoverErrCases((matcher) =>
    matcher
      .returnType<Response>()
      .with(tag("NotFound"), () => ({
        status: 404 as const,
        body: { code: "NOT_FOUND" as const },
      }))
      .with(tag("DriverError"), () => ({
        status: 409 as const,
        body: { code: "CONFLICT" as const },
      })),
  );
  type _Responded = Expect<
    Equal<typeof responded, Result<number | Response, never>>
  >;

  // the check has teeth: a discriminant the union does not declare fails
  r.recoverErrCases((matcher) =>
    matcher
      .returnType<Response>()
      // @ts-expect-error — "GONE" is not a declared body code
      .with(tag("NotFound"), () => ({
        status: 404 as const,
        body: { code: "GONE" as const },
      }))
      .with(tag("DriverError"), () => ({
        status: 409 as const,
        body: { code: "CONFLICT" as const },
      })),
  );

  // observers: the error still passes through unchanged under a pin
  const observed = r.tapErrCases((matcher) =>
    matcher.returnType<void>().with(P._, () => undefined),
  );
  type _Observed = Expect<
    Equal<typeof observed, Result<number, NotFound | DriverError>>
  >;

  // the async surface mirrors it
  const apinned = r.toAsync().mapErrCases((matcher) =>
    matcher
      .returnType<ApiError>()
      .with(tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(tag("DriverError"), () => new ApiError({ status: 500 })),
  );
  type _APinned = Expect<Equal<typeof apinned, AsyncResult<number, ApiError>>>;

  // match's errCases handler: the fold type is the declared one
  const folded = r.match({
    ok: (n) => `ok:${n}`,
    errCases: (matcher) =>
      matcher.returnType<string>().with(P._, (err) => err._tag),
    defect: () => "defect",
  });
  type _Folded = Expect<Equal<typeof folded, string>>;

  // an async branch is STILL rejected where the combinator awaits it
  // @ts-expect-error — an async flatMapErrCases branch is banned, pin or no pin
  r.flatMapErrCases((matcher) =>
    matcher.returnType<Result<number, ApiError>>().with(P._, async () => Ok(1)),
  );

  // THE MOTIVATING CASE: generic in E, catch-all terminated, output DECLARED by
  // the signature rather than inferred from the branch (issue #145 territory —
  // the catch-all is a state transition, so it is provably exhaustive here)
  const lock = <T, E>(res: Result<T, E>): Result<T, ApiError> =>
    res.mapErrCases((matcher) =>
      matcher
        .returnType<ApiError>()
        .with(P._, () => new ApiError({ status: 500 })),
    );
  const locked = lock(r);
  type _Locked = Expect<Equal<typeof locked, Result<number, ApiError>>>;
}
```

- [ ] **Step 2: Run the type-level tests**

Run: `pnpm --filter unthrown test:types`
Expected: PASS — no output. See Task 1 Step 7's note if an `@ts-expect-error` reports as unused.

- [ ] **Step 3: Confirm no source change was needed**

Run: `git status --porcelain packages/core/src`
Expected: only `packages/core/src/types.test-d.ts` is modified. If `core.ts` or `types.ts` appear, the additive claim is broken — stop and report.

- [ ] **Step 4: Run the full gate**

```bash
pnpm typecheck
pnpm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.test-d.ts
git commit -m "test(core): assert returnType reaches every matcher surface

Covers the five *ErrCases combinators (sync and async), match's
errCases handler, the defect branch under a pin, and the generic-E
lock that motivated the feature."
```

---

### Task 3: Documentation, spec, and changeset

**Files:**

- Modify: `docs/explanation/exhaustive-error-matching.md`
- Modify: `docs/reference/combinators.md`
- Modify: `CLAUDE.md`
- Create: `.changeset/matcher-return-type.md`

**Interfaces:**

- Consumes: the behaviour built in Tasks 1–2.
- Produces: nothing code-facing.

- [ ] **Step 1: Add the explanation section**

In `docs/explanation/exhaustive-error-matching.md`, insert this section **between** the `## Generic boundary helpers: the catch-all works, tags don't` section and the final `## Where to go next` section:

````markdown
## Declaring the output: `returnType<R>()`

By default a match's output type is **inferred** — the union of whatever the
branches return. That is the right default when the branches are the source of
truth. It is the wrong one when a **signature** is: a boundary helper, a bridge,
an adapter whose return type is already decided. There, inference works
backwards, and a branch that drifts off-spec silently widens the result instead
of failing.

`.returnType<R>()`, called directly after `match(…)`, declares the output once:

```ts
const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
  result.mapErrCases((matcher) =>
    matcher
      .returnType<ApiError>()
      .with(P._, (error) => new ApiError({ status: 500, error })),
  );
```

Three things change:

- **The match evaluates to `R`**, not to the union of the branch returns — so
  the helper's declared return type is what actually flows out.
- **Every branch is checked against `R`**, and a mismatch is reported **on the
  offending branch** rather than downstream at the call site.
- **Branch returns get a contextual type**, so object literals infer against `R`
  with no per-branch annotation.

The injected `defect` helper stays legal under a pin — the defect channel is not
part of the declared output:

```ts
result.mapErrCases(
  (matcher, defect) =>
    matcher
      .returnType<ApiError>()
      .with(tag("RecordNotFound"), () => new ApiError({ status: 404 }))
      .with(tag("DriverError"), (e) => defect(e.cause)), // still fine
);
```

Exhaustiveness is unaffected: a missing case is still a compile error, and
`P._` is still the deliberate catch-all. Pinning declares _what comes out_, not
_what is covered_.

`.returnType<R>()` is allowed **only directly after `match(…)`** — once an arm
has run there is already an inferred output to contradict, so pinning late (or
twice) does not compile.
````

- [ ] **Step 2: Add the reference bullet**

In `docs/reference/combinators.md`, in the `## The error channel` bullet list, insert this bullet immediately **after** the bullet beginning `- **The outgoing `E` is the union of the branch returns.**`:

```markdown
- **…unless you declare it.** `matcher.returnType<R>()`, called directly after
  the matcher is handed to you, pins the output to `R`: every branch is checked
  against it (a mismatch is reported on that branch) and the outgoing channel is
  `R` rather than the union of the branch returns. Reach for it when a signature
  decides the type — most sharply in code generic in `E`. A `defect(…)` branch
  stays legal under a pin. See
  [Exhaustive error matching](../explanation/exhaustive-error-matching#declaring-the-output-returntyper).
```

- [ ] **Step 3: Update `CLAUDE.md` — Thesis #5's matcher paragraph**

In `CLAUDE.md`, find the sentence in Thesis #5 that reads:

```
  `match`, `P` (`_`/`any`, `instanceOf`, `when`, `union`, `string`, `number`),
  and `NonExhaustiveError` exported from core — first-class in one import,
```

Replace it with:

```
  `match`, `P` (`_`/`any`, `instanceOf`, `when`, `union`, `string`, `number`),
  `returnType<R>()` (declare the output type once — every branch is checked
  against it, and the match evaluates to `R` instead of the union of the branch
  returns; callable only directly after `match(…)`, a runtime no-op, and a
  `defect(…)` branch stays legal because the defect channel is not part of the
  declared output), and `NonExhaustiveError` exported from core — first-class in
  one import,
```

- [ ] **Step 4: Update `CLAUDE.md` — the matcher-exports bullet**

In the "Public surface" section, find the `- matcher exports:` bullet's opening:

```
- matcher exports: `match`, `P`, and `NonExhaustiveError` come from the
  built-in `matcher.ts` (plus the types `Matcher`/`PatternMatcher`/
  `UniversalPattern`), and `tag(t)` (the `{ _tag: t }` pattern, narrowing to
```

Replace those three lines with:

```
- matcher exports: `match`, `P`, and `NonExhaustiveError` come from the
  built-in `matcher.ts` (plus the types `Matcher`/`PatternMatcher`/
  `UniversalPattern`; the builder also carries `returnType<R>()`, which pins
  the output type — see Thesis #5), and `tag(t)` (the `{ _tag: t }` pattern,
  narrowing to
```

- [ ] **Step 5: Update `CLAUDE.md` — the load-bearing invariant**

In the "Load-bearing runtime invariants" section, insert this bullet immediately **after** the bullet beginning `- **Exhaustiveness is type-enforced, with no forgettable step.**`:

```
- **A pinned match under-describes the defect channel — deliberately, and by
  exactly the amount `recoverErrCases` already does.** Under
  `.returnType<R>()` a branch handler may return `R | Defect` (the injected
  `defect` helper stays legal — Thesis #5) while `run()`/`exhaustive()` type as
  `R`. This is the same subtraction the unpinned path performs with
  `Exclude<O, Defect>`, decided up front instead of at the end. It is sound at
  runtime because the combinators' `runMatch` checks `isDefectMarker` before
  using the value, so a defect never escapes typed as `R`. `match`'s `errCases`
  handler accepts the same shape but is injected **no** `defect` helper, and
  there is no public constructor — so a `Defect` is unreachable there. This is a
  _type-level_ invariant, guarded in `types.test-d.ts`.
```

- [ ] **Step 6: Write the changeset**

Create `.changeset/matcher-return-type.md`:

````markdown
---
"unthrown": minor
---

Add `returnType<R>()` to the built-in matcher — declare a match's output type once, and every branch is checked against it.

Called directly after the matcher is handed to you, it pins the result: the match evaluates to `R` instead of the union of the branch returns, a branch that drifts off-spec fails **on that branch** rather than downstream, and branch returns get a contextual type. It reaches every surface that hands out a matcher — the five `*ErrCases` combinators (sync and async), `match`'s `errCases` handler, and standalone `match(value)`.

```ts
const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
  result.mapErrCases((matcher) =>
    matcher
      .returnType<ApiError>()
      .with(P._, (error) => new ApiError({ status: 500, error })),
  );
```
````

The motivating case is code whose output type is decided by a signature rather than by the branches — a typed HTTP layer folding its error channel into a route's declared response union, or any helper generic in `E`. The injected `defect` helper stays legal under a pin, and exhaustiveness is unaffected. Restores the one ts-pattern feature worth keeping after the built-in matcher replaced that dependency; the runtime is a no-op, as it was there.

Closes #152.

````

- [ ] **Step 7: Verify the docs build and the links resolve**

```bash
pnpm format --check
pnpm --filter unthrown build:docs
pnpm --filter @unthrown/docs build
````

Expected: all green, no typedoc warnings, no VitePress dead-link errors. The
reference bullet links to the anchor
`../explanation/exhaustive-error-matching#declaring-the-output-returntyper` —
if VitePress reports it dead, correct the anchor to match the heading VitePress
actually generated (check the built output) rather than removing the link.

- [ ] **Step 8: Run the full gate one last time**

```bash
pnpm format --check
pnpm lint
pnpm typecheck
pnpm knip
pnpm test
pnpm build
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add docs/explanation/exhaustive-error-matching.md docs/reference/combinators.md CLAUDE.md .changeset/matcher-return-type.md
git commit -m "docs(core): document returnType<R>() and add the changeset"
```

---

## Out of scope

- Any other dropped ts-pattern surface (deep structural inversion, `P.select`, array/variadic patterns, `.narrow()`, `.otherwise()`).
- Changes to `core.ts`, `types.ts`, or `index.ts` — the feature is additive to `matcher.ts` alone. If a task appears to need one, stop and report rather than widening the change.
- The `@unthrown/oxlint` rules: `returnType` needs no lint support.
