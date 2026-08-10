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
    "unthrown/prefer-ensure": "error",
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
registers the plugin and enables `no-ambiguous-error-type`, `no-unhandled-result`,
`no-unused-matcher`, `prefer-async-result`, and `no-catch-all-pattern`
(`prefer-ensure`, `no-throw` and `no-get-or-throw` are the three explicit
opt-ins) — for setups that build their config programmatically
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

Autofixable — except in two positions where it reports **without** a fix, because
the rewrite would not compile: an `async` function's own return-type annotation
(an `async` function must return a native `Promise`), and the return position of a
function **type** (the implementer may be an `async` function the rule can't see).

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

### `unthrown/prefer-ensure` {#prefer-ensure}

**An opt-in rule** — not part of the `recommended` preset. Every preset rule flags
a spelling unthrown considers _wrong_; this one flags correct code with a better
name available.

A `flatMap` whose success branch returns **its own parameter, untouched** is not a
bind — it is a predicate wearing a bind costume:

```ts
// ✗ flagged
.flatMap((user) => (user.active ? Ok(user) : Err(new Inactive({ id: user.id }))))

// ✓ the same gate, named
.ensure(
  (user) => user.active,
  (user) => new Inactive({ id: user.id }),
)
```

Beyond reading as the validation it is, [`ensure`](../reference/combinators#by-intent)
passes the **same** `Ok` through when the predicate holds, where the `flatMap` form
allocates a fresh one on every success. A body with several guards is several
`ensure`s, chained — the rule says so in its message.

The rule is anchored on the **constructors**, not on the method name: the
`Ok(...)` / `Err(...)` calls must resolve to `unthrown` imports (`OkAsync` /
`ErrAsync` and the facade members `Result.Ok(...)` / `AsyncResult.Err(...)`
included). It reads the callback's **return positions** — its expression body, or
every `return` in its block — and _every_ one of them must be a constructor call,
so a body doing anything else besides gating is left alone:

```ts
// ✓ not flagged — the branches are wrapped; the rewrite would drop `wrap`
.flatMap((x) => wrap(x.ok ? Ok(x) : Err("bad")));

// ✓ not flagged — the fall-through is work `ensure` can't express
.flatMap((x) => {
  if (!x.ok) return Err("bad");
  if (x.cached) return Ok(x);
  return refresh(x);
});
```

It stays quiet on everything else a gate is not, too — a success branch that
builds a new value (`Ok(user.profile)`), a destructured parameter, a body with no
failure branch, a constructor inside a nested callback, and — the one real false
positive the shape admits — a **reassigned** parameter:

```ts
// ✓ not flagged: the value reaching `Ok` is not the one `ensure` would pass through
.flatMap((x) => {
  x = normalize(x);
  return x.ok ? Ok(x) : Err("bad");
});
```

No autofix, deliberately: the rewrite is not mechanical. A reversed ternary
(`c ? Err(e) : Ok(x)`) needs its condition negated, and `ensure`'s boolean form
requires a `boolean` predicate — a truthiness guard like `x.name && x.count` is a
perfectly good `flatMap` condition and a type error as a predicate.

An **absence guard followed by a projection** is deliberately out of scope:

```ts
// ✓ not flagged — a bind that opens with a null check, not a gate
.flatMap((doc) => (doc === null ? Err(new NotFound({ id })) : Ok(project(doc))));
```

[`fromNullable`](./qualify-a-boundary) answers that shape as idiomatically as a
type-guard `ensure` does, so the rule declines to pick a winner.

### `unthrown/no-throw` {#no-throw}

**An opt-in rule** — not part of the `recommended` preset, because it bans a
core language statement. For codebases committed to errors-as-values end-to-end, it closes the
loop: ordinary errors are _returned_, so a raw `throw` is either a modeled failure
in disguise or an unmodeled one that belongs to the defect channel's machinery.

```ts
function parse(input: string) {
  if (!input) throw new Error("empty"); // ✗ — return Err(new EmptyInput()) instead
}
```

Every sanctioned form is a call, not a statement, so the rule stays clean on them: a
modeled failure → `return Err(...)`; a failure that is genuinely unmodeled here →
fold it into the defect channel with
[`recoverErrCases`](../reference/combinators#the-error-channel) +
[`get`](../reference/combinators#eliminating-a-result); a
known-technical precondition throw → keep it in a plain helper wrapped **once** with
[`fromSafeThrowable`](./qualify-a-boundary); a genuinely deliberate remaining
`throw` → a targeted `// oxlint-disable-next-line unthrown/no-throw -- <reason>`
comment. The rule has no options and no autofix — the disable comment is the escape
hatch.

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
catch-all `P._` (and its alias `P.any`) wherever `P` is imported from `unthrown`
or `ts-pattern` — a wildcard makes _any_ match exhaustive, which means it keeps
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

`P._` remains a legitimate **escape hatch**, and the rule expects you to say so
in place. Two cases are legitimate: a helper still **generic in `E`**, where no
list of tag arms can prove coverage and the catch-all is the only form that
compiles; and an **`E` that is a single type** rather than a union, where one
arm _is_ the enumeration. The first looks like this:

```ts
function toPromise<T, E>(result: Result<T, E>): T {
  return result.match({
    ok: (value) => value,
    errCases: (matcher) =>
      // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in E: no tag arm can prove coverage
      matcher.with(P._, (error) => {
        throw error;
      }),
    defect: (cause) => {
      throw cause;
    },
  });
}
```

The same targeted disable comment covers the other honest case: an `E` that is a
single type rather than a union, where one arm _is_ the enumeration. The rule has no options and no
autofix — the disable comment is the escape hatch. (Where the helper needs no
matcher at all, the `isOk` / `isErr` / `isDefect` guards carry no exhaustiveness
obligation and need no disable comment.)

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
