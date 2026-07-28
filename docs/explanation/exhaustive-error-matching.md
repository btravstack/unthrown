# Exhaustive error matching

> **Explanation.** This page explains _why_ the error combinators take a
> matcher instead of a plain callback, and why they carry a `*Cases`
> suffix (`mapErrCases`, `tapErrCases`, …) rather than a bare `map`/`tap`-style
> name. For the mechanics — the rules, grouped patterns, the per-method
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
- to _re-emit_ cases unchanged, name them — grouped in one arm if they share the
  treatment: `.with(tag("NotFound"), tag("Forbidden"), (e) => e)`.

Grouped patterns are the honest form of "several cases, one strategy": the
handler is written once, but every case is still spelled out, so enriching `E`
still breaks the build. That is the property the whole design is buying.

## Enumerate the cases; the wildcard is the exception

`P._` matches anything, so a single `.with(P._, …)` arm makes _any_ match
exhaustive — including matches over unions it has never seen. That is precisely
what makes it the wrong default. A wildcard turns the compile error you wanted
into silence: the day a `PaymentDeclined` joins `E`, every wildcard-terminated
site keeps building and quietly routes the new case down whatever path was
already there.

So the library's position is: **name the cases**. Group them when several share a
handler. Reach for `P._` in exactly two situations, and say why in a comment when
you do:

1. **A helper generic in `E`** — enumeration is impossible in principle, not just
   inconvenient (the next section).
2. **An `E` that is a single type**, not a union of cases — a validator's issues
   array, say. There is nothing to enumerate; one arm _is_ the enumeration.

`@unthrown/oxlint`'s
[`no-catch-all-pattern`](../how-to/lint-your-codebase#no-catch-all-pattern) —
part of its recommended preset — encodes this: `P._` is reported, and the two
sanctioned uses carry a targeted `oxlint-disable` comment saying which one it is.

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

## Generic boundary helpers: the catch-all is the only form that compiles

This is `P._`'s remaining purpose — not a convenience, a necessity.

Exhaustiveness is proven _at the call site_, from the concrete error union.
Inside a **generic** helper — one whose error type is still a type parameter `E`
— no list of tag arms can prove coverage, because the compiler cannot know what
`E` will contain. Enumeration is not merely tedious here; it is impossible.

The **catch-all can** prove it: `.with(P._, …)` is a state transition to
"nothing remains" that does not depend on `E` at all, so a catch-all-terminated
builder compiles even in fully generic code:

```ts
// ✅ Compiles for any E: the catch-all is provably exhaustive by construction.
function toPromise<T, E>(result: Result<T, E>): T {
  return result.match({
    ok: (value) => value,
    // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in E: no tag arm can prove coverage
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

The exemption is narrow by construction: the `UniversalPattern` type that
unlocks the catch-all overload is carried by `P._` / `P.any` alone. Even a
`P.when` guard that happens to accept everything is _not_ assignable to it — the
overload fires only for a pattern the type system **knows** covers the whole
input. There is no way to widen this hole from user code.

```ts
// ❌ Still won't compile — and shouldn't: tag arms can never be shown to cover
// an unresolved E. Only the catch-all (or a concrete union) can.
function partial<T, E>(result: Result<T, E>) {
  return result.mapErrCases((matcher) => matcher.with(tag("NotFound"), () => 404));
}
```

(Earlier v5 betas, which delegated matching to ts-pattern, rejected even the
catch-all form here — the original issue #145. The built-in matcher fixed it.)

Often the better answer at a boundary is not to match at all. The narrowing
guards split by _channel_ with no per-case branching and carry no exhaustiveness
obligation — which is what unthrown's own interop bridges use, simply because
nothing there needs a matcher:

```ts
// ✅ Also fine — and usually preferable: guards make no exhaustiveness claim,
// so there is no wildcard to justify.
function toPromise<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw result.error;
  if (result.isDefect()) throw result.cause;
  return result.value;
}
```

Reach for the generic catch-all only when the helper genuinely needs the
matcher's shape — a `.returnType<R>()` pin, say (next section). Otherwise the
guards say the same thing with less machinery.

## Declaring the output: `returnType<R>()`

By default a match's output type is **inferred** — the union of whatever the
branches return. That is the right default when the branches are the source of
truth. It is the wrong one when a **signature** is: a boundary helper, a bridge,
an adapter whose return type is already decided. There, inference works
backwards, and a branch that drifts off-spec silently widens the result instead
of failing.

`.returnType<R>()`, called directly after `match(…)`, declares the output once:

```ts
// Generic in E again — so the catch-all is the only arm that can compile here.
const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
  result.mapErrCases((matcher) =>
    // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in E
    matcher.returnType<ApiError>().with(P._, (error) => new ApiError({ status: 500, error })),
  );
```

Three things change:

- **The match evaluates to `R`**, not to the union of the branch returns — so
  the helper's declared return type is what actually flows out.
- **Every branch is checked against `R`**, and a mismatch is reported **on the
  offending branch** rather than downstream at the call site. Assignability is
  checked in full; one honest caveat — excess-property checking does _not_ fire
  through the pin, so a branch returning an object literal with an **extra**
  property still compiles where an explicit `(): R =>` annotation would reject
  it. A misspelled optional property can therefore slip through; a wrong or
  missing one cannot.
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

Exhaustiveness is unaffected: a missing case is still a compile error. Pinning
declares _what comes out_, not _what is covered_ — so a pinned match over a
concrete union still names every case.

One thing a pin must not do is _widen_ the error channel. In `mapErrCases` the
declared output **is** the new `E`, so `returnType<unknown>()` there re-opens
[Thesis #1](./why-unthrown) — through a type argument, where a `Result<T, unknown>`
annotation would have been rejected. `@unthrown/oxlint`'s
[`no-ambiguous-error-type`](../how-to/lint-your-codebase#no-ambiguous-error-type)
(in its recommended preset) flags exactly that pin, and deliberately leaves the
others alone: `recoverErrCases` pins the _success_ type, `tapErrCases`'s branch
results are discarded, and `match` folds to a plain value — an ambiguous pin is
legitimate in all three.

`.returnType<R>()` is allowed **before any arm has produced an output**, and
only once — once there is an inferred output for the pin to contradict, pinning
(or re-pinning) does not compile. In practice that means calling it directly
after `match(…)`. The gate is about output, not position: an earlier arm whose
handler returns `never` — one that always throws — contributes nothing, so it
does not close the gate. That is sound; a `never` branch can contradict no
declared type.

## Where to go next

- The mechanics and every rule: [Combinator reference](../reference/combinators#the-error-channel).
- Define matchable error types: [Model errors](../how-to/model-errors).
- Why this discipline matters most with AI in the loop:
  [Why unthrown](./why-unthrown#why-this-matters-more-with-ai-in-the-loop).
