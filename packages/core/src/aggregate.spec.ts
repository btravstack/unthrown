import { describe, expect, it } from "vitest";

import { all, err, ok, type Result } from "./index.js";

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

  it("returns Ok([]) for an empty tuple", () => {
    expect(all([]).unwrap()).toEqual([]);
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
});
