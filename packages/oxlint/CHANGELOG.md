# @unthrown/oxlint

## 5.4.0

### Minor Changes

- d892c07: **Breaking, released as a minor.** Remove the `no-throw` and `prefer-ensure`
  rules. The plugin now ships six rules: five in `recommended`, plus
  `no-get-or-throw` as the one opt-in. A config naming either removed rule fails
  to resolve it — see the migration note below. Configs that use the
  `recommended` preset alone are unaffected, since neither rule was in it.

  `prefer-ensure` flagged a shape that violates no thesis — a `flatMap` gating its
  own parameter is correct code with a better name available. Every other rule
  flags a spelling unthrown considers _wrong_, and a report-only refactor
  suggestion with a known false positive (a reassigned parameter) was not paying
  for 300 lines of AST analysis.

  `no-throw` reported every `ThrowStatement` unconditionally, with no binding to
  resolve and no shape to match — a `no-restricted-syntax` entry rather than a
  rule. The guidance it carried lives in the "Lint your codebase" guide and in
  `no-get-or-throw`'s own message.

  **Migrating:** remove `"unthrown/no-throw"` and `"unthrown/prefer-ensure"` from
  your `.oxlintrc.json`. Neither was in the `recommended` preset, so configs using
  the preset alone need no change. To keep banning `throw`, reach for oxlint's own
  `no-restricted-syntax`.

  Also: the `recommended` preset is now a plain object literal instead of a
  `defineConfig(...)` call, which drops a runtime import of `oxlint` — a peer
  dependency — from the plugin's module graph. The exported shape is unchanged.

## 5.3.0

## 5.2.0

### Minor Changes

- 3eef964: Add the opt-in `no-get-or-throw` rule, and withdraw the circular `getOrThrow`
  rationale.

  `getOrThrow()` extracts `T` but throws the modeled error as-is, abandoning
  errors-as-values at the last step — a caller of the enclosing function sees a
  throw, not a channel. The new rule reports it, pointing at the fold that keeps
  the error a value: `recoverErrCases` empties `E`, so `get()` compiles, and a
  case routed to the injected `defect(...)` panics with its original cause.

  It matches a **zero-argument** `.getOrThrow()` member call, so Effect's
  one-argument `Option.getOrThrow(o)` / `Either.getOrThrow(e)` are untouched. A
  computed access and a detached reference are documented misses.

  The rule is **opt-in**, not in the `recommended` preset, and deliberately
  option-free: `getOrThrow()` is the right tool in a test, and oxlint's own
  `overrides` already exempts a test glob. It is also the one rule an existing
  test suite fails until configured, which is no way to behave in a preset.

  It stacks with `no-throw`: alone, each leaves the other spelling as an escape;
  together there is none. That made `no-throw`'s own message — which recommended
  `getOrThrow()` as the sanctioned escape — circular, so it now points at
  `recoverErrCases` + `get` instead. `getOrThrow`'s TSDoc is reframed the same
  way: a test-and-script tool, not the production escape. **`getOrThrow` itself
  is unchanged and not deprecated** — the `unthrown` bump is documentation only.

- 0ebb060: `prefer-async-result`: add the `AsyncResult` import as part of the autofix.

  The rule withheld its fix whenever `AsyncResult` was not already imported, since
  rewriting to a name that is not in scope produces code that does not compile.
  The reasoning was right, but it made the autofix unavailable in the rule's most
  common case: a file that imports `Result` — which is what trips the rule — and
  has never needed `AsyncResult`. The diagnostic fired, `--fix` did nothing, and
  the import had to be added by hand first.

  The fix now emits both edits. The specifier is inserted after the **last
  `ImportSpecifier`**, so it is indifferent to spacing and to whether the existing
  specifiers carry per-specifier `type` qualifiers:

  ```ts
  // before
  import type { Result } from "unthrown";
  type T = Promise<Result<User, NotFound>>;

  // after --fix
  import type { Result, AsyncResult } from "unthrown";
  type T = AsyncResult<User, NotFound>;
  ```

  Still withheld, each because the fix would not compile or would not mean what it
  says: an `async` function's own return annotation and a function _type_'s return
  position (both must stay a native `Promise`); a local binding already named
  `AsyncResult` (adding a specifier would collide rather than resolve); and a
  namespace import, which has no specifier list to extend — `U.AsyncResult` is
  reachable, but rewriting to a qualified name is a different edit.

### Patch Changes

- 0ebb060: `prefer-async-result`: keep a types-only import types-only when the autofix adds
  the `AsyncResult` specifier.

  The fix inserted a bare `AsyncResult`, which is right for an
  `import type { … }` declaration but wrong for a value declaration carrying an
  inline `type` specifier. Adding a value specifier to
  `import { type Result } from "unthrown"` makes the whole declaration
  value-bearing, so under `verbatimModuleSyntax` TypeScript emits a runtime
  `import "unthrown"` the file never had — an autofix quietly adding a runtime
  dependency to a types-only module.

  The inserted specifier now carries its own `type` qualifier unless the
  declaration is already `import type { … }`, where repeating it would be a syntax
  error:

  ```ts
  // import type { Result } from "unthrown";
  import type { Result, AsyncResult } from "unthrown";

  // import { type Result } from "unthrown";
  import { type Result, type AsyncResult } from "unthrown";
  ```

## 5.1.0

### Minor Changes

- 829b9d3: Add the `no-unused-matcher` rule (#171) — and enable it in the `recommended`
  preset.

  A `…Cases` callback (the five error combinators, and `match`'s `errCases`
  handler) that never uses the matcher it was handed sources its exhaustiveness
  from a builder bound to some **other** value. The type checker cannot see it —
  the `ExhaustiveMatch` constraint is structural, and `noUnusedParameters` never
  fires because the parameter is not unused, it is simply never declared — and
  the runtime runs the borrowed builder against whatever value _it_ closed over:
  the wrong branch is chosen silently (a plausible wrong value, with the Err
  channel typing as fully handled), or nothing matches and the modeled error
  becomes a Defect.

  The rule reports a callback whose matcher parameter is absent (`() => …`) or
  never read, and — separately, to catch a trivial `void matcher` reference
  fronting for a foreign builder — any second unthrown / ts-pattern `match(...)`
  built in the callback's own body. Branch handlers (nested functions) stay free
  to match their payload. There is no escape hatch: a `…Cases` callback that
  does not use its matcher is never what you meant.

  Enabling the rule in `recommended` can surface new lint errors in an existing
  codebase; each one is a real bug of the shape above.

## 5.0.0

### Minor Changes

- e5e5a14: **`unthrown/no-ambiguous-error-type` now covers the matcher's
  `returnType<R>()` pin.** The rule read type _annotations_ only, so
  `mapErrCases((m) => m.returnType<unknown>().with(…))` — a type _argument_ —
  declared `E = unknown` with nothing to stop it, the very thing
  `Result<T, unknown>` is rejected for.

  It fires on a pin in a `mapErrCases` callback and nowhere else, because that is
  the only surface whose builder output _becomes_ the error channel. The others
  pin something that is not `E`, so an ambiguous pin there is legitimate and is
  deliberately left alone: `recoverErrCases` pins the **success** type,
  `tapErrCases`'s branch results are **discarded**, and `match`'s `errCases` (like
  a standalone `match`) folds to a plain **value**. `flatMapErrCases` /
  `flatTapErrCases` need no case of their own either — their output must be a
  `Result`, so a bare ambiguous pin does not type-check at all, and an ambiguous
  `E2` nested in a `Result<U, E2>` pin was already reported (the rule reads type
  arguments wherever they occur).

  The same ambiguity table applies (`unknown`, `any`, `Error`, `{}`, `object`,
  `void` and the primitives; `never` allowed, one ambiguous union member taints
  the whole pin). The pin is recognised on the callback's own matcher parameter
  via scope analysis, so a matcher first copied into another variable, or a
  callback declared elsewhere and passed by reference, is a documented syntactic
  miss — no false positives is the design priority.

- 53b5a61: **`unthrown/no-catch-all-pattern` ships in the `recommended` preset.**
  Enumerating every error case by name is unthrown's default position, not a
  stricter-than-the-library stance: `P._` (and its alias `P.any`) is an **escape
  hatch**, and the exhaustive matcher exists precisely so a failure mode cannot be
  absorbed unnamed. `no-throw` is the only rule left out of the preset.

  **What newly fails.** Any code enabling `recommended` gets an error on every
  `P._` / `P.any` written against a `P` imported from `unthrown` or `ts-pattern` —
  including the previously idiomatic uniform forms:

  ```ts
  result.mapErrCases((matcher) => matcher.with(P._, (e) => new ApiError(e)));
  result.match({
    ok,
    defect,
    errCases: (matcher) => matcher.with(P._, () => 500),
  });
  ```

  Name the cases instead, grouping the ones that share a handler — the matcher is
  exhaustive by construction, so the compiler tells you when the list is complete:

  ```ts
  result.mapErrCases((matcher) =>
    matcher
      .with(P.tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(
        P.tag("Conflict"),
        P.tag("DriverError"),
        (e) => new ApiError({ status: 500, error: e }),
      ),
  );
  ```

  **Two cases keep the catch-all.** A helper generic in `E`: no arm list can prove
  exhaustiveness against an unresolved type parameter, and only `P._` can, because
  it is a state transition to "nothing remains" rather than a subtraction from
  `E`. And an `E` that is a single type rather than a union of cases — a
  validator's issues array, say — where one arm _is_ the enumeration. Keep the
  catch-all there and silence the rule with a reason:

  ```ts
  const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
    result.mapErrCases((matcher) =>
      // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in `E`: no arm list can prove exhaustiveness
      matcher
        .returnType<ApiError>()
        .with(P._, (error) => new ApiError({ status: 500, error })),
    );
  ```

  To keep the previous behaviour, extend `recommended` and turn the rule off:
  `"unthrown/no-catch-all-pattern": "off"`.

- 8280f73: **Two new rules, and sharper resolution in the two carried over from 4.x.**

  - New `no-unhandled-result` (in the recommended preset): flags a bare
    statement dropping a `Result` — a call to an unthrown-imported producer, a
    facade-companion member (`Result.Ok(…)`, `AsyncResult.fromPromise(…)`), or a
    locally-declared function whose return annotation is unthrown's
    `Result`/`AsyncResult` — awaited or not. Deliberately syntactic; a dropped
    method chain (`r.map(f);`) is out of scope.
  - New `no-throw` (opt-in, not in the preset): reports every `throw` statement,
    pointing at `Err(...)`, `getOrThrow()`, and `fromSafeThrowable` — the rule
    the `getOrThrow` design has always referenced.
  - Both 4.x rules now resolve bindings by the **imported** name:
    `import { Result as R }` is caught, `import { Ok as Result }` no longer
    false-positives, and namespace-qualified `U.Result<…>` is flagged.
  - `no-ambiguous-error-type` also flags `void` in `E`, and a false negative
    under the real CLI is fixed: built-in globals (`Error`, `Promise`) resolve
    to a defs-less variable there, which silently disabled the bare-`Error`
    check.
  - `prefer-async-result` now withholds its autofix in function-**type** return
    positions too (the implementer may be an `async` function, where the rewrite
    cannot compile); it still reports.

- 4bf8ffc: **New rule `unthrown/no-catch-all-pattern`.** Bans the matcher catch-all `P._`
  (and its alias `P.any`) wherever `P` is imported from `unthrown` or `ts-pattern`,
  so every error case must be enumerated by name (`.with(P.tag("A"), P.tag("B"),
…, handler)`, grouping cases that share a handler).

  Resolves `P` by its imported name via scope analysis (a rename still fires; a
  decoy does not); a namespace import (`ns.P._`) is a documented limit. It is part
  of the `recommended` preset — see the accompanying entry for what that flags and
  for the two cases (a helper generic in `E`; an `E` that is a single type rather
  than a union) that keep the catch-all behind a targeted `oxlint-disable`.

- 2eca5a8: Add a sixth rule, `unthrown/prefer-ensure` — flags a `flatMap` whose success
  branch returns its own parameter untouched (`flatMap((x) => c ? Ok(x) : Err(e))`),
  a predicate wearing a bind costume. `ensure` names the intent and passes the
  _same_ `Ok` through where the `flatMap` form allocates a fresh one on every
  success (#166).

  Anchored on the constructors rather than the method name: the `Ok(...)` /
  `Err(...)` calls must resolve to `unthrown` imports (`OkAsync` / `ErrAsync` and
  the facade members `Result.Ok(...)` / `AsyncResult.Err(...)` included). It reads
  the callback's **return positions** and requires every one of them to be a
  constructor call, so a wrapped branch (`return wrap(c ? Ok(x) : Err(e))`) or a
  fall-through (`if (!x.ok) return Err(e); return refresh(x)`) is left alone. It
  stays quiet on a success branch that builds a new value, a destructured
  parameter, a body with no failure branch, a constructor nested in another
  callback, and a **reassigned** parameter — the one real false positive the shape
  admits, since the value reaching `Ok` is then not the one `ensure` would pass
  through.

  Report-only, and **opt-in** (not in the `recommended` preset). No autofix: a
  reversed ternary needs its condition negated, and `ensure`'s boolean form
  requires a `boolean` predicate where a truthiness guard is a perfectly good
  `flatMap` condition. And unlike every preset rule, the shape it flags violates no
  thesis — it is correct code with a better name available.

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- e43d44e: Update `no-catch-all-pattern`'s diagnostic and documentation to spell the
  recommended form as `.with(P.tag("A"), P.tag("B"), …, handler)`, following
  core's move of the `tag` pattern constructor onto the `P` namespace. No rule
  behaviour, name, or option changed — only the guidance text a developer reads
  when the rule fires.
- 92c848b: Raise the `oxlint` peerDependency floor from `^1.69.0` to `^1.74.0`, matching
  the `@oxlint/plugins` runtime the rules are built against — a host older than
  the plugin runtime was never a supported combination.
- 0c5e333: Restore the `oxlint` peerDependency floor to `^1.69.0`, undoing the `^1.74.0`
  raise shipped in `5.0.0-beta.10`. That raise was mechanical — it synced the peer
  to the `@oxlint/plugins` version the package builds against, not to a host API
  the rules actually need — and beta.10's plugin bundle is byte-identical to
  beta.9's apart from a dropped sourcemap comment.

  The rules only ever touch `context.report` (with `fix`), `context.sourceCode`,
  `getScope`, and `defineConfig` from `oxlint`; all five rules and the
  `prefer-async-result` autofix were re-verified against an `oxlint@1.69.0` host.

  The tighter range was expensive downstream: under `strictPeerDependencies` it
  failed installs outright, and satisfying it cascaded into `oxlint@1.74.0` →
  `oxlint-tsgolint@0.24.0`, dragging a lint _and_ type-check engine upgrade across
  every consuming project for a packaging-only release.

  The peer floor now names the oldest host the rules are verified on, decoupled
  from the `@oxlint/plugins` dependency, with a regression test guarding the
  decoupling.

## 5.0.0-beta.12

### Minor Changes

- 2eca5a8: Add a sixth rule, `unthrown/prefer-ensure` — flags a `flatMap` whose success
  branch returns its own parameter untouched (`flatMap((x) => c ? Ok(x) : Err(e))`),
  a predicate wearing a bind costume. `ensure` names the intent and passes the
  _same_ `Ok` through where the `flatMap` form allocates a fresh one on every
  success (#166).

  Anchored on the constructors rather than the method name: the `Ok(...)` /
  `Err(...)` calls must resolve to `unthrown` imports (`OkAsync` / `ErrAsync` and
  the facade members `Result.Ok(...)` / `AsyncResult.Err(...)` included). It reads
  the callback's **return positions** and requires every one of them to be a
  constructor call, so a wrapped branch (`return wrap(c ? Ok(x) : Err(e))`) or a
  fall-through (`if (!x.ok) return Err(e); return refresh(x)`) is left alone. It
  stays quiet on a success branch that builds a new value, a destructured
  parameter, a body with no failure branch, a constructor nested in another
  callback, and a **reassigned** parameter — the one real false positive the shape
  admits, since the value reaching `Ok` is then not the one `ensure` would pass
  through.

  Report-only, and **opt-in** (not in the `recommended` preset). No autofix: a
  reversed ternary needs its condition negated, and `ensure`'s boolean form
  requires a `boolean` predicate where a truthiness guard is a perfectly good
  `flatMap` condition. And unlike every preset rule, the shape it flags violates no
  thesis — it is correct code with a better name available.

## 5.0.0-beta.11

### Patch Changes

- 0c5e333: Restore the `oxlint` peerDependency floor to `^1.69.0`, undoing the `^1.74.0`
  raise shipped in `5.0.0-beta.10`. That raise was mechanical — it synced the peer
  to the `@oxlint/plugins` version the package builds against, not to a host API
  the rules actually need — and beta.10's plugin bundle is byte-identical to
  beta.9's apart from a dropped sourcemap comment.

  The rules only ever touch `context.report` (with `fix`), `context.sourceCode`,
  `getScope`, and `defineConfig` from `oxlint`; all five rules and the
  `prefer-async-result` autofix were re-verified against an `oxlint@1.69.0` host.

  The tighter range was expensive downstream: under `strictPeerDependencies` it
  failed installs outright, and satisfying it cascaded into `oxlint@1.74.0` →
  `oxlint-tsgolint@0.24.0`, dragging a lint _and_ type-check engine upgrade across
  every consuming project for a packaging-only release.

  The peer floor now names the oldest host the rules are verified on, decoupled
  from the `@oxlint/plugins` dependency, with a regression test guarding the
  decoupling.

## 5.0.0-beta.10

### Patch Changes

- 92c848b: Stop shipping sourcemaps and declaration maps: `files: ["dist"]` excludes
  `src/`, so the published maps were dead-ends (silently broken go-to-definition
  and stack mapping). Each package now sets `declarationMap: false`; consumers
  land on the fully TSDoc'd `.d.ts` instead, and tarballs shrink.
- 92c848b: Raise the `oxlint` peerDependency floor from `^1.69.0` to `^1.74.0`, matching
  the `@oxlint/plugins` runtime the rules are built against — a host older than
  the plugin runtime was never a supported combination.

## 5.0.0-beta.9

### Patch Changes

- e43d44e: Update `no-catch-all-pattern`'s diagnostic and documentation to spell the
  recommended form as `.with(P.tag("A"), P.tag("B"), …, handler)`, following
  core's move of the `tag` pattern constructor onto the `P` namespace. No rule
  behaviour, name, or option changed — only the guidance text a developer reads
  when the rule fires.

## 5.0.0-beta.8

### Minor Changes

- 53b5a61: **`unthrown/no-catch-all-pattern` ships in the `recommended` preset.**
  Enumerating every error case by name is unthrown's default position, not a
  stricter-than-the-library stance: `P._` (and its alias `P.any`) is an **escape
  hatch**, and the exhaustive matcher exists precisely so a failure mode cannot be
  absorbed unnamed. `no-throw` is the only rule left out of the preset.

  **What newly fails.** Any code enabling `recommended` gets an error on every
  `P._` / `P.any` written against a `P` imported from `unthrown` or `ts-pattern` —
  including the previously idiomatic uniform forms:

  ```ts
  result.mapErrCases((matcher) => matcher.with(P._, (e) => new ApiError(e)));
  result.match({
    ok,
    defect,
    errCases: (matcher) => matcher.with(P._, () => 500),
  });
  ```

  Name the cases instead, grouping the ones that share a handler — the matcher is
  exhaustive by construction, so the compiler tells you when the list is complete:

  ```ts
  result.mapErrCases((matcher) =>
    matcher
      .with(tag("NotFound"), () => new ApiError({ status: 404 }))
      .with(
        tag("Conflict"),
        tag("DriverError"),
        (e) => new ApiError({ status: 500, error: e }),
      ),
  );
  ```

  **Two cases keep the catch-all.** A helper generic in `E`: no arm list can prove
  exhaustiveness against an unresolved type parameter, and only `P._` can, because
  it is a state transition to "nothing remains" rather than a subtraction from
  `E`. And an `E` that is a single type rather than a union of cases — a
  validator's issues array, say — where one arm _is_ the enumeration. Keep the
  catch-all there and silence the rule with a reason:

  ```ts
  const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
    result.mapErrCases((matcher) =>
      // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in `E`: no arm list can prove exhaustiveness
      matcher
        .returnType<ApiError>()
        .with(P._, (error) => new ApiError({ status: 500, error })),
    );
  ```

  To keep the previous behaviour, extend `recommended` and turn the rule off:
  `"unthrown/no-catch-all-pattern": "off"`.

## 5.0.0-beta.7

### Minor Changes

- e5e5a14: **`unthrown/no-ambiguous-error-type` now covers the matcher's
  `returnType<R>()` pin.** The rule read type _annotations_ only, so
  `mapErrCases((m) => m.returnType<unknown>().with(…))` — a type _argument_ —
  declared `E = unknown` with nothing to stop it, the very thing
  `Result<T, unknown>` is rejected for.

  It fires on a pin in a `mapErrCases` callback and nowhere else, because that is
  the only surface whose builder output _becomes_ the error channel. The others
  pin something that is not `E`, so an ambiguous pin there is legitimate and is
  deliberately left alone: `recoverErrCases` pins the **success** type,
  `tapErrCases`'s branch results are **discarded**, and `match`'s `errCases` (like
  a standalone `match`) folds to a plain **value**. `flatMapErrCases` /
  `flatTapErrCases` need no case of their own either — their output must be a
  `Result`, so a bare ambiguous pin does not type-check at all, and an ambiguous
  `E2` nested in a `Result<U, E2>` pin was already reported (the rule reads type
  arguments wherever they occur).

  The same ambiguity table applies (`unknown`, `any`, `Error`, `{}`, `object`,
  `void` and the primitives; `never` allowed, one ambiguous union member taints
  the whole pin). The pin is recognised on the callback's own matcher parameter
  via scope analysis, so a matcher first copied into another variable, or a
  callback declared elsewhere and passed by reference, is a documented syntactic
  miss — no false positives is the design priority.

## 5.0.0-beta.6

### Minor Changes

- 4bf8ffc: **New opt-in rule `unthrown/no-catch-all-pattern`.** Bans the ts-pattern
  catch-all `P._` (and its alias `P.any`) wherever `P` is imported from `unthrown`
  or `ts-pattern`, so every error case must be enumerated by name
  (`.with(tag("A"), tag("B"), …, handler)`, grouping cases that share a handler).

  It is **stricter than unthrown's own default** — the library documents `P._` as
  the sanctioned catch-all — so, like `no-throw`, it stays out of the `recommended`
  preset and is enabled explicitly. A deliberate wildcard carries a targeted
  `oxlint-disable`. Resolves `P` by its imported name via scope analysis (a rename
  still fires; a decoy does not); a namespace import (`ns.P._`) is a documented
  limit.

## 5.0.0-beta.5

## 5.0.0-beta.4

## 5.0.0-beta.3

## 5.0.0-beta.2

## 5.0.0-beta.1

### Minor Changes

- 8280f73: **Two new rules, and sharper resolution in the existing two.**

  - New `no-unhandled-result` (in the recommended preset): flags a bare
    statement dropping a `Result` — a call to an unthrown-imported producer, a
    facade-companion member (`Result.Ok(…)`, `AsyncResult.fromPromise(…)`), or a
    locally-declared function whose return annotation is unthrown's
    `Result`/`AsyncResult` — awaited or not. Deliberately syntactic; a dropped
    method chain (`r.map(f);`) is out of scope.
  - New `no-throw` (opt-in, not in the preset): reports every `throw` statement,
    pointing at `Err(...)`, `getOrThrow()`, and `fromSafeThrowable` — the rule
    the `getOrThrow` design has always referenced.
  - Both existing rules now resolve bindings by the **imported** name:
    `import { Result as R }` is caught, `import { Ok as Result }` no longer
    false-positives, and namespace-qualified `U.Result<…>` is flagged.
  - `no-ambiguous-error-type` also flags `void` in `E`, and a false negative
    under the real CLI is fixed: built-in globals (`Error`, `Promise`) resolve
    to a defs-less variable there, which silently disabled the bare-`Error`
    check.
  - `prefer-async-result` now withholds its autofix in function-**type** return
    positions too (the implementer may be an `async` function, where the rewrite
    cannot compile); it still reports.

## 5.0.0-beta.0

## 4.3.0

## 4.2.0

## 4.1.0

## 4.0.0

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

## 3.0.0

## 2.0.0

## 1.1.0

## 1.0.0

### Major Changes

- Aligned to the shared `1.0.0` version line: `@unthrown/oxlint` is now part of
  the fixed version group, so it releases in lockstep with `unthrown` and the
  other `@unthrown/*` packages. No functional changes — this is the package's
  first published version (the earlier `0.2.x` entries were never released to
  npm).

## 0.2.0

### Minor Changes

- 9bb4551: New oxlint plugin enforcing unthrown's conventions at lint time. Two rules:
  `no-ambiguous-error-type` (the `E` in `Result<T, E>` / `AsyncResult<T, E>` must
  be a concrete domain error — no `unknown`/`any`/`Error`/`{}`/primitives;
  Thesis #1) and `prefer-async-result` (prefer `AsyncResult<T, E>` over
  `Promise<Result<T, E>>`, autofixable). Both resolve the import source via scope
  analysis, so they only fire on unthrown's own types. Ships a `recommended`
  preset. Built on oxlint's JS-plugin API (`@oxlint/plugins`); `oxlint` is a peer
  dependency.
