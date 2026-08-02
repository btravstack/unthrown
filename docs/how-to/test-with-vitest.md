# Test with Vitest

> **How-to.** [`@unthrown/vitest`](/api/vitest/) adds custom
> [Vitest](https://vitest.dev) matchers for asserting on `Result` and
> `AsyncResult` values.

```sh
pnpm add -D @unthrown/vitest
```

`vitest` is a peer dependency.

## Register the matchers

Import the package once — in a test or, better, a Vitest
[setup file](https://vitest.dev/config/#setupfiles) — to register the matchers and
pull in their type augmentation:

```ts
// vitest.setup.ts
import "@unthrown/vitest";
```

## Assert on a Result

```ts
import { Ok, Err } from "unthrown";
import { expect, test } from "vitest";

test("matchers", () => {
  expect(Ok(1)).toBeOk();
  expect(Ok(1)).toBeOkWith(1); // deep equality on the value
  expect(Err("e")).toBeErr();
  expect(Err(new NotFound())).toBeErrTagged("NotFound");
  expect(aDefect).toBeDefect();

  expect(Ok(1)).not.toBeErr(); // negations work too
});
```

| Matcher                        | Passes when                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `toBeOk()`                     | the result is `Ok`                                                                                |
| `toBeOkWith(value)`            | the result is `Ok` and the value deep-equals `value`                                              |
| `toBeErr()`                    | the result is `Err`                                                                               |
| `toBeErrWith(value)`           | the result is `Err` and the error deep-equals `value`                                             |
| `toBeErrTagged(tag)`           | the result is `Err` whose error has `_tag === tag`                                                |
| `toBeErrTagged(tag, expected)` | …and its payload matches `expected` (exact for a plain object, partial for an asymmetric matcher) |
| `toBeDefect()`                 | the result is a `Defect`                                                                          |

## Assert on a tagged error's payload

`toBeErrTagged` takes an optional second argument to also assert the tagged error's
payload — its own fields, minus the keys `TaggedError` reserves (`_tag`, `name`,
`message`, `stack`). A plain object matches it **exactly**; an asymmetric matcher
matches it **partially**:

```ts
import { Err, TaggedError } from "unthrown";
import { expect } from "vitest";

class NotFound extends TaggedError("NotFound")<{ id: number; msg: string }> {}

// exact — every payload field must match
expect(Err(new NotFound({ id: 1, msg: "nope" }))).toBeErrTagged("NotFound", {
  id: 1,
  msg: "nope",
});

// partial — only the listed fields are checked
expect(Err(new NotFound({ id: 1, msg: "nope" }))).toBeErrTagged(
  "NotFound",
  expect.objectContaining({ id: 1 }),
);
```

The reserved keys are skipped so the exact form keeps working with the standard way
of setting a message — `override message = "…"` lands as an own property on the
instance, but it is `Error`'s human string, not payload:

```ts
class HttpError extends TaggedError("HttpError")<{ status: number }> {
  override message = `http ${this.status}`;
}

// the payload is `{ status }` — the message is not part of it
expect(Err(new HttpError({ status: 500 }))).toBeErrTagged("HttpError", {
  status: 500,
});
```

## Async results — `await` is required

Each matcher detects a thenable `AsyncResult` and awaits it internally. That means
for an `AsyncResult` you **must `await` the assertion**:

```ts
await expect(fromPromise(load(), qualify)).toBeOk();
await expect(fromSafePromise(Promise.reject(boom))).toBeDefect();
```

::: danger Don't forget the await
Always `await expect(asyncResult)…`. As a safety net, importing the package also
registers an `afterEach` hook: a test that ends with async assertions still pending
**fails** with an explicit message naming the un-awaited matchers, instead of
passing silently.
:::

## Where to go next

- Define the errors you're asserting on: [Model errors](./model-errors).
- Keep dropped results out of your code: [Lint your codebase](./lint-your-codebase).
