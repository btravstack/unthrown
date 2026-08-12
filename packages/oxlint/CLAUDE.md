# @unthrown/oxlint

Package-specific spec for `packages/oxlint`. The cross-cutting rules — the five
theses, the load-bearing runtime invariants, the public surface and the
internal design — live in the root [`CLAUDE.md`](../../CLAUDE.md) and apply
here too.

An oxlint **JS plugin**, peerDep
`oxlint`, dep `@oxlint/plugins`; ships **six rules**: `no-ambiguous-error-type`
— enforces Thesis #1 against `unknown`/`any`/`Error`/`{}` **and the primitive
keywords** (`void` included) in `E`, both in a `Result`/`AsyncResult` type
**annotation** and in the matcher's `returnType<R>()` **pin** — the latter only
inside a `mapErrCases` callback, the one surface whose builder output _becomes_
`E`; `recoverErrCases` (success type), `tapErrCases` (discarded) and `match`
(folded value) are deliberately left alone, and the flat pair needs no case of
its own (a bare ambiguous pin does not type-check there, and a nested
`Result<U, E2>` pin is already read by the annotation check, which sees type
arguments wherever they occur). Recognised on the callback's own matcher
parameter via scope analysis — a matcher copied to another variable, or a
callback passed by reference, is a documented miss; `prefer-async-result` (reports
`Promise<Result<T, E>>` in favour of `AsyncResult<T, E>`; the autofix **adds
the `AsyncResult` specifier** to an existing `unthrown` import when the name
is not already in scope — otherwise the rule would go unfixed in its most
common case, a file that imports `Result` and so trips the rule without ever
having needed `AsyncResult` — anchoring the insertion on the **last
`ImportSpecifier`** so it is indifferent to spacing and to per-specifier
`type` qualifiers. It withholds the fix on an `async` function's return
annotation **and in function-type
return positions** — either must stay a native `Promise` at the
implementation, so the fix would not compile — and also when the name
`AsyncResult` is already bound to something else (adding a specifier would
collide) or when there is no specifier list to extend, which in practice
means a **namespace import**: `U.AsyncResult` is reachable, but rewriting to
a qualified name is a different edit. A file with no `unthrown` import at all
is not reachable here — a `Result` that is not unthrown's does not trip the
rule in the first place); `no-unhandled-result` (in the
recommended preset — flags a bare `ExpressionStatement` dropping a `Result`:
a call to an unthrown-imported producer or facade-companion member, or to a
locally-declared function whose return annotation is unthrown's
`Result`/`AsyncResult`, awaited or not; deliberately syntactic — a dropped
method _chain_ like `r.map(f);` is type-dependent and out of scope); and
`no-catch-all-pattern` (**in the recommended preset** — reports the catch-all
`P._` — plus ts-pattern's `P.any` alias, kept because the rule also covers a
`P` imported straight from there — where `P` is imported from `unthrown` or
`ts-pattern`, so every error case must be enumerated by name; this **states
the library's own default** (Thesis #5: `P._` is an escape hatch, not the
sanctioned catch-all), and the sites that must keep the wildcard — a helper
generic in `E`, or an `E` that is a single type rather than a union of
cases — carry a targeted `oxlint-disable` with a reason);
`no-unused-matcher` (**in the recommended preset** — the other way through
the door `no-catch-all-pattern` guards (#171): a `…Cases` callback — the five
error combinators, plus `match`'s `errCases` handler — whose matcher
parameter is absent or never read sources its exhaustiveness from a builder
bound to some **other** value, which the structural `ExhaustiveMatch`
constraint accepts and the runtime runs against whatever that builder closed
over — the wrong branch chosen silently, or a `NonExhaustiveError` turning
the modeled error into a Defect; the rule also reports a second unthrown /
ts-pattern `match(...)` call in the callback's **own** body (catching a
trivial `void matcher` reference fronting for a foreign builder — reported
only when the parameter is otherwise used, so one fault yields one report),
while **nested functions are skipped** — a branch handler matching a payload
field (`.with(P.tag("A"), (e) => match(e.code)…)`) is legitimate; keyed on
the `…Cases` method names alone (unthrown's own coinage — no receiver
typing), a callback passed by reference is a documented miss, and there is
deliberately **no escape hatch**: a `…Cases` callback that does not use its
matcher is never what you meant); and
`no-get-or-throw` (**the one opt-in** — reports
`getOrThrow()`, matched as a **zero-argument** member call so Effect's
one-argument `Option.getOrThrow(o)` is untouched; a computed access and a
detached reference are documented misses. It throws the modeled error,
ending errors-as-values at the last step; the replacement is
`recoverErrCases` + `get`. Deliberately **option-free**: `getOrThrow()` is
right in a test, and oxlint's own `overrides` already exempts a test glob —
which is also why it stays out of the preset, being the one rule an existing
suite fails until configured).
Purely syntactic AST rules. Most resolve bindings via scope analysis keyed
by the **imported** name (renamed and namespace imports resolve; alias
indirection like `type E = unknown` is a documented limit), so they only
fire on unthrown's `Result`. A few are keyed on a **name or shape** instead,
unthrown's own coinage rather than an import:
`no-get-or-throw` matches a zero-argument `.getOrThrow()` member call;
`no-unused-matcher` is keyed on the `…Cases` method names alone; and the
`returnType<R>()` pin (inside `no-ambiguous-error-type`) is anchored on that
call on a `mapErrCases` callback's own matcher parameter. No TypeDoc API
page; documented in the Linting guide.
Tested with oxlint's `RuleTester` from `oxlint/plugins-dev`.
The **`oxlint` peer floor (`^1.69.0`) is deliberately decoupled from the
`@oxlint/plugins` dependency** — it names the oldest _host_ the rules were
verified to run on, not the plugin-utils version the package happens to build
against. Slaving the two ratchets the floor on every bot bump and drags
consumers through an oxlint + `oxlint-tsgolint` engine upgrade for a
packaging-only release (#163). Raise it only when a rule starts using a host
API that needs it, and name that API in the changeset; the decoupling is
guarded by a test in `index.test.ts`.
