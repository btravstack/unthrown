# Lint your codebase

> **How-to.** [`@unthrown/oxlint`](https://github.com/btravstack/unthrown/tree/main/packages/oxlint)
> is an [oxlint](https://oxc.rs/docs/guide/usage/linter) plugin that turns
> unthrown's theses into automated checks the type system can't enforce on its
> own — a lazy `E`, a dropped `Result`, a blanket `P._`, an ignored matcher, a
> raw `throw`, a thrown-away error channel.

```sh
pnpm add -D @unthrown/oxlint oxlint
```

## Set up

Register the plugin and turn its rules on in your `.oxlintrc.json`:

```json
{
  "jsPlugins": [{ "name": "unthrown", "specifier": "@unthrown/oxlint" }],
  "rules": {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/no-unused-matcher": "error",
    "unthrown/prefer-async-result": "error",
    "unthrown/no-throw": "error",
    "unthrown/no-get-or-throw": "error",
    "unthrown/no-catch-all-pattern": "error"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.spec.ts"],
      "rules": { "unthrown/no-get-or-throw": "off" }
    }
  ]
}
```

The default export also exposes a `recommended` preset — an oxlint config that
registers the plugin and enables `no-ambiguous-error-type`, `no-async-result-race`,
`no-unhandled-result`, `no-unused-matcher`, `prefer-async-result`, and
`no-catch-all-pattern`
(`no-throw` and `no-get-or-throw` are the two explicit opt-ins) — for setups
that build their config programmatically
(`import unthrown from "@unthrown/oxlint"` → `unthrown.recommended`).

`oxlint` is a peer dependency; JS plugins require oxlint ≥ 1.69.

## The rules

### `unthrown/no-ambiguous-error-type` {#no-ambiguous-error-type}

The `E` in `Result<T, E>` / `AsyncResult<T, E>` should name the **anticipated**
domain failures — not "anything went wrong". This flags the catch-all error types:

```ts
import type { Result } from "unthrown";

type A = Result<User, unknown>; // ✗ flagged
type B = Result<User, Error>; // ✗ flagged
type C = Result<User, {}>; // ✗ flagged
type D = Result<User, void>; // ✗ flagged

type E = Result<User, NotFound>; // ✓
type F = Result<User, "not_found" | "denied">; // ✓
type G = Result<User, never>; // ✓ — an intentionally error-free result
```

The whole point of the [defect channel](../explanation/the-defect-channel) is that
bugs **don't** belong in `E`; this rule keeps them out. It is purely syntactic — it
sees the type argument as written and does not chase aliases (an alias resolving to
`unknown` is not followed). Name your error types honestly and this limit never
bites.

The same table applies to the matcher's
[`returnType<R>()`](../explanation/exhaustive-error-matching#declaring-the-output-returntype-r)
pin — but **only where the pin declares the error channel**, which is inside a
`mapErrCases` callback: there the builder's output _becomes_ the new `E`.

```ts
// result: Result<User, NotFound>
result.mapErrCases((m) =>
  m.returnType<unknown>().with(P.tag("NotFound"), (e) => e),
); // ✗ flagged — this is E
result.mapErrCases((m) =>
  m.returnType<ApiError>().with(P.tag("NotFound"), () => new ApiError()),
); // ✓

result.recoverErrCases((m) =>
  m.returnType<unknown>().with(P.tag("NotFound"), (e) => e),
); // ✓ — the SUCCESS type
result.tapErrCases((m) => m.returnType<void>().with(P.tag("NotFound"), log)); // ✓ — discarded
result.match({
  ok,
  defect,
  errCases: (m) => m.returnType<unknown>().with(P.tag("NotFound"), id),
}); // ✓ — a folded value
```

`flatMapErrCases` / `flatTapErrCases` need no separate check: their builder output
must be a `Result`, so a _bare_ ambiguous pin does not type-check at all, and an
ambiguous `E2` **nested** in a `Result<U, E2>` pin is caught by the same rule (it
reads type arguments wherever they occur, annotation or not).

Two syntactic limits, deliberate — the pin is recognised on the callback's own
matcher parameter, so a matcher first copied into another variable
(`const b = m; b.returnType<unknown>()`), or a callback declared elsewhere and
passed by reference (`result.mapErrCases(handler)`), is not seen. Writing the pin
where the matcher is handed to you keeps the check honest. This is also the one
check anchored on shape rather than on an import: a `returnType<R>()` call on the
matcher parameter of a `mapErrCases` callback is unthrown's own vocabulary, so no
`Result` binding needs resolving.

### `unthrown/prefer-async-result` {#prefer-async-result}

Prefer `AsyncResult<T, E>` over `Promise<Result<T, E>>`. A raw `Promise<Result>`
can still **reject**, reintroducing the throw channel that `AsyncResult` is designed
to eliminate.

```ts
type Slow = Promise<Result<User, NotFound>>; // ✗ → AsyncResult<User, NotFound>
```

Autofixable. When `AsyncResult` is not already in scope, the fix **adds the
specifier** to your existing `unthrown` import rather than leaving you to do it
by hand:

```ts
// before  ─ `--fix` ─▶  after
import type { Result } from "unthrown";
import type { Result, AsyncResult } from "unthrown";
```

That covers the common case: a file imports `Result`, which is what trips the
rule, and has never needed `AsyncResult`.

The added specifier is `type`-qualified unless the declaration is already
`import type { … }`, so a types-only import stays types-only — under
[`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax)
a bare specifier would make the declaration value-bearing and emit a runtime
import the file never had:

```ts
// before  ─ `--fix` ─▶  after
import { type Result } from "unthrown";
import { type Result, type AsyncResult } from "unthrown";
```

The fix is withheld where applying it would not compile or would not mean what it
says — the rule still reports:

| Situation                                            | Why no fix                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| An `async` function's own return-type annotation     | An `async` function must return a native `Promise`               |
| The return position of a function **type**           | The implementer may be an `async` function                       |
| `AsyncResult` already names something else in scope  | Adding the specifier would collide, not resolve                  |
| A namespace import (`import * as U from "unthrown"`) | No specifier list to extend; `U.AsyncResult` is a different edit |

### `unthrown/no-unhandled-result` {#no-unhandled-result}

An errors-as-values `Result` only works if the value is actually **held**. This
rule flags a `Result` / `AsyncResult` dropped on the floor — a bare
expression-statement call to something known to produce one:

```ts
import { Err, fromPromise, Result } from "unthrown";

Err("denied"); // ✗ dropped — the error channel is silently discarded
await fromPromise(p, qualify); // ✗ still dropped — awaiting yields a Result, then discards it
Result.Ok(1); // ✗ facade companion calls count too
saveUser(u); // ✗ if saveUser is locally declared as `(): AsyncResult<…>`

const r = Err("denied"); // ✓ bound
return fromPromise(p, qualify); // ✓ returned
```

It recognises, purely syntactically: the unthrown-imported producers (`Ok`, `Err`,
`OkAsync`, `ErrAsync`, `Do`, the `from*` boundaries, the `all*` aggregates, renamed
imports included); the facade companions (`Result.Ok(...)`); and a
**locally-declared** function whose return annotation is unthrown's `Result` /
`AsyncResult`. A dropped method _chain_ (`r.map(f);`) or a function whose
`Result`-ness lives behind an imported declaration needs the type checker and is
out of scope — no false positives is the design priority.

### `unthrown/no-async-result-race` {#no-async-result-race}

An `AsyncResult` is **eager** — constructing it starts the work. So the
readable spelling of a sequence, each step in its own `const` and chained
afterwards, is a race, and a silent one: it still type-checks and still
returns a `Result`; the steps just run concurrently. This rule flags the later
construction while an earlier sibling binding in the same statement list is
still unconsumed:

```ts
import { OkAsync, allAsync } from "unthrown";

const a = stepA(); // work already in flight (stepA declared `(): AsyncResult<…>`)
const b = stepB(); // ✗ starts concurrently with `a` — reads as a sequence, runs as a race
return a.flatMap(() => b);

const r = stepA().flatMap(() => stepB()); // ✓ chained — one statement, one sequence
const seq = await stepA(); // ✓ consumed before the next starts
return allAsync([stepA(), stepB()]); // ✓ concurrency, stated as such
```

A construction is recognised purely syntactically: the async producers
(`OkAsync`, `ErrAsync`, `DoAsync`, `fromPromise`, `fromSafePromise`,
`fromExecutor`, `allAsync`, `allFromDictAsync`), the `AsyncResult` companion's
members, a chain rooted in any of those, a locally-declared function whose
return annotation is unthrown's `AsyncResult`, or a declarator annotated with
it — the annotation is the opt-in that catches a service method call the
syntax alone cannot resolve, and an unannotated one is the documented miss.

Consumption is a **direct** reference: a read inside a nested function is
deferred, which is exactly how `a.flatMap(() => b)` touches `b` without
sequencing its already-started work. Two bindings first consumed directly in
one statement (`allAsync([a, b])`) are the sanctioned join, not a race.
Manual start-both-await-both concurrency **is** reported — its sanctioned
spelling is `allAsync([…])` in one statement, and a site that genuinely wants
the manual form carries a targeted `oxlint-disable` with a reason.

### `unthrown/no-throw` {#no-throw}

**An opt-in rule** — not part of the `recommended` preset, because it bans a
core language statement. For codebases committed to errors-as-values
end-to-end, it closes the loop: ordinary errors are _returned_, so a raw
`throw` is either a modeled failure in disguise or an unmodeled one that
belongs to the defect channel's machinery.

```ts
function parse(input: string) {
  if (!input) throw new Error("empty"); // ✗ — return Err(new EmptyInput()) instead
}
```

Every sanctioned form is a call, not a statement, so the rule stays clean on
them: a modeled failure → `return Err(...)`; a failure that is genuinely
unmodeled here → fold it into the defect channel with
[`recoverErrCases`](../reference/combinators#the-error-channel) +
[`get`](../reference/combinators#eliminating-a-result); a known-technical
precondition throw → keep it in a plain helper wrapped **once** with
[`fromSafeThrowable`](./qualify-a-boundary); a genuinely deliberate remaining
`throw` — a framework that reads the thrown value, say — → a targeted
`// oxlint-disable-next-line unthrown/no-throw -- <reason>` comment. The rule
has no options and no autofix — the disable comment is the escape hatch.

::: warning Removed in 5.4.0, restored in 5.5.0
This rule was deleted in `@unthrown/oxlint` 5.4.0 on the reasoning that a
bare `ThrowStatement` report belongs in a `no-restricted-syntax` entry.
oxlint does not implement `no-restricted-syntax`, so that left a codebase
banning `throw` with nothing — and because oxlint refuses to parse a config
naming an unknown rule, the upgrade failed the _whole_ lint run rather than
just the rule ([#227](https://github.com/btravstack/unthrown/issues/227)).
5.5.0 restores it, unchanged and still opt-in.
:::

### `unthrown/no-get-or-throw` {#no-get-or-throw}

**An opt-in rule** — the other half of `no-throw`. `getOrThrow()` extracts `T`
but **throws the modeled error as-is** on `Err`, which abandons
errors-as-values at the very last step: a caller of the enclosing function sees
a throw, not a channel, and every guarantee the exhaustive matcher bought
upstream is gone.

```ts
const user = findUser(id).getOrThrow(); // ✗ flagged
```

Fold the error channel instead. `recoverErrCases` empties `E`, so `get()`
compiles, and a case routed to the injected `defect(...)` panics with its
original cause — with every case still named:

```ts
const user = findUser(id)
  .recoverErrCases(
    (matcher, defect) =>
      matcher
        .with(P.tag("NotFound"), () => anonymousUser) // ✓ recovered to a value
        .with(P.tag("Denied"), (e) => defect(e)), //    ✓ genuinely unmodeled here
  )
  .get();
```

The rule matches a **zero-argument** `.getOrThrow()` member call, so Effect's
one-argument `Option.getOrThrow(o)` / `Either.getOrThrow(e)` are left alone. A
computed access (`r["getOrThrow"]()`) and a detached reference
(`const f = r.getOrThrow`) are documented misses — both are deliberate
evasions, and the `oxlint-disable` comment is the sanctioned escape.

#### Keeping it in tests

`getOrThrow()` is the right tool in a test, where "this `Result` had better be
`Ok`" _is_ the assertion and a throw is the correct failure mode — though
[`@unthrown/vitest`](./test-with-vitest)'s matchers (`toBeOk`, `toBeOkWith`,
`toBeErrTagged`, `toBeDefect`, …) are usually the better tool for the
assertion itself; reach for `getOrThrow()` when you just need the value. The
rule has no `allow` option on purpose — oxlint's own `overrides` already does
this, and works with whatever glob your tests use:

```json
{
  "rules": { "unthrown/no-get-or-throw": "error" },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.spec.ts"],
      "rules": { "unthrown/no-get-or-throw": "off" }
    }
  ]
}
```

#### Stacking with `no-throw`

The two rules close different doors, and enabling both closes the room:

|                           | `no-throw` off  | `no-throw` on                                                |
| ------------------------- | --------------- | ------------------------------------------------------------ |
| **`no-get-or-throw` off** | escapes: both   | escape: `getOrThrow()`                                       |
| **`no-get-or-throw` on**  | escape: `throw` | **no lint-clean escape — fold with `recoverErrCases`+`get`** |

### `unthrown/no-catch-all-pattern` {#no-catch-all-pattern}

Enumerating every error case is the library's
[default position](../explanation/exhaustive-error-matching#enumerate-the-cases-the-wildcard-is-the-exception),
so this rule is part of the `recommended` preset. It bans the universal
catch-all `P._` — and ts-pattern's `P.any` alias — wherever `P` is imported from
`unthrown` or `ts-pattern` — a wildcard makes _any_ match exhaustive, which means it keeps
compiling as `E` grows and silently absorbs each new case.

```ts
result.mapErrCases((m) => m.with(P._, (e) => e)); // ✗ — the catch-all
// ✓ — enumerate every case; group cases that share a handler
result.mapErrCases((m) =>
  m.with(P.tag("NotFound"), P.tag("Forbidden"), (e) => e),
);
```

Because a matched builder must still be exhaustive, removing `P._` makes the
compiler point at each unhandled case until every one is named — the rule and the
type checker push the same way.

`P._` remains a legitimate **escape hatch** in exactly two cases, and the rule
**exempts them itself when the file proves them**: a helper still **generic in
`E`**, where no list of tag arms can prove coverage and the catch-all is the
only form that compiles; and an **`E` that is a single non-union type**, where
one arm _is_ the enumeration. The proof is syntactic — the matcher is traced to
its receiver, and the receiver to an in-file `Result` / `AsyncResult`
annotation (a variable or parameter annotation, or the return annotation of a
function declared in the same file). When the annotated `E` is not a union
(in-file aliases are seen through; an _imported_ named type counts as the
single abstraction it names), nothing is reported:

```ts
function toPromise<T, E>(result: Result<T, E>): T {
  return result.match({
    ok: (value) => value,
    errCases: (matcher) =>
      matcher.with(P._, (error) => {
        // exempt: `result` is annotated `Result<T, E>` and `E` is a type parameter
        throw error;
      }),
    defect: (cause) => {
      throw cause;
    },
  });
}
```

Where no annotation is in reach — most commonly a receiver returned by a
function **imported from another module**, which per-file analysis cannot see —
the rule still reports, and the targeted disable comment remains the honest
escape hatch:

```ts
// oxlint-disable-next-line unthrown/no-catch-all-pattern -- E is SchemaIssues: one type, nothing to enumerate
errCases: (matcher) => matcher.with(P._, (issues) => abort(describe(issues))),
```

(Annotating the receiver in-file — `const parsed: Result<Env, SchemaIssues> =
readEnv()` — also lifts the proof into view and drops the comment.) The rule
has no options and no autofix. Where the helper needs no matcher at all, the
`isOk` / `isErr` / `isDefect` guards carry no exhaustiveness obligation and
need no disable comment.

### `unthrown/no-unused-matcher` {#no-unused-matcher}

`no-catch-all-pattern` guards the exhaustiveness contract against the wildcard;
this rule — also in the `recommended` preset — guards it from the other side. A
`…Cases` callback (the five error combinators, and `match`'s `errCases`
handler) that never uses the matcher it was handed sources its exhaustiveness
from a builder bound to some **other** value, and neither the type checker nor
the runtime can tell: the constraint on the callback's return is structural
(`ExhaustiveMatch`), so any exhaustive builder satisfies it, and
`noUnusedParameters` never fires because the parameter is not unused — it is
simply never declared.

```ts
// ✗ flagged — compiles clean, but the branch is chosen by `decoy`, not the error
const recovered = await source.recoverErrCases(() =>
  match(decoy)
    .with(P.tag("A"), () => "recovered as A")
    .with(P.tag("B"), () => "recovered as B"),
);

// ✓ the injected matcher is the only builder bound to the actual error
const recovered = await source.recoverErrCases((matcher) =>
  matcher.with(P.tag("A"), P.tag("B"), () => "recovered"),
);
```

The borrowed builder fails in one of two ways, neither diagnosable at the call
site: a branch matches the foreign value and a **plausible wrong value** comes
back (with the Err channel typing as fully handled), or nothing matches,
`.run()` throws `NonExhaustiveError`, and the modeled error becomes a
**Defect** — a deliberately non-retryable failure turned retryable.

The rule reports a callback whose matcher parameter is absent or never read,
and — separately, to catch a trivial reference like `void matcher` fronting for
a foreign builder — any second `match(...)` (unthrown's or ts-pattern's) built
in the callback's **own** body. Branch handlers are nested functions and stay
free to match their payload (`.with(P.tag("A"), (e) => match(e.code)…)` is that
inner value's ordinary match). There is no escape hatch and no autofix: a
`…Cases` callback that does not use its matcher is never what you meant.

## Import resolution

All the `Result`-aware rules resolve import bindings via scope analysis, through the
**imported** name — so a renamed import (`import type { Result as R } from
"unthrown"`) is still recognised, a decoy (`import { Ok as Result } from
"somewhere"`) is not, and a namespace import's qualified `U.Result` resolves too. A
`Result` from another library is left alone.

## Where to go next

- Why bugs must stay out of `E`: [The Defect Channel](../explanation/the-defect-channel).
- Why `AsyncResult` over `Promise<Result>`: [The async model](../explanation/async-model).
