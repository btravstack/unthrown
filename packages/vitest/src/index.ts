// @unthrown/vitest — custom Vitest matchers for `Result` / `AsyncResult`.
//
// Import this module once (e.g. in a test setup file) to register the matchers
// and pull in the type augmentation:
//
//   import "@unthrown/vitest";
//   expect(Ok(1)).toBeOk();
//   await expect(fromSafePromise(p)).toBeOk(); // AsyncResult — `await` REQUIRED
//
// IMPORTANT: for an AsyncResult the matcher is asynchronous, so you MUST `await`
// the assertion. A forgotten `await` does not pass silently: an `afterEach`
// hook (registered below, alongside `expect.extend`) fails the test with an
// explicit message naming the matchers still pending when the test ended.

import { isDefect, isErr, isOk, isResult, type Result } from "unthrown";
import { afterEach, expect } from "vitest";
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

function render(result: SomeResult, stringify: Stringify): string {
  if (isOk(result)) return `Ok(${stringify(result.value)})`;
  if (isErr(result)) return `Err(${stringify(result.error)})`;
  if (isDefect(result)) return `Defect(${stringify(result.cause)})`;
  // Unreachable: `settle` only calls `render` on a canonical Result, which is
  // always Ok/Err/Defect; kept for return-exhaustiveness.
  /* v8 ignore start */
  return stringify(result);
  /* v8 ignore stop */
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

// Async assertions in flight: every matcher that adopts a thenable registers
// its gate promise here and unregisters when the assertion settles. Whatever
// survives a test is a forgotten `await`, which `failOnForgottenAwait` (the
// `afterEach` hook registered below) turns into a loud, correctly-attributed
// test failure.
type InFlight = { matcherName: string; abandon: () => void };
const inFlight = new Map<Promise<Outcome>, InFlight>();

// Resolve `received` — awaiting it when it is an AsyncResult — then run `check`.
// This is what lets one matcher serve both `expect(result)` and
// `await expect(asyncResult)`. A non-Result fails with a clear message.
//
// The async path returns a GATE promise rather than the raw chain: delivery is
// indirect so `failOnForgottenAwait` can abandon a forgotten-await assertion —
// once abandoned, the gate resolves neutrally (`pass` matching the negation, so
// vitest never throws on it) and the failure is reported exactly once, by the
// hook, instead of also late-firing as a mis-attributed unhandled rejection.
function settle(
  matcherName: string,
  state: MatcherState,
  received: unknown,
  check: (result: SomeResult) => Outcome,
): MatcherResult {
  const { stringify } = state.utils;
  const run = (value: unknown): Outcome =>
    isResult(value)
      ? check(value)
      : {
          pass: false,
          message: () => `expected an unthrown Result, but received ${stringify(value)}`,
        };
  if (!isThenable(received)) return run(received);

  let deliver!: (outcome: Outcome) => void;
  const gate = new Promise<Outcome>((resolve) => {
    deliver = resolve;
  });
  inFlight.set(gate, {
    matcherName,
    abandon: () =>
      deliver({
        pass: !state.isNot,
        message: () => `assertion abandoned by @unthrown/vitest forgotten-await detection`,
      }),
  });
  const finish = (outcome: Outcome) => {
    // Already abandoned by the hook? Then the gate has resolved neutrally and
    // this outcome is deliberately dropped (resolving twice would be a no-op
    // anyway; the delete guard just makes the intent explicit).
    if (inFlight.delete(gate)) deliver(outcome);
  };
  Promise.resolve(received)
    .then(run, (cause): Outcome => {
      // A REJECTING thenable is by definition not an AsyncResult (an
      // AsyncResult's internal promise never rejects): fail with the friendly
      // message instead of surfacing the raw rejection cause.
      return {
        pass: false,
        message: () =>
          `expected an unthrown Result, but received a thenable that rejected with ${stringify(cause)} — an unthrown AsyncResult never rejects`,
      };
    })
    .then(finish, (cause) => {
      // Defensive: `check` itself threw. Without this arm the gate would never
      // resolve and an awaited assertion would hang the test.
      /* v8 ignore start */
      finish({
        pass: false,
        message: () => `the matcher check threw: ${stringify(cause)}`,
      });
      /* v8 ignore stop */
    });
  return gate;
}

/**
 * The check behind the registered `afterEach` hook: when async matcher
 * assertions are still pending at the end of a test — a forgotten `await` —
 * it abandons them (so they cannot late-fire as unhandled rejections) and
 * throws an error naming the un-awaited matchers, failing that test.
 *
 * @remarks
 * You never need to call this yourself: importing the package registers it as
 * an `afterEach` hook alongside the matchers. It is exported so the mechanism
 * itself is testable.
 */
export function failOnForgottenAwait(): void {
  if (inFlight.size === 0) return;
  const entries = [...inFlight.values()];
  // Clear first so one failure cannot cascade into the following tests, then
  // resolve the abandoned assertions neutrally: the forgotten await is
  // reported exactly once — here — never as a late unhandled rejection.
  inFlight.clear();
  for (const entry of entries) entry.abandon();
  const names = entries.map((entry) => entry.matcherName).join(", ");
  throw new Error(
    `@unthrown/vitest: ${entries.length} async assertion(s) (${names}) were still pending when the test ended — a forgotten \`await\`. For an AsyncResult the matcher is asynchronous: write \`await expect(asyncResult).toBeOk()\`.`,
  );
}

// Registered at module load, alongside `expect.extend`: this package is
// imported from a setup or test file, where hook registration is legal. The
// try/catch keeps an import outside a running vitest suite (a docs build, a
// stray node import) from crashing at load time — `afterEach` exists there but
// asserts a current suite when called.
try {
  afterEach(failOnForgottenAwait);
} catch {
  // Not inside a vitest run — the matchers still work synchronously; only the
  // forgotten-`await` safety net is unavailable.
}

function toBeOk(this: MatcherState, received: unknown): MatcherResult {
  const { stringify } = this.utils;
  return settle("toBeOk", this, received, (result) => {
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
  return settle("toBeOkWith", this, received, (result) => {
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
  return settle("toBeErr", this, received, (result) => {
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

function toBeErrWith(this: MatcherState, received: unknown, expected: unknown): MatcherResult {
  const { stringify } = this.utils;
  const { equals } = this;
  return settle("toBeErrWith", this, received, (result) => {
    const pass = isErr(result) && equals(result.error, expected);
    return {
      pass,
      message: () =>
        pass
          ? `expected result not to be Err(${stringify(expected)})`
          : `expected result to be Err(${stringify(expected)}), but got ${render(result, stringify)}`,
    };
  });
}

function toBeErrTagged(
  this: MatcherState,
  received: unknown,
  tag: string,
  expected?: unknown,
): MatcherResult {
  // Arity, not `expected !== undefined`, decides whether a payload assertion
  // was requested: `arguments.length` distinguishes an omitted second
  // argument (tag-only, length 2) from an explicitly-passed `undefined`
  // (length 3), so `toBeErrTagged(tag, undefined)` asserts the payload
  // equals `undefined` instead of silently degrading to tag-only.
  //
  // A rest-args parameter list (`...args: [tag] | [tag, expected]`), as
  // sketched for this fix, would make that arity observable at the type
  // level too — but it does not typecheck against vitest's `expect.extend`:
  // `RawMatcherFn`'s `Parameters<Matchers<T>[K]>` derives the plain optional
  // tuple `[tag: string, expected?: unknown]` from the public
  // `UnthrownMatchers` type, and TS cannot prove that shape is assignable
  // into a tuple *union* (only into a plain trailing-optional tuple, which
  // is what this parameter list already is). `arguments.length` gets the
  // same runtime distinction without perturbing the signature that
  // `expect.extend` — and the public `UnthrownMatchers` type — expect.
  const hasExpected = arguments.length > 2;
  const { stringify } = this.utils;
  const { equals } = this;
  const label = hasExpected
    ? `Err tagged ${stringify(tag)} matching ${stringify(expected)}`
    : `Err tagged ${stringify(tag)}`;
  return settle("toBeErrTagged", this, received, (result) => {
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
  return settle("toBeDefect", this, received, (result) => {
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

expect.extend({ toBeDefect, toBeErr, toBeErrTagged, toBeErrWith, toBeOk, toBeOkWith });

export { toBeDefect, toBeErr, toBeErrTagged, toBeErrWith, toBeOk, toBeOkWith };

/**
 * The matchers `@unthrown/vitest` contributes to Vitest's `expect`. For an
 * `AsyncResult`, `await` the assertion; `toBeOkWith` compares deeply.
 *
 * @remarks
 * Import the package once (e.g. in a test setup file) to register the
 * matchers and pull in this type augmentation.
 *
 * For an `AsyncResult` the assertion is asynchronous and must be `await`ed.
 * A forgotten `await` does not pass silently: an `afterEach` hook (registered
 * on import, see {@link failOnForgottenAwait}) fails the test with an explicit
 * message naming the matchers still pending when the test ended.
 *
 * @typeParam R - the assertion's chaining return type.
 *
 * @example
 * ```ts
 * import "@unthrown/vitest";
 * import { Ok, fromSafePromise } from "unthrown";
 * import { expect, test } from "vitest";
 *
 * test("sync", () => {
 *   expect(Ok(1)).toBeOkWith(1);
 * });
 *
 * test("async", async () => {
 *   await expect(fromSafePromise(Promise.resolve(1))).toBeOk();
 * });
 * ```
 *
 * @see {@link https://btravstack.github.io/unthrown/guide/testing | The Testing guide}
 */
export type UnthrownMatchers<R = unknown> = {
  /** `expect(Ok(1)).toBeOk()` asserts the result is `Ok`, regardless of value. */
  toBeOk: () => R;
  /** `expect(Ok(1)).toBeOkWith(1)` asserts the result is `Ok` with a deeply-equal value. */
  toBeOkWith: (value: unknown) => R;
  /** `expect(Err("nope")).toBeErr()` asserts the result is `Err`, regardless of the error. */
  toBeErr: () => R;
  /**
   * Assert an `Err` whose error has `_tag === tag`. Optionally pass `expected`
   * to also match the error's payload (its own props minus `_tag`/`name`): a
   * plain object matches exactly, an asymmetric matcher (e.g.
   * `expect.objectContaining(...)`) matches partially. An explicitly-passed
   * `undefined` asserts the payload equals `undefined` (it does not degrade
   * to tag-only).
   *
   * `expect(result).toBeErrTagged("NotFound", { id })` asserts the tag and payload.
   */
  toBeErrTagged: (tag: string, expected?: unknown) => R;
  toBeErrWith: (expected: unknown) => R;
  /** `expect(result).toBeDefect()` asserts the result is a `Defect`. */
  toBeDefect: () => R;
};

declare module "vitest" {
  // oxlint-disable-next-line typescript/consistent-type-definitions, typescript/no-explicit-any -- a module augmentation must mirror Vitest's `interface Matchers<T = any>` exactly
  interface Matchers<T = any> extends UnthrownMatchers<T> {}
}
