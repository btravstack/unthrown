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

// oxlint-disable-next-line unthrown/no-ambiguous-error-type -- untyped boundary: a matcher accepts ANY Result, so `E` has no cases to name (the `isResult` case)
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
  // No third guard and no fallthrough: `settle` only renders a canonical
  // Result, whose three variants the two returns above have narrowed down to
  // the Defect. The `isDefect(result)` check that used to stand here could
  // never be false, so it was an untestable branch guarding unreachable code.
  return `Defect(${stringify(result.cause)})`;
}

// The keys `TaggedError` RESERVES — never payload, so never part of what
// `toBeErrTagged`'s second argument asserts. This mirrors the reservation
// exactly: `TaggedErrorInstance` is `Omit<A, "name" | "message" | "stack">` and
// the constructor types all three `?: never`, so none of them can legitimately
// be payload.
//
// `message` is the one that bites. The documented way to set it is a subclass
// field — `override message = "…"` — which lands as an OWN ENUMERABLE property,
// so `Object.keys` sees it and an exact payload assertion
// (`toBeErrTagged("HttpError", { status: 500 })`) would fail on the very pattern
// the library prescribes. (`stack` is already invisible here — the constructor
// re-defines it non-enumerable — but it is listed so this set is the
// reservation list, not a subset that happens to work.)
const RESERVED_KEYS: ReadonlySet<string> = new Set(["_tag", "name", "message", "stack"]);

// The "payload" of a TaggedError: its own enumerable properties minus the keys
// TaggedError owns. This is the data you passed to the constructor, so
// `toBeErrTagged`'s optional second argument matches it: a plain object asserts
// it exactly, and an asymmetric matcher (e.g. `expect.objectContaining(...)`)
// asserts it partially.
function payloadOf(error: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(error).filter(([key]) => !RESERVED_KEYS.has(key)),
  ) as Record<string, unknown>;
}

// Async assertions in flight: every matcher that adopts a thenable registers
// its gate promise here and unregisters when the assertion settles. Whatever
// survives a test is a forgotten `await`, which `failOnForgottenAwait` (the
// `afterEach` hook registered below) turns into a loud, correctly-attributed
// test failure.
type InFlight = {
  matcherName: string;
  testName: string | undefined;
  abandon: () => void;
  // Captured where the gate is created, so its stack runs through the user's
  // `expect(...)` call. Only ever constructed on the ASYNC path — the one that
  // can be forgotten — and V8 formats `.stack` lazily, so a correctly-awaited
  // assertion pays for the capture and nothing more.
  callSite: Error;
};
const inFlight = new Map<Promise<Outcome>, InFlight>();

// The first stack frame that belongs to the user rather than to this matcher
// module or to the test runner. `expect(...)` reaches `settle` through vitest's
// chai wrappers, so the frame directly above us is machinery, not the call
// site; skipping `node_modules` (which is where the runner and chai live) and
// this module itself lands on the spec file.
//
// Deliberately NOT filtering on a `/vitest/` path segment: this package's own
// sources sit under `packages/vitest/`, so such a rule would discard the very
// frame we are looking for whenever the caller is a test in this repo.
//
// Returns undefined when nothing qualifies (a bundled runner, an exotic stack
// format), in which case the caller omits the location rather than guessing.
function callSiteFrame(error: Error): string | undefined {
  // `?? ""` rather than an early return: `stack` is always populated on V8, so
  // a guard clause would be an unreachable statement, and an empty string
  // reaches the same answer (`find` over no frames yields undefined).
  const stack = error.stack ?? "";
  // `slice(1)` drops the message line; we construct the Error ourselves with a
  // single-line message, so every remaining line is a frame.
  //
  // `find` rather than a loop with a fallback `return undefined`: in a normal
  // V8 run the caller's own frame always qualifies, so an explicit fallback
  // would be an unreachable statement. This way the undefined case falls out of
  // `find`'s own contract, and an exotic stack format still degrades to
  // omitting the location rather than naming a library frame as the call site.
  const frame = stack
    .split("\n")
    .slice(1)
    .map((raw) => raw.trim())
    .find(
      (line) =>
        // The runner and chai live in node_modules; `node:` covers internals.
        !/node_modules|node:/.test(line) &&
        // This module — `src/index.ts` from source, `dist/index.[cm]js`
        // published. `index.spec.ts` does not match: `\.` must be followed by
        // the extension.
        !/[/\\](?:src|dist)[/\\]index\.[cm]?[jt]s(?::|$)/.test(line),
    );
  return frame?.replace(/^at\s+/, "");
}

// The slice of vitest's `TestContext` the hook needs: enough of the task tree
// to rebuild the full test name (`"outer suite > inner suite > test"` — the
// same shape `MatcherState.currentTestName` carries), without importing
// vitest's runner types.
type TaskLike = { name: string; suite?: TaskLike | undefined };
type HookContext = { task?: TaskLike | undefined };

function fullTestName(task: TaskLike | undefined): string | undefined {
  if (task === undefined) return undefined;
  const names: string[] = [];
  for (let node: TaskLike | undefined = task; node !== undefined; node = node.suite) {
    names.unshift(node.name);
  }
  return names.join(" > ");
}

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
    // Which test created the assertion — lets the afterEach hook claim only
    // its own test's forgotten awaits under `test.concurrent`.
    testName: state.currentTestName,
    callSite: new Error(`@unthrown/vitest: ${matcherName} assertion created here`),
    abandon: () =>
      deliver({
        pass: !state.isNot,
        // Never read: with `pass` matching the negation, vitest treats the
        // abandoned assertion as passing and does not call `message` — the
        // failure is reported by the hook instead.
        /* v8 ignore next */
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
    .then(
      finish,
      // Defensive: `check` itself threw. Without this arm the gate would never
      // resolve and an awaited assertion would hang the test.
      /* v8 ignore start */
      (cause) => {
        finish({
          pass: false,
          message: () => `the matcher check threw: ${stringify(cause)}`,
        });
      },
      /* v8 ignore stop */
    );
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
export function failOnForgottenAwait(context?: HookContext): void {
  if (inFlight.size === 0) return;
  // Claim only the ending test's own assertions: under `test.concurrent`
  // other tests' assertions are legitimately pending in this module-global
  // map, and abandoning them here would mis-attribute (and mask) their
  // failures. An entry with no test name — or a call with no context (a
  // direct invocation) — is claimed unconditionally: in sequential runs
  // everything pending belongs to the test that just ended.
  const ending = fullTestName(context?.task);
  const claimed: [Promise<Outcome>, InFlight][] = [];
  for (const [gate, entry] of inFlight) {
    if (ending === undefined || entry.testName === undefined || entry.testName === ending) {
      claimed.push([gate, entry]);
    }
  }
  if (claimed.length === 0) return;
  // Remove the claimed entries first so one failure cannot cascade, then
  // resolve the abandoned assertions neutrally: the forgotten await is
  // reported exactly once — here — never as a late unhandled rejection.
  for (const [gate, entry] of claimed) {
    inFlight.delete(gate);
    entry.abandon();
  }
  const names = claimed.map(([, entry]) => entry.matcherName).join(", ");
  // Report the call sites in the MESSAGE, not only via `cause`: the message is
  // the one part every reporter shows, and "you forgot an await" is of little
  // use without the line. `cause` carries the full stack for anything that
  // renders it.
  const sites = [
    ...new Set(
      claimed
        .map(([, entry]) => callSiteFrame(entry.callSite))
        .filter((site): site is string => site !== undefined),
    ),
  ];
  // `sites` is empty only when no frame qualified — see `callSiteFrame`.
  /* v8 ignore next */
  const where = sites.length === 0 ? "" : ` Created at: ${sites.join("; ")}.`;
  throw new Error(
    `@unthrown/vitest: ${claimed.length} async assertion(s) (${names}) were still pending when the test ended — a forgotten \`await\`. For an AsyncResult the matcher is asynchronous: write \`await expect(asyncResult).toBeOk()\`.${where}`,
    // The first claimed assertion's capture: with several forgotten awaits the
    // message lists every site, while `cause` gives one full stack to walk.
    // The `?.` is unreachable — `claimed.length === 0` returned above — and is
    // here only because `noUncheckedIndexedAccess` types the access as
    // possibly-undefined.
    /* v8 ignore next */
    { cause: claimed[0]?.[1].callSite },
  );
}

// Registered at module load, alongside `expect.extend`: this package is
// imported from a setup or test file, where hook registration is legal. The
// try/catch keeps an import outside a running vitest suite (a docs build, a
// stray node import) from crashing at load time — `afterEach` exists there but
// asserts a current suite when called.
try {
  // Registered through a destructuring wrapper: vitest's fixture parser
  // requires a hook callback's first parameter to be an object destructuring
  // pattern (a plain identifier is read as a fixture request and rejected).
  afterEach(({ task }) => failOnForgottenAwait({ task }));
} catch {
  // Not inside a vitest run — the matchers still work synchronously; only the
  // forgotten-`await` safety net is unavailable.
}

/**
 * Build a matcher from the only two things that vary between them: how the
 * expectation is worded, and how it is tested.
 *
 * `showActual` picks between the two message families. A no-argument matcher
 * (`toBeOk`) names what it actually found on the negated path — "not to be Ok,
 * but it was `Err("e")`" — because "not to be Ok" alone would not say why it
 * failed. An argument-taking one (`toBeOkWith`) has already spelled the
 * expectation in its label, so the negated message stops there.
 */
function define(
  matcherName: string,
  showActual: boolean,
  label: (stringify: Stringify, expected: unknown) => string,
  test: (result: SomeResult, equals: MatcherState["equals"], expected: unknown) => boolean,
) {
  return function (this: MatcherState, received: unknown, expected?: unknown): MatcherResult {
    const { stringify } = this.utils;
    const { equals } = this;
    const worded = label(stringify, expected);
    return settle(matcherName, this, received, (result) => {
      const pass = test(result, equals, expected);
      return {
        pass,
        message: () =>
          pass
            ? `expected result not to be ${worded}${showActual ? `, but it was ${render(result, stringify)}` : ""}`
            : `expected result to be ${worded}, but got ${render(result, stringify)}`,
      };
    });
  };
}

const toBeOk = define(
  "toBeOk",
  true,
  () => "Ok",
  (result) => isOk(result),
);

const toBeOkWith = define(
  "toBeOkWith",
  false,
  (stringify, expected) => `Ok(${stringify(expected)})`,
  (result, equals, expected) => isOk(result) && equals(result.value, expected),
);

const toBeErr = define(
  "toBeErr",
  true,
  () => "Err",
  (result) => isErr(result),
);

const toBeErrWith = define(
  "toBeErrWith",
  false,
  (stringify, expected) => `Err(${stringify(expected)})`,
  (result, equals, expected) => isErr(result) && equals(result.error, expected),
);

// Hand-written rather than built by `define`: it is the one matcher taking TWO
// arguments, and it reads `arguments.length` to tell an omitted payload from an
// explicitly-passed `undefined` — neither of which survives a shared wrapper.
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

const toBeDefect = define(
  "toBeDefect",
  true,
  () => "a Defect",
  (result) => isDefect(result),
);

const toBeDefectWith = define(
  "toBeDefectWith",
  false,
  (stringify, expected) => `a Defect caused by ${stringify(expected)}`,
  (result, equals, expected) => isDefect(result) && equals(result.cause, expected),
);

expect.extend({
  toBeDefect,
  toBeDefectWith,
  toBeErr,
  toBeErrTagged,
  toBeErrWith,
  toBeOk,
  toBeOkWith,
});

export { toBeDefect, toBeDefectWith, toBeErr, toBeErrTagged, toBeErrWith, toBeOk, toBeOkWith };

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
 * @see {@link https://btravstack.github.io/unthrown/how-to/test-with-vitest | The Testing guide}
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
   * to also match the error's payload — its own props minus the keys
   * `TaggedError` reserves (`_tag`, `name`, `message`, `stack`), so a subclass's
   * `override message = "…"` does not leak into an exact assertion. A plain
   * object matches exactly, an asymmetric matcher (e.g.
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
  /**
   * Assert a `Defect` whose `cause` is deeply equal to `expected`.
   *
   * `expected` is typed `unknown` because **a defect's cause is `unknown` by
   * design**: nothing reaches that channel through a typed error, so there is
   * no tighter type to give it and no tag-aware variant to add. An asymmetric
   * matcher works as elsewhere:
   * `expect(result).toBeDefectWith(expect.any(TypeError))`.
   */
  toBeDefectWith: (expected: unknown) => R;
};

declare module "vitest" {
  // oxlint-disable-next-line typescript/consistent-type-definitions, typescript/no-explicit-any -- a module augmentation must mirror Vitest's `interface Matchers<T = any>` exactly
  interface Matchers<T = any> extends UnthrownMatchers<T> {}
}
