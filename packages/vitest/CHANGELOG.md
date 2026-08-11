# @unthrown/vitest

## 5.3.0

## 5.2.0

### Minor Changes

- a4ca526: Point forgotten-`await` failures at the line that created the assertion.

  The `afterEach` net named the pending matchers but not where they came from, so
  a long spec with several `toBeOk` assertions — or a `test.concurrent` run, where
  the mechanism already disambiguates by test name — left the missing `await` to a
  manual scan.

  `settle` now captures an `Error` when it creates the gate, so its stack runs
  through the caller's `expect(...)`. The failure reports the first frame that is
  neither this module nor `node_modules`:

  ```
  @unthrown/vitest: 1 async assertion(s) (toBeOk) were still pending when the
  test ended — a forgotten `await`. … Created at: loadUser (src/user.spec.ts:42:18).
  ```

  The location goes in the **message**, since that is the part every reporter
  shows; the full stack is on the error's `cause` for those that render it.

  The capture happens only on the **async** path — the one that can be forgotten —
  and V8 formats `.stack` lazily, so a correctly-awaited assertion pays for
  constructing the `Error` and nothing else.

- a4ca526: Add the `toBeDefectWith(cause)` matcher.

  The `Defect` channel was the only one without a value assertion — `Ok` has
  `toBeOkWith`, `Err` has `toBeErrWith` and `toBeErrTagged`, and a defect had only
  `toBeDefect`. Asserting _what_ caused one meant a two-step that narrowed by hand,
  and the narrowing only worked on a synchronous `Result`: on an `AsyncResult` the
  value had to be awaited separately, which is exactly what these matchers exist to
  avoid.

  ```ts
  await expect(asyncResult).toBeDefectWith(expect.any(TypeError));
  expect(result).toBeDefectWith(theOriginalCause);
  ```

  `expected` is typed `unknown`, matching the channel — a defect's `cause` is
  `unknown` by design, so there is no tighter type to give it and no tag-aware
  variant to add. Like every other matcher it goes through `settle`, so it inherits
  the thenable handling and the forgotten-`await` net.

## 5.1.0

### Minor Changes

- 5ead919: Close a boundary hole where an `async` function's rejection escaped
  qualification, stop `toBeErrTagged` counting a message as payload, and name the
  value in `NonExhaustiveError`.

  **`fromThrowable` / `fromSafeThrowable` now reject an `async` `fn`.** These wrap a
  **synchronous** function, so they only ever see a synchronous `throw`: an async
  `fn` rejects long after the boundary has returned, and its rejection could never
  reach `qualify`. It used to produce `Ok(<Promise>)` — un-triaged — and the
  rejection then floated as an unhandled rejection, which terminates the process on
  Node by default:

  ```ts
  const f = fromThrowable(
    async () => {
      throw new Error("boom");
    },
    (cause, defect) => defect(cause),
  );
  f(); // before: Ok(<Promise>) + an unhandled rejection
  // now:    Defect(TypeError: … `fn` returned a thenable …)
  ```

  The orphaned rejection is adopted and silenced, so it cannot float. Reach for
  `fromPromise` / `fromSafePromise` for async work.

  This is caught at runtime rather than by the type system — the one thenable ban
  in the library that is not a compile error. Putting `NotThenable` on `fn`'s return
  also makes **generic** functions unassignable, so `fromSafeThrowable(structuredClone)`
  would stop compiling with `T` collapsed to `unknown`; the phantom rest-tuple guard
  `fromPromise` uses fares worse. The success type is therefore slightly over-stated
  (`Result<Promise<T>, E>` is spellable but never inhabited) — the mirror of
  `recoverErrCases`'s `never` under-stating the error channel.

  **`toBeErrTagged`'s exact-payload form now ignores every reserved key.** The
  documented way to set a `TaggedError`'s message is a subclass field —
  `override message = "…"` — which lands as an own **enumerable** property, so it
  leaked into the payload and failed an exact assertion on the very pattern the
  library prescribes:

  ```ts
  class HttpError extends TaggedError("HttpError")<{ status: number }> {
    override message = `http ${this.status}`;
  }
  expect(Err(new HttpError({ status: 500 }))).toBeErrTagged("HttpError", {
    status: 500,
  });
  // before: failed — the payload was seen as { status: 500, message: "http 500" }
  // now:    passes
  ```

  The matcher now skips `_tag`, `name`, `message` and `stack` — exactly the keys
  `TaggedErrorInstance` omits and the constructor types `?: never`, so none of them
  can legitimately be payload. Assertions using `expect.objectContaining` are
  unaffected (they were already tolerant of the extra key).

  **`NonExhaustiveError` now names the value it could not match.** `JSON.stringify`
  _returns_ `undefined` — it does not throw — for a function, a symbol, or
  `undefined`, so the `String(input)` fallback never fired and the message read
  "no pattern matched the value undefined" for exactly the rogue inputs this error
  exists to describe. It now falls back correctly (`… the value function rogueFn() {}`).

## 5.0.0

### Minor Changes

- 5426c56: **A forgotten `await` on an `AsyncResult` matcher is now loud.** The matchers
  track in-flight assertions, and an `afterEach` hook (registered at module load,
  alongside `expect.extend`) fails the test at its end naming the matchers still
  pending — previously a forgotten `await` passed the test silently, at best
  surfacing as a mis-attributed file-level unhandled rejection, at worst not at
  all. The abandoned assertion is reported exactly once and can never late-fire
  as an unhandled rejection. Also: a rejecting non-`AsyncResult` thenable now
  produces the friendly "expected an unthrown Result" failure instead of
  surfacing the raw rejection cause.

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.

## 5.0.0-beta.12

## 5.0.0-beta.11

## 5.0.0-beta.10

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.

## 5.0.0-beta.9

## 5.0.0-beta.8

## 5.0.0-beta.7

## 5.0.0-beta.6

## 5.0.0-beta.5

## 5.0.0-beta.4

## 5.0.0-beta.3

## 5.0.0-beta.2

## 5.0.0-beta.1

### Minor Changes

- 5426c56: **A forgotten `await` on an `AsyncResult` matcher is now loud.** The matchers
  track in-flight assertions, and an `afterEach` hook (registered at module load,
  alongside `expect.extend`) fails the test at its end naming the matchers still
  pending — previously a forgotten `await` passed the test silently, at best
  surfacing as a mis-attributed file-level unhandled rejection, at worst not at
  all. The abandoned assertion is reported exactly once and can never late-fire
  as an unhandled rejection. Also: a rejecting non-`AsyncResult` thenable now
  produces the friendly "expected an unthrown Result" failure instead of
  surfacing the raw rejection cause.

## 5.0.0-beta.0

### Patch Changes

- Updated dependencies [3b06099]
- Updated dependencies [284b7be]
- Updated dependencies [4096713]
- Updated dependencies [a1f68d5]
  - unthrown@5.0.0-beta.0

## 4.3.0

## 4.2.0

## 4.1.0

## 4.0.0

### Patch Changes

- Updated dependencies [8ab4fcb]
- Updated dependencies [bbe2e70]
  - unthrown@4.0.0

## 3.1.0

### Minor Changes

- b8d20d7: - **@unthrown/vitest**: `unthrown` is now a **peerDependency** (the matchers'
  `isResult` is an `instanceof` check — the previous exact-version dependency
  could install a second copy of core and silently reject every genuine
  `Result`). `toBeErrTagged(tag, undefined)` now asserts the payload equals
  `undefined` instead of degrading to a tag-only match.
  - **@unthrown/oxlint**: `prefer-async-result` no longer offers an autofix on an
    `async` function's return annotation (the rewrite could not compile); the
    `oxlint` peer range is now `^1.69.0` (JS plugins require it).
  - **All packages**: core is depended on via `workspace:^` (caret) instead of an
    exact pin, `LICENSE` ships in every tarball, the legacy `types` fallback
    points at the CJS declarations, and `engines.node` relaxes to `>=20`.

## 3.0.1

### Patch Changes

- Updated dependencies [9812449]
  - unthrown@3.0.1

## 3.0.0

### Patch Changes

- Updated dependencies [2cffaed]
- Updated dependencies [88bb366]
  - unthrown@3.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [c8c928e]
  - unthrown@2.0.0

## 1.1.0

### Patch Changes

- Updated dependencies [6eeb19d]
  - unthrown@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies [d5f4256]
- Updated dependencies [b6cc550]
  - unthrown@1.0.0

## 0.3.0

### Patch Changes

- Updated dependencies [db16017]
- Updated dependencies [bc8cd57]
  - unthrown@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [6d7eb66]
- Updated dependencies [fad3984]
  - unthrown@0.2.0

## 0.1.0

### Minor Changes

- initialization

### Patch Changes

- Updated dependencies
  - unthrown@0.1.0
