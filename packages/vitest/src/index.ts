// @unthrown/vitest — custom Vitest matchers for `Result` / `AsyncResult`.
//
// Import this module once (e.g. in a test setup file) to register the matchers
// and pull in the type augmentation:
//
//   import "@unthrown/vitest";
//   expect(ok(1)).toBeOk();
//   await expect(fromSafePromise(p)).toBeOk(); // AsyncResult — `await` REQUIRED
//
// IMPORTANT: for an AsyncResult the matcher is asynchronous, so you MUST `await`
// the assertion. A forgotten `await` makes the assertion pass silently.

import { isDefect, isErr, isOk, type Result } from "unthrown";
import { expect } from "vitest";
import type { MatcherResult, MatcherState } from "vitest";

type SomeResult = Result<unknown, unknown>;
type Stringify = (value: unknown) => string;
type Outcome = { pass: boolean; message: () => string };

function isThenable(x: unknown): x is PromiseLike<unknown> {
  return (
    (typeof x === "object" || typeof x === "function") &&
    x !== null &&
    typeof (x as { then?: unknown }).then === "function"
  );
}

function isResult(x: unknown): x is SomeResult {
  return typeof (x as { isOk?: unknown } | null | undefined)?.isOk === "function";
}

function render(result: SomeResult, stringify: Stringify): string {
  if (isOk(result)) return `Ok(${stringify(result.value)})`;
  if (isErr(result)) return `Err(${stringify(result.error)})`;
  if (isDefect(result)) return `Defect(${stringify(result.cause)})`;
  return stringify(result);
}

// The "payload" of a TaggedError: its own enumerable properties minus the
// `_tag` discriminant and the `name` (both set by TaggedError itself, not by
// you). This is the data you passed to the constructor, so `toBeErrTagged`'s
// optional second argument matches it: a plain object asserts it exactly, and an
// asymmetric matcher (e.g. `expect.objectContaining(...)`) asserts it partially.
function payloadOf(error: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(error)) {
    if (key !== "_tag" && key !== "name") out[key] = (error as Record<string, unknown>)[key];
  }
  return out;
}

// Resolve `received` — awaiting it when it is an AsyncResult — then run `check`.
// This is what lets one matcher serve both `expect(result)` and
// `await expect(asyncResult)`. A non-Result fails with a clear message.
function settle(
  received: unknown,
  stringify: Stringify,
  check: (result: SomeResult) => Outcome,
): MatcherResult {
  const run = (value: unknown): Outcome =>
    isResult(value)
      ? check(value)
      : {
          pass: false,
          message: () => `expected an unthrown Result, but received ${stringify(value)}`,
        };
  return isThenable(received) ? Promise.resolve(received).then(run) : run(received);
}

function toBeOk(this: MatcherState, received: unknown): MatcherResult {
  const { stringify } = this.utils;
  return settle(received, stringify, (result) => {
    const pass = isOk(result);
    return {
      pass,
      message: () =>
        pass
          ? `expected result not to be Ok, but it was ${render(result, stringify)}`
          : `expected result to be Ok, but got ${render(result, stringify)}`,
    };
  });
}

function toBeOkWith(this: MatcherState, received: unknown, expected: unknown): MatcherResult {
  const { stringify } = this.utils;
  const { equals } = this;
  return settle(received, stringify, (result) => {
    const pass = isOk(result) && equals(result.value, expected);
    return {
      pass,
      message: () =>
        pass
          ? `expected result not to be Ok(${stringify(expected)})`
          : `expected result to be Ok(${stringify(expected)}), but got ${render(result, stringify)}`,
    };
  });
}

function toBeErr(this: MatcherState, received: unknown): MatcherResult {
  const { stringify } = this.utils;
  return settle(received, stringify, (result) => {
    const pass = isErr(result);
    return {
      pass,
      message: () =>
        pass
          ? `expected result not to be Err, but it was ${render(result, stringify)}`
          : `expected result to be Err, but got ${render(result, stringify)}`,
    };
  });
}

function toBeErrTagged(
  this: MatcherState,
  received: unknown,
  tag: string,
  expected?: unknown,
): MatcherResult {
  const { stringify } = this.utils;
  const { equals } = this;
  const hasExpected = expected !== undefined;
  const label = hasExpected
    ? `Err tagged ${stringify(tag)} matching ${stringify(expected)}`
    : `Err tagged ${stringify(tag)}`;
  return settle(received, stringify, (result) => {
    const error = isErr(result) ? result.error : undefined;
    const tagPass = (error as { _tag?: unknown } | undefined)?._tag === tag;
    const pass = tagPass && (!hasExpected || equals(payloadOf(error as object), expected));
    return {
      pass,
      message: () =>
        pass
          ? `expected result not to be ${label}`
          : `expected result to be ${label}, but got ${render(result, stringify)}`,
    };
  });
}

function toBeDefect(this: MatcherState, received: unknown): MatcherResult {
  const { stringify } = this.utils;
  return settle(received, stringify, (result) => {
    const pass = isDefect(result);
    return {
      pass,
      message: () =>
        pass
          ? `expected result not to be a Defect, but it was ${render(result, stringify)}`
          : `expected result to be a Defect, but got ${render(result, stringify)}`,
    };
  });
}

expect.extend({ toBeOk, toBeOkWith, toBeErr, toBeErrTagged, toBeDefect });

export { toBeDefect, toBeErr, toBeErrTagged, toBeOk, toBeOkWith };

/**
 * The matchers `@unthrown/vitest` contributes to Vitest's `expect`. For an
 * `AsyncResult`, `await` the assertion; `toBeOkWith` compares deeply.
 *
 * @typeParam R - the assertion's chaining return type.
 */
export type UnthrownMatchers<R = unknown> = {
  toBeOk: () => R;
  toBeOkWith: (value: unknown) => R;
  toBeErr: () => R;
  /**
   * Assert an `Err` whose error has `_tag === tag`. Optionally pass `expected`
   * to also match the error's payload (its own props minus `_tag`/`name`): a
   * plain object matches exactly, an asymmetric matcher (e.g.
   * `expect.objectContaining(...)`) matches partially.
   */
  toBeErrTagged: (tag: string, expected?: unknown) => R;
  toBeDefect: () => R;
};

declare module "vitest" {
  // oxlint-disable-next-line typescript/consistent-type-definitions, typescript/no-explicit-any -- a module augmentation must mirror Vitest's `interface Matchers<T = any>` exactly
  interface Matchers<T = any> extends UnthrownMatchers<T> {}
}
