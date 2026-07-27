# Exhaustive error matching

> **Explanation.** This page explains _why_ the error combinators take a
> matcher instead of a plain callback, and why they carry a `*Cases`
> suffix (`mapErrCases`, `tapErrCases`, …) rather than a bare `map`/`tap`-style
> name. For the mechanics — the rules, the `P._` catch-all, the per-method
> signatures — see the [combinator reference](../reference/combinators#the-error-channel).

Errors-as-values only pays off if the values **can't be silently dropped**. On
the success channel that is easy — `T` is one type, so a `(value: T) => …`
callback is exactly right. On the error channel it is not, and closing that gap
is what shapes the entire error surface.

## The problem with a blanket error handler

`E` is a **union of possibilities**: `NotFound | Forbidden | RateLimited`. A
combinator that handed your callback the error _value_ directly —

```ts
(e) => wrap(e); // e: NotFound | Forbidden | RateLimited
```

— would keep compiling no matter how the union grows. Add a `PaymentDeclined` tag a
year later and this call site does not change, does not warn, does not fail. It
silently absorbs the new case. That is precisely the blanket handler
errors-as-values is supposed to eliminate: the whole reason to make failures
values is so the compiler forces you to _account for each one_.

## The solution: an exhaustive matcher, terminated for you

So the error combinators — `mapErrCases`, `flatMapErrCases`, `recoverErrCases`, `tapErrCases`,
`flatTapErrCases` — do not take a single callback. Their callback receives a
built-in **match builder** over the
error, and you **return the un-terminated builder**. The combinator calls
`.exhaustive()` itself:

```ts
db.reading.tryFindUniqueOrThrow({ where: { id } }).mapErrCases(
  (matcher, defect) =>
    matcher
      .with(tag("RecordNotFound"), () => new ReadingNotFoundException(id))
      .with(tag("DriverError"), (e) => defect(e.cause)), // deliberate defect — the tag leaves E
);
```

Because the combinator runs `.exhaustive()`, a match that misses a case **does
not compile** — there is no `.exhaustive()` to forget, and no `.otherwise()` to
smuggle in a fallback. The day you enrich the error channel — a new Prisma
P-code, a new oRPC code — **every site that consumes that channel lights up
red**, and you are forced to decide how the new case is handled exactly where the
decision belongs.

Each branch receives the narrowed variant _and_ an injected `defect` helper — the
same helper [`qualify`](./qualification) gets — so converting a case into a
defect (`defect(e.cause)`) is a sanctioned, in-line move, and its `Defect` arm is
subtracted from the outgoing `E` just like at a boundary.

## No identity on the error channel

A natural first instinct is that returning the matcher untouched must be a no-op:

```ts
result.mapErrCases((matcher) => matcher); // ⚠️ not an identity
```

It isn't. The combinator terminates the builder with `.exhaustive()`, and a
builder with **no `.with(…)` branch** is only exhaustive when the input has been
narrowed to `never` — i.e. when `E` is already `never`. That is the one case
where it type-checks, which is exactly what makes it a trap: it appears to work
on an error-free `Result`, then fails to compile the moment the channel carries a
real error. If it ever reaches runtime past a cast, `.exhaustive()` throws
`NonExhaustiveError`, which the [throw → defect](./the-defect-channel#throw-defect)
net turns into a `Defect`.

There is deliberately **no** identity on the error channel. Passing the error
through unchanged is a real decision with a real spelling:

- to _observe_ and pass through, use `tapErrCases` (an observer);
- to _re-emit_ every case unchanged, write the catch-all: `.with(P._, (e) => e)`.

`P._` is the sanctioned "handle everything else" branch — the explicit,
greppable replacement for the old blanket callback. It makes the match
exhaustive and it reads, at the call site, as an on-purpose "everything else".

## Why the `*Cases` suffix?

A bare `mapErr` / `tapErr` would promise the functional-programming functor
contract — that the callback receives the error _value_. It doesn't: it receives
a **matcher over the error's cases**. The `*Cases` suffix names that difference
honestly, so the signature tells you what the callback gets before you write it:

- **The success surface keeps `map` / `tap`.** Those callbacks really do hand you
  the value, so the functor name is true there.
- **The error surface says `*ErrCases`** — `mapErrCases`, `flatMapErrCases`,
  `recoverErrCases`, `tapErrCases`, `flatTapErrCases` — because the callback builds
  a match over the union's cases. Each matcher _branch_ still hands you the error,
  narrowed to its exact case, so the functor intuition holds _inside_ a branch,
  where there is a single concrete value.

Naming both surfaces the same (`map` / `mapErr`) was considered and **reversed**
(2026-07): the symmetry read nicely but lied about the protocol, and a reader
reaching for `mapErr((e) => …)` — the shape that name implies — hit a type error
with no hint why. The suffix trades a little visual symmetry for a name that
matches the behavior. Other options — plural `mapErrs`, `catchErrs` + observers —
were rejected for saying even less about what the callback receives.

There is deliberately **no** bare `mapErr((e) => …)` variant alongside
`mapErrCases` — a plain callback over the union is exactly the blanket handler the
matcher exists to eliminate.

## The one eliminator that still folds the error: `match`

`match` applies the same exhaustive matcher to its `errCases` handler:

```ts
result.match({
  ok: (v) => v,
  errCases: (matcher) => matcher.with(tag("NotFound"), () => 404).with(tag("Forbidden"), () => 403),
  defect: (cause) => 500,
});
```

so folding at the edge is exhaustive too — there is no blanket error callback
left to silently drop a case. Its `errCases` handler receives the matcher but **no
`defect` helper**: `match` folds to a plain value, with no `Defect` output
channel, and a `Result` that already carries a defect is handled by the separate
`defect:` case.

## Generic boundary helpers: the catch-all works, tags don't

Exhaustiveness is proven _at the call site_, from the error union. Inside a
**generic** helper — one whose error type is still a type parameter `E` — no
list of tag arms can prove coverage, because the compiler cannot know what `E`
will contain. But the **catch-all can**: `.with(P._, …)` is a state transition
to "nothing remains" that does not depend on `E` at all, so a
catch-all-terminated builder compiles even in fully generic code:

```ts
// ✅ Compiles for any E: the catch-all is provably exhaustive by construction.
function toPromise<T, E>(result: Result<T, E>): T {
  return result.match({
    ok: (value) => value,
    errCases: (matcher) =>
      matcher.with(P._, (error) => {
        throw error;
      }),
    defect: (cause) => {
      throw cause;
    },
  });
}
```

```ts
// ❌ Still won't compile — and shouldn't: tag arms can never be shown to cover
// an unresolved E. Only the catch-all (or a concrete union) can.
function partial<T, E>(result: Result<T, E>) {
  return result.mapErrCases((matcher) => matcher.with(tag("NotFound"), () => 404));
}
```

(Earlier v5 betas, which delegated matching to ts-pattern, rejected even the
catch-all form here — the original issue #145. The built-in matcher fixed it.)

The narrowing guards remain a fine alternative when a boundary just splits by
channel with no per-case branching — it is what unthrown's own interop bridges
use, simply because nothing there needs a matcher:

```ts
// ✅ Also fine: guards carry no exhaustiveness obligation.
function toPromise<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw result.error;
  if (result.isDefect()) throw result.cause;
  return result.value;
}
```

## Where to go next

- The mechanics and every rule: [Combinator reference](../reference/combinators#the-error-channel).
- Define matchable error types: [Model errors](../how-to/model-errors).
- Why this discipline matters most with AI in the loop:
  [Why unthrown](./why-unthrown#why-this-matters-more-with-ai-in-the-loop).
