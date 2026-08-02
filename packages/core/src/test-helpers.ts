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

/** Assert `Ok`, and its value, doing the narrowing for you. */
export function expectOk<T, E>(result: Result<T, E>, value: T): void {
  expect(result.isOk()).toBe(true);
  if (result.isOk()) expect(result.value).toEqual(value);
}

/** Assert `Err`, and its error, doing the narrowing for you. */
export function expectErr<T, E>(result: Result<T, E>, error: E): void {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) expect(result.error).toEqual(error);
}

/** Assert a `Defect`, and its cause, doing the narrowing for you. */
export function expectDefect<T, E>(result: Result<T, E>, cause: unknown = boom): void {
  expect(result.isDefect()).toBe(true);
  if (result.isDefect()) expect(result.cause).toEqual(cause);
}

/**
 * A thenable that records how it was adopted, for the "a discarded thenable is
 * adopted" invariant.
 *
 * @remarks
 * `Promise.resolve(x)` calls `x.then(onFulfilled, onRejected)` — so an
 * `onRejected` function arriving here is **positive, deterministic proof** that
 * the value was adopted rather than dropped. It replaces the previous shape,
 * which asserted the *absence* of a global `unhandledRejection` after two
 * `setTimeout(0)`s: a negative assertion on a timing heuristic can silently stop
 * protecting, because a rejection firing later than the window looks identical
 * to one that never fires. This settles in a single microtask instead.
 */
export function adoptionProbe(): {
  thenable: PromiseLike<never>;
  adoptions: readonly { onRejected: unknown }[];
} {
  const adoptions: { onRejected: unknown }[] = [];
  const thenable = {
    // oxlint-disable-next-line no-thenable -- the point of the fixture: it must look thenable to be adopted
    then(_onFulfilled: unknown, onRejected: unknown) {
      adoptions.push({ onRejected });
      // Drive the adopted rejection immediately. Recording alone would only
      // prove the handler was INSTALLED; invoking it proves it actually
      // swallows the rejection — still with no timer and no global listener.
      if (typeof onRejected === "function") (onRejected as (cause: unknown) => void)(boom);
    },
  };
  return { thenable: thenable as unknown as PromiseLike<never>, adoptions };
}

/** Flush the microtask queue — enough for `Promise.resolve(thenable)` to adopt. */
export const flushMicrotasks = (): Promise<void> => Promise.resolve();
