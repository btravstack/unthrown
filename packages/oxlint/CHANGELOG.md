# @unthrown/oxlint

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
      .with(tag("Conflict"), tag("DriverError"), (e) => new ApiError({ status: 500, error: e })),
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
      matcher.returnType<ApiError>().with(P._, (error) => new ApiError({ status: 500, error })),
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
