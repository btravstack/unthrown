import { describe, expect, it } from "vitest";

import { Err, Ok, type Result } from "./index.js";

// The renamed extractors keep their old names as deprecated, runtime-identical
// aliases (unwrap→get, unwrapErr→getErr, unwrapOr→getOr, unwrapOrElse→getOrElse).
// These guard that each alias still delegates to its replacement — both the
// sync and async surfaces. (The error-channel aliases orElse/recover were
// REMOVED in the triage major: their signatures broke anyway, so keeping them
// bought no migration path.)

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

describe("deprecated sync aliases delegate to the renamed operator", () => {
  it("unwrap === get", () => {
    expect(Ok(42).unwrap()).toBe(42);
    expect(() => defectOf(boom).unwrap()).toThrow(boom);
  });

  it("unwrapErr === getErr", () => {
    expect(Err("nope").unwrapErr()).toBe("nope");
  });

  it("unwrapOr === getOr", () => {
    const e: Result<number, string> = Err("e");
    expect(e.unwrapOr(9)).toBe(9);
    expect(Ok(3).unwrapOr(9)).toBe(3);
    expect(() => defectOf(boom).unwrapOr(0)).toThrow(boom);
  });

  it("unwrapOrElse === getOrElse", () => {
    const e: Result<number, string> = Err("e");
    expect(e.unwrapOrElse((s) => s.length)).toBe(1);
    expect(Ok(3).unwrapOrElse(() => 9)).toBe(3);
    expect(() => defectOf(boom).unwrapOrElse(() => 0)).toThrow(boom);
  });
});

describe("deprecated async aliases delegate to the renamed operator", () => {
  it("unwrap === get", async () => {
    await expect(Ok(42).toAsync().unwrap()).resolves.toBe(42);
  });

  it("unwrapErr === getErr", async () => {
    await expect(Err("nope").toAsync().unwrapErr()).resolves.toBe("nope");
  });

  it("unwrapOr === getOr", async () => {
    await expect(Err<string>("e").toAsync().unwrapOr(9)).resolves.toBe(9);
  });

  it("unwrapOrElse === getOrElse", async () => {
    await expect(
      Err<string>("e")
        .toAsync()
        .unwrapOrElse((s) => s.length),
    ).resolves.toBe(1);
  });
});
