// Explicit guards for the load-bearing runtime invariants documented in
// CLAUDE.md. Each `describe` maps 1:1 to an invariant there.

import { describe, expect, it, vi } from "vitest";

import { Do, Err, fromSafePromise, Ok, type Result, UnwrapError } from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

describe("Invariant 1: throw inside any combinator becomes a Defect", () => {
  it("every catching combinator converts a thrown callback into a Defect", () => {
    const t = () => {
      throw boom;
    };
    expect(Ok(1).map(t).isDefect()).toBe(true);
    expect(Ok(1).flatMap(t).isDefect()).toBe(true);
    expect(Ok(1).tap(t).isDefect()).toBe(true);
    expect(Ok(1).flatTap(t).isDefect()).toBe(true);
    expect(Do().bind("a", t).isDefect()).toBe(true);
    expect(Do().let("a", t).isDefect()).toBe(true);
    expect(Err("e").mapErr(t).isDefect()).toBe(true);
    expect(Err("e").orElse(t).isDefect()).toBe(true);
    expect(Err("e").recover(t).isDefect()).toBe(true);
    expect(Err("e").tapErr(t).isDefect()).toBe(true);
    expect(Err("e").flatTapErr(t).isDefect()).toBe(true);
    expect(defectOf(boom).recoverDefect(t).isDefect()).toBe(true);
    expect(defectOf(boom).tapDefect(t).isDefect()).toBe(true);
  });
});

describe("Invariant 2: a Defect flows through every method except match() and recoverDefect()", () => {
  it("success/error combinators pass a Defect through and never call their callback", () => {
    const f = vi.fn();
    const passesThrough = [
      defectOf(boom).map(f),
      defectOf(boom).flatMap(f),
      defectOf(boom).tap(f),
      defectOf(boom).flatTap(f),
      defectOf(boom).bind("a", f),
      defectOf(boom).let("a", f),
      defectOf(boom).as(1),
      defectOf(boom).mapErr(f),
      defectOf(boom).orElse(f),
      defectOf(boom).recover(f),
      defectOf(boom).tapErr(f),
      defectOf(boom).flatTapErr(f),
    ];
    for (const r of passesThrough) expect(r.isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("the recovering eliminators still THROW on a Defect (they recover Err, not a Defect)", () => {
    const d = defectOf(boom);
    expect(() => d.unwrapOr(0)).toThrow();
    expect(() => d.unwrapOrElse(() => 0)).toThrow();
    expect(() => d.getOrNull()).toThrow();
    expect(() => d.getOrUndefined()).toThrow();
  });

  it("only match() and recoverDefect() observe the Defect", () => {
    expect(defectOf(boom).match({ ok: () => "o", err: () => "e", defect: () => "d" })).toBe("d");
    expect(
      defectOf(boom)
        .recoverDefect(() => Ok("handled"))
        .unwrap(),
    ).toBe("handled");
  });
});

describe("Invariant 3: unwrap() is asymmetric", () => {
  it("on Err throws an UnwrapError carrying E", () => {
    try {
      Err("modeled").unwrap();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnwrapError);
      expect((e as UnwrapError<string>).error).toBe("modeled");
      // the offending value is also surfaced as the standard Error.cause
      expect((e as UnwrapError<string>).cause).toBe("modeled");
    }
  });

  it("on a Defect rethrows the ORIGINAL cause with its original stack", () => {
    try {
      defectOf(boom).unwrap();
      expect.unreachable();
    } catch (e) {
      expect(e).toBe(boom); // same instance ⇒ original stack preserved
      expect((e as Error).stack).toBe(boom.stack);
    }
  });
});

describe("Invariant 4: recover empties the error channel in the type, not the runtime", () => {
  it("recover() returns a value whose type is Result<_, never> but may still be a Defect", () => {
    const recovered = defectOf(boom).recover(() => 1);
    // `never` in the type does not mean total — a Defect survives at runtime.
    expect(recovered.isDefect()).toBe(true);
  });
});

describe("Invariant 5: an AsyncResult's internal promise never rejects", () => {
  it("await always yields a Result and never throws, across all three channels", async () => {
    await expect(fromSafePromise(Promise.resolve(1))).resolves.toMatchObject({});
    await expect(fromSafePromise(Promise.reject(boom))).resolves.toMatchObject({});
    const okR = await fromSafePromise(Promise.resolve(1));
    const defectR = await fromSafePromise(Promise.reject(boom));
    expect(okR.unwrap()).toBe(1);
    expect(defectR.isDefect()).toBe(true);
  });
});
