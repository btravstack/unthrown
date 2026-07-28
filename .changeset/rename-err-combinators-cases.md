---
"unthrown": major
---

**The error-matcher combinators are renamed with a `*Cases` suffix.** `mapErr`,
`flatMapErr`, `recoverErr`, `tapErr`, and `flatTapErr` become `mapErrCases`,
`flatMapErrCases`, `recoverErrCases`, `tapErrCases`, and `flatTapErrCases`.

Each takes an exhaustive matcher over the error's _cases_, not the error value —
so the suffix names that protocol and keeps it distinct from the value-taking
success surface (`map` / `tap`). A bare `mapErr((e) => …)` would promise a
functor-style callback the combinators never accept; there is deliberately no
such variant.

Migration is a rename at every call site. (The `-` lines here and below are the
pre-rename v5-beta spelling, matcher callback included; coming from 4.x, `mapErr`
and `match`'s `err` took a plain `(error) => …` callback — see the
exhaustive-matcher entry for that step.)

```diff
- result.mapErr((m) => m.with(tag("NotFound"), wrap))
+ result.mapErrCases((m) => m.with(P.tag("NotFound"), wrap))
```

**`match`'s error handler is renamed the same way — `err` → `errCases`** — for
the same reason: it takes the same exhaustive matcher, not a plain
`(error) => …` callback. This also makes the change **loud** where it would
otherwise be silent: a leftover 4.x `err: (error) => …` handler still compiled
under the matcher constraint (a throwing handler returns `never`, which
vacuously satisfies it) and then threw the _matcher object_ at runtime. Renaming
the key turns that into an excess-property compile error.

```diff
  result.match({
    ok: (value) => value,
-   err: (matcher) => matcher.with(tag("NotFound"), wrap),
+   errCases: (matcher) => matcher.with(P.tag("NotFound"), wrap),
    defect: (cause) => report(cause),
  })
```

The `getErr` extractor is unchanged — it is not a matcher combinator.
