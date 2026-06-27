import { describe, expect, it, vi } from "vitest";

import { Do, err, fromSafePromise, ok, type Result } from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  ok(0).map<number>(() => {
    throw cause;
  });

describe("Do / bind / let", () => {
  it("Do() starts an empty object scope", () => {
    expect(Do().unwrap()).toEqual({});
  });

  it("accumulates bound Results and pure lets into a named scope", () => {
    const r = Do()
      .bind("a", () => ok(1))
      .bind("b", ({ a }) => ok(a + 1))
      .let("c", ({ a, b }) => a + b);
    expect(r.unwrap()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("short-circuits on the first Err and skips later steps", () => {
    const later = vi.fn(() => ok(2));
    const r = Do()
      .bind("a", () => err("denied"))
      .bind("b", later);
    expect(r.unwrapErr()).toBe("denied");
    expect(later).not.toHaveBeenCalled();
  });

  it("unions the error types across binds", () => {
    const a: Result<{ x: number }, "e1"> = Do().bind("x", () => err<"e1">("e1"));
    const b = a.bind("y", () => err<"e2">("e2"));
    // `b` is Result<{ x; y }, "e1" | "e2"> — exercised at runtime here:
    expect(b.unwrapErr()).toBe("e1");
  });

  it("propagates a Defect and does not run later steps", () => {
    const later = vi.fn(() => ok(1));
    const r = Do()
      .bind("a", () => defectOf(boom))
      .let("b", later);
    expect(r.isDefect()).toBe(true);
    expect(later).not.toHaveBeenCalled();
  });

  it("turns a throw in bind or let into a Defect", () => {
    expect(
      Do()
        .bind("a", () => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
    expect(
      Do()
        .let("a", () => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Do / bind / let — async", () => {
  it("binds AsyncResults and pure lets, mixing with sync Results", async () => {
    const r = await Do()
      .toAsync()
      .bind("a", () => fromSafePromise(Promise.resolve(1)))
      .bind("b", ({ a }) => ok(a + 1)) // a sync Result is accepted too
      .let("c", ({ a, b }) => a + b);
    expect(r.unwrap()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("short-circuits on an async Err", async () => {
    const r = await Do()
      .toAsync()
      .bind("a", () => err("denied"))
      .bind("b", () => ok(1));
    expect(r.unwrapErr()).toBe("denied");
  });

  it("turns a throw in an async bind or let into a Defect and never rejects", async () => {
    const fromBind = await Do()
      .toAsync()
      .bind("a", () => {
        throw boom;
      });
    expect(fromBind.isDefect()).toBe(true);

    const fromLet = await Do()
      .toAsync()
      .let("a", () => {
        throw boom;
      });
    expect(fromLet.isDefect()).toBe(true);
  });
});
