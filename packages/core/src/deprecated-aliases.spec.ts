import { describe, expect, it } from "vitest";

import { Err, Ok, type Result } from "./index.js";

// The renamed operators keep their old names as deprecated, runtime-identical
// aliases (orElse→flatMapErr, recover→recoverErr, unwrap→get, unwrapErr→getErr,
// unwrapOr→getOr, unwrapOrElse→getOrElse). These guard that each alias still
// delegates to its replacement — both the sync and async surfaces.

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

describe("deprecated sync aliases delegate to the renamed operator", () => {
  it("orElse === flatMapErr", () => {
    const e: Result<number, string> = Err("e");
    // recovers into a new Ok
    expect(e.orElse((s) => Ok(s.length)).getOrThrow()).toBe(1);
    // recovers into a differently-typed Err
    const reErr = e.orElse(() => Err("e2"));
    expect(reErr.isErr() && reErr.error).toBe("e2");
    // Ok passes through untouched
    expect(
      Ok<number>(3)
        .orElse(() => Ok(9))
        .getOrThrow(),
    ).toBe(3);
  });

  it("recover === recoverErr", () => {
    const e: Result<number, string> = Err("e");
    expect(e.recover((s) => s.length).getOrThrow()).toBe(1);
    expect(
      Ok<number>(3)
        .recover(() => 9)
        .getOrThrow(),
    ).toBe(3);
  });

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
  it("orElse === flatMapErr", async () => {
    const e = Err<string>("e").toAsync();
    await expect(e.orElse((s) => Ok(s.length)).getOrThrow()).resolves.toBe(1);
  });

  it("recover === recoverErr", async () => {
    const e = Err<string>("e").toAsync();
    await expect(e.recover((s) => s.length).getOrThrow()).resolves.toBe(1);
  });

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
