# Glossary

> **Reference.** Short definitions of the terms used throughout the
> documentation. Each links to the page that explains it in depth.

**`Result<T, E>`**
: A discriminated union of three runtime states — `Ok<T>`, `Err<E>`, `Defect` —
intersected with the fluent method surface. `E` names only the _anticipated_
domain failures. See [Result & AsyncResult surface](./result-surface).

**`AsyncResult<T, E>`**
: The asynchronous counterpart of `Result<T, E>`, typed as
`Awaitable<Result<T, E>>`. Its internal promise never rejects; `await` collapses
it to a `Result`. See [The async model](../explanation/async-model).

**`Ok`**
: The success variant of a `Result`, carrying a value of type `T`.

**`Err`**
: The _modeled_ failure variant, carrying an error of type `E`. An `Err` is an
anticipated outcome your callers are expected to handle.

**`Defect`**
: The _unmodeled_ failure variant — a bug, a panic, an un-triaged rejection. It
is invisible to the type (never appears in `E`) and can only be observed by
`match`, `recoverDefect`, or the `tapDefect` / `tapFailure` observers. See
[The Defect Channel](../explanation/the-defect-channel).

**qualify**
: The mandatory function passed to `fromPromise` / `fromThrowable` that triages
each raw failure into a modeled error (which enters `E`) or `defect(cause)`
(which does not). It is synchronous, and its `Defect` arm is subtracted from `E`.
See [Qualification](../explanation/qualification).

**`defect` (the helper)**
: A helper _injected_ at every triage site — inside `qualify` and in each
error-match branch — that marks a cause as unmodeled. It is never imported;
there is no public `Defect` constructor.

**panic**
: What `get` / `getErr` / the `getOr*` family do on a `Defect`: they rethrow the
original cause with its original stack, rather than recovering it. `never` on the
error channel means the _modeled_ channel is empty, not that `get()` cannot
throw. See [The Defect Channel](../explanation/the-defect-channel#get-is-asymmetric).

**tagged error**
: The recommended error convention — a class extending `Error` with a `_tag`
discriminant, built with `TaggedError(tag)`. Core `Result` stays generic in `E`;
only the tag-aware utilities require `E extends { _tag: string }`. See
[Model errors](../how-to/model-errors).

**matcher**
: The built-in `match(error)` builder
handed to every error combinator's callback. You return it un-terminated; the
combinator runs `.exhaustive()`, so a missing case does not compile. See
[Exhaustive error matching](../explanation/exhaustive-error-matching).

**`P` / `tag(t)`**
: `P` is unthrown's pattern namespace (`P._`, `P.instanceOf`, `P.when`, `P.union`, `P.string`, `P.number`); `P._` is the
catch-all pattern. `tag(t)` is sugar for the `{ _tag: t }` pattern, narrowing to
a tagged variant and its payload.

**`Awaitable<R>`**
: A success-only thenable type — resolves to `R`, models no rejection channel.
`AsyncResult<T, E>` is `Awaitable<Result<T, E>>`.

**boundary**
: An edge of your program where untyped failure enters — a throwing function, a
rejecting promise, a nullable API. Each is crossed with a `from*` constructor
that forces qualification. See [Qualify a boundary](../how-to/qualify-a-boundary).

**combinator**
: Any method on the fluent surface (`map`, `flatMap`, `mapErrCases`, `tap`, …) that
transforms or observes a channel and returns another `Result` / `AsyncResult`. A
throw inside a combinator becomes a `Defect`.

**eliminator**
: A method that leaves the `Result` world — `match`, `get` / `getErr`, and the
`getOr*` family — folding or extracting a plain value.
