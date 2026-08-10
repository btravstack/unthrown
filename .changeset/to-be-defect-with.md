---
"@unthrown/vitest": minor
---

Add the `toBeDefectWith(cause)` matcher.

The `Defect` channel was the only one without a value assertion — `Ok` has
`toBeOkWith`, `Err` has `toBeErrWith` and `toBeErrTagged`, and a defect had only
`toBeDefect`. Asserting _what_ caused one meant a two-step that narrowed by hand,
and the narrowing only worked on a synchronous `Result`: on an `AsyncResult` the
value had to be awaited separately, which is exactly what these matchers exist to
avoid.

```ts
await expect(asyncResult).toBeDefectWith(expect.any(TypeError));
expect(result).toBeDefectWith(theOriginalCause);
```

`expected` is typed `unknown`, matching the channel — a defect's `cause` is
`unknown` by design, so there is no tighter type to give it and no tag-aware
variant to add. Like every other matcher it goes through `settle`, so it inherits
the thenable handling and the forgotten-`await` net.
