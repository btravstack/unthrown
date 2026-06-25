# Testing

`@unthrown/vitest` adds custom [Vitest](https://vitest.dev) matchers for
asserting on `Result` and `AsyncResult` values.

## Installation

::: code-group

```sh [pnpm]
pnpm add -D @unthrown/vitest
```

```sh [npm]
npm install -D @unthrown/vitest
```

:::

`vitest` is a peer dependency.

## Setup

Import the package once — in a test or, better, a Vitest
[setup file](https://vitest.dev/config/#setupfiles) — to register the matchers
and pull in their type augmentation:

```ts
// vitest.setup.ts
import "@unthrown/vitest";
```

## The matchers

```ts
import { ok, err } from "unthrown";
import { expect, test } from "vitest";

test("matchers", () => {
  expect(ok(1)).toBeOk();
  expect(ok(1)).toBeOkWith(1); // deep equality on the value
  expect(err("e")).toBeErr();
  expect(err(new NotFound())).toBeErrTagged("NotFound");
  expect(aDefect).toBeDefect();

  // negations work too
  expect(ok(1)).not.toBeErr();
});
```

| Matcher              | Passes when                                          |
| -------------------- | ---------------------------------------------------- |
| `toBeOk()`           | the result is `Ok`                                   |
| `toBeOkWith(value)`  | the result is `Ok` and the value deep-equals `value` |
| `toBeErr()`          | the result is `Err`                                  |
| `toBeErrTagged(tag)` | the result is `Err` whose error has `_tag === tag`   |
| `toBeDefect()`       | the result is a `Defect`                             |

## Async results — `await` is required

Each matcher detects a thenable `AsyncResult` and awaits it internally. That
means for an `AsyncResult` you **must `await` the assertion**:

```ts
await expect(fromPromise(load(), qualify)).toBeOk();
await expect(fromSafePromise(Promise.reject(boom))).toBeDefect();
```

::: danger Don't forget the await
A forgotten `await` on an async assertion makes it pass **silently** — the
promise is never observed. Always `await expect(asyncResult)…`.
:::

→ Continue to [Pattern Matching](./pattern-matching).
