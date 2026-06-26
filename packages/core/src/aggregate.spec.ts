import { describe, expect, it } from "vitest";

import {
  all,
  allAsync,
  type AsyncResult,
  err,
  fromPromise,
  fromSafePromise,
  ok,
  type Result,
} from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  ok(0).map<number>(() => {
    throw cause;
  });

describe("all", () => {
  it("collects a tuple of Ok values, preserving positional types", () => {
    const r = all([ok(1), ok("two"), ok(true)]);
    expect(r.unwrap()).toEqual([1, "two", true]);
  });

  it("returns Ok([]) for an empty tuple, typed as the empty tuple (not never[])", () => {
    const r = all([]);
    // Compiles only if the empty input keeps tuple typing `Result<[], never>`
    // rather than collapsing to `Result<never[], never>`.
    const empty: Result<[], never> = r;
    expect(empty.unwrap()).toEqual([]);
  });

  it("short-circuits on the first Err", () => {
    const r = all([ok(1), err("first"), err("second")]);
    expect(r.unwrapErr()).toBe("first");
  });

  it("lets any Defect dominate, even over an earlier Err", () => {
    const r = all([ok(1), err("e"), defectOf(boom)]);
    expect(r.isDefect()).toBe(true);
    expect(r.recoverDefect((c) => ok(c === boom)).unwrap()).toBe(true);
  });

  it("keeps the first Defect when several are present", () => {
    const first = new Error("first");
    const r = all([defectOf(first), defectOf(new Error("second"))]);
    expect(r.recoverDefect((c) => ok(c === first)).unwrap()).toBe(true);
  });

  it("collapses a dynamic Result[] to Result<T[], E> without a cast", () => {
    // The array overload: no `as` needed, even in a generic-feeling shape.
    const combine = <T, E>(rs: Result<T, E>[]): Result<T[], E> => all(rs);
    const r = combine([ok(1), ok(2), ok(3)] as Result<number, string>[]);
    expect(r.unwrap()).toEqual([1, 2, 3]);

    const e = combine([ok(1), err("bad")] as Result<number, string>[]);
    expect(e.unwrapErr()).toBe("bad");
  });
});

describe("allAsync", () => {
  it("collects a tuple of AsyncResult Ok values, preserving positional types", async () => {
    const r = await allAsync([
      fromSafePromise(Promise.resolve(1)),
      fromSafePromise(Promise.resolve("two")),
      fromSafePromise(Promise.resolve(true)),
    ]);
    expect(r.unwrap()).toEqual([1, "two", true]);
  });

  it("returns Ok([]) for an empty input", async () => {
    expect((await allAsync([])).unwrap()).toEqual([]);
  });

  it("short-circuits on the first Err", async () => {
    const r = await allAsync([
      fromPromise(Promise.reject("first"), (c) => c as string),
      fromPromise(Promise.reject("second"), (c) => c as string),
    ]);
    expect(r.unwrapErr()).toBe("first");
  });

  it("lets any Defect dominate, even over an earlier Err", async () => {
    const r = await allAsync([
      fromPromise(Promise.reject("e"), (c) => c as string),
      fromSafePromise(Promise.reject(boom)),
    ]);
    expect(r.isDefect()).toBe(true);
    expect((await r.toAsync().recoverDefect((c) => ok(c === boom))).unwrap()).toBe(true);
  });

  it("never rejects — await always yields a Result", async () => {
    const r = await allAsync([fromSafePromise(Promise.reject(boom))]);
    expect(r.isDefect()).toBe(true);
  });

  it("collapses a dynamic AsyncResult[] to AsyncResult<T[], E> without a cast", async () => {
    const combine = <T, E>(rs: AsyncResult<T, E>[]): AsyncResult<T[], E> => allAsync(rs);
    const r = await combine([
      fromSafePromise(Promise.resolve(1)),
      fromSafePromise(Promise.resolve(2)),
    ]);
    expect(r.unwrap()).toEqual([1, 2]);
  });
});
