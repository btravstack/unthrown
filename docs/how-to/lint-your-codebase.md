# Lint your codebase

> **How-to.** [`@unthrown/oxlint`](https://github.com/btravstack/unthrown/tree/main/packages/oxlint)
> is an [oxlint](https://oxc.rs/docs/guide/usage/linter) plugin that turns
> unthrown's theses into automated checks the type system can't enforce on its
> own — a lazy `E`, a dropped `Result`, a raw `throw`.

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
    "unthrown/prefer-async-result": "error",
    "unthrown/no-throw": "error",
    "unthrown/no-catch-all-pattern": "error"
  }
}
```

The default export also exposes a `recommended` preset — an oxlint config that
registers the plugin and enables `no-ambiguous-error-type`, `no-unhandled-result`,
and `prefer-async-result` (`no-throw` and `no-catch-all-pattern` stay explicit
opt-ins) — for setups that
build their config programmatically (`import unthrown from "@unthrown/oxlint"` →
`unthrown.recommended`).

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

### `unthrown/no-throw` {#no-throw}

**Opt-in** — not part of the `recommended` preset, because it bans a core language
statement. For codebases committed to errors-as-values end-to-end, it closes the
loop: ordinary errors are _returned_, so a raw `throw` is either a modeled failure
in disguise or an unmodeled one that belongs to the defect channel's machinery.

```ts
function parse(input: string) {
  if (!input) throw new Error("empty"); // ✗ — return Err(new EmptyInput()) instead
}
```

Every sanctioned form is a call, not a statement, so the rule stays clean on them: a
modeled failure → `return Err(...)`; extraction that must surface the modeled error
as a throw → [`getOrThrow()`](../reference/combinators#eliminating-a-result); a
known-technical precondition throw → keep it in a plain helper wrapped **once** with
[`fromSafeThrowable`](./qualify-a-boundary); a genuinely deliberate remaining
`throw` → a targeted `// oxlint-disable-next-line unthrown/no-throw -- <reason>`
comment. The rule has no options and no autofix — the disable comment is the escape
hatch.

### `unthrown/no-catch-all-pattern` {#no-catch-all-pattern}

**Opt-in** — not part of the `recommended` preset. It is **stricter than
unthrown's own default**: the library documents `P._` as the sanctioned
"handle everything else" branch, but some teams want _every_ error enumerated by
name, with no wildcard that could silently absorb a case the union grows later.
This rule enforces that stricter stance by banning the ts-pattern catch-all `P._`
(and its alias `P.any`) wherever `P` is imported from `unthrown` or `ts-pattern`.

```ts
result.mapErrCases((m) => m.with(P._, (e) => e)); // ✗ — the catch-all
// ✓ — enumerate every case; group cases that share a handler
result.mapErrCases((m) => m.with(tag("NotFound"), tag("Forbidden"), (e) => e));
```

Because a matched builder must still be exhaustive, removing `P._` makes the
compiler point at each unhandled case until every one is named — the rule and the
type checker push the same way. A deliberate wildcard carries a targeted
`// oxlint-disable-next-line unthrown/no-catch-all-pattern -- <reason>`.

## Import resolution

All the `Result`-aware rules resolve import bindings via scope analysis, through the
**imported** name — so a renamed import (`import type { Result as R } from
"unthrown"`) is still recognised, a decoy (`import { Ok as Result } from
"somewhere"`) is not, and a namespace import's qualified `U.Result` resolves too. A
`Result` from another library is left alone.

## Where to go next

- Why bugs must stay out of `E`: [The Defect Channel](../explanation/the-defect-channel).
- Why `AsyncResult` over `Promise<Result>`: [The async model](../explanation/async-model).
