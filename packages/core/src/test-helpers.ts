// Shared fixtures and assertions for core's OWN specs.
//
// Core cannot use `@unthrown/vitest` — that package takes core as a peer, so
// importing it here would be circular. The satellites get to write
// `expect(r).toBeErrWith("e")`; core had to spell the narrowing dance out by
// hand at every site:
//
//   expect(r.isErr()).toBe(true);
//   if (r.isErr()) expect(r.error).toBe("e");
//
// `expectErr` / `expectOk` / `expectDefect` recover most of that readability
// without the dependency, and `boom` / `defectOf` stop nine spec files
// re-declaring the same two fixtures.
//
// Not library code: excluded from coverage in `vitest.config.ts`.

import { expect } from "vitest";

import { Ok, type Result } from "./index.js";

/** The stock thrown cause, so specs don't each mint their own. */
export const boom = new Error("boom");

/**
 * A Defect-state `Result` carrying `cause`. Going through `map` is deliberate:
 * a defect has no public constructor, so a throw inside a combinator is the
 * only way to mint one — which is itself part of what the specs document.
 */
export const defectOf = (cause: unknown = boom): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

/**
 * Assert `Ok`, and its value, doing the narrowing for you. Structural
 * (`toEqual`), matching `@unthrown/vitest`'s `toBeOkWith` — a success value is
 * compared by what it is, not by reference. For identity, see
 * {@link expectDefect}.
 */
export function expectOk<T, E>(result: Result<T, E>, value: T): void {
  expect(result.isOk()).toBe(true);
  if (result.isOk()) expect(result.value).toEqual(value);
}

/**
 * Assert `Err`, and its error, doing the narrowing for you. Structural
 * (`toEqual`), matching `@unthrown/vitest`'s `toBeErrWith`.
 */
export function expectErr<T, E>(result: Result<T, E>, error: E): void {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) expect(result.error).toEqual(error);
}

/**
 * Assert a `Defect`, and its cause, doing the narrowing for you.
 *
 * @remarks
 * Compares by **identity** (`toBe`), unlike {@link expectOk} / {@link expectErr}.
 * That asymmetry is the point: the ok/err channels carry a *value*, so a
 * structural compare is the right claim, but the defect channel's contract is
 * that the ORIGINAL cause survives untouched — `get()` rethrows it with its
 * original stack. `toEqual` would accept a freshly-built `Error` with the same
 * message and quietly stop guarding that.
 */
export function expectDefect<T, E>(result: Result<T, E>, cause: unknown = boom): void {
  expect(result.isDefect()).toBe(true);
  if (result.isDefect()) expect(result.cause).toBe(cause);
}

/**
 * A genuine `Promise` (it passes `instanceof Promise`, like any promise a
 * combinator can be handed) that records how it was silenced, for the "a
 * discarded promise is silenced" invariant.
 *
 * @remarks
 * The nets attach a rejection handler with `value.then(undefined, onRejected)`
 * — so an `onRejected` function arriving here is **positive, deterministic
 * proof** that the value was held rather than dropped. It replaces an older
 * shape which asserted the *absence* of a global `unhandledRejection` after two
 * `setTimeout(0)`s: a negative assertion on a timing heuristic can silently
 * stop protecting, because a rejection firing later than the window looks
 * identical to one that never fires. This settles in a single microtask instead.
 */
export function adoptionProbe(): {
  thenable: PromiseLike<never>;
  adoptions: readonly { onRejected: unknown }[];
} {
  const adoptions: { onRejected: unknown }[] = [];
  // `Promise.prototype` in the chain is what makes it a Promise instance; the
  // own `then` records instead of settling anything real.
  const thenable = Object.assign(Object.create(Promise.prototype) as object, {
    // oxlint-disable-next-line no-thenable -- the point of the fixture: it must be a Promise to be silenced
    then(_onFulfilled: unknown, onRejected: unknown) {
      adoptions.push({ onRejected });
      // Drive the silenced rejection immediately. Recording alone would only
      // prove the handler was INSTALLED; invoking it proves it actually
      // swallows the rejection — still with no timer and no global listener.
      if (typeof onRejected === "function") (onRejected as (cause: unknown) => void)(boom);
    },
  });
  return { thenable: thenable as PromiseLike<never>, adoptions };
}

/**
 * A **lazy** thenable — the shape of a `PrismaPromise` or a query builder, whose
 * work starts only when `then` is called. Not a `Promise` instance. Every
 * thenable net must classify it without ever calling `then`; `calls()` counts
 * the calls that would have run the effect.
 */
export function lazyThenable(): { thenable: PromiseLike<never>; calls: () => number } {
  let calls = 0;
  const thenable = {
    // oxlint-disable-next-line no-thenable -- the point of the fixture: a thenable that is not a Promise
    then() {
      calls += 1;
    },
  };
  return { thenable: thenable as unknown as PromiseLike<never>, calls: () => calls };
}

/** Flush the microtask queue — enough for a pipeline to reach the fixture's `then`. */
export const flushMicrotasks = (): Promise<void> => Promise.resolve();
