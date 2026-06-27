import { describe, expect, it, vi } from "vitest";

import { Do, Err, fromSafePromise, Ok, type Result } from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

describe("Do / bind / let", () => {
  it("Do() starts an empty object scope", () => {
    expect(Do().unwrap()).toEqual({});
  });

  it("accumulates bound Results and pure lets into a named scope", () => {
    const r = Do()
      .bind("a", () => Ok(1))
      .bind("b", ({ a }) => Ok(a + 1))
      .let("c", ({ a, b }) => a + b);
    expect(r.unwrap()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("short-circuits on the first Err and skips later steps", () => {
    const later = vi.fn(() => Ok(2));
    const r = Do()
      .bind("a", () => Err("denied"))
      .bind("b", later);
    expect(r.unwrapErr()).toBe("denied");
    expect(later).not.toHaveBeenCalled();
  });

  it("unions the error types across binds", () => {
    const a: Result<{ x: number }, "e1"> = Do().bind("x", () => Err<"e1">("e1"));
    const b = a.bind("y", () => Err<"e2">("e2"));
    // `b` is Result<{ x; y }, "e1" | "e2"> — exercised at runtime here:
    expect(b.unwrapErr()).toBe("e1");
  });

  it("propagates a Defect and does not run later steps", () => {
    const later = vi.fn(() => Ok(1));
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

  it("turns bind/let on a non-object scope into a Defect (misuse, not a silent drop)", () => {
    // `bind`/`let` live on the general surface; calling them on a primitive `Ok`
    // would otherwise spread `{ ...5 }` into `{}` and silently drop the value.
    expect(
      Ok(5)
        .bind("a", () => Ok(1))
        .isDefect(),
    ).toBe(true);
    expect(
      Ok(5)
        .let("a", () => 1)
        .isDefect(),
    ).toBe(true);
  });
});

describe("Do / bind / let — async", () => {
  it("binds AsyncResults and pure lets, mixing with sync Results", async () => {
    const r = await Do()
      .toAsync()
      .bind("a", () => fromSafePromise(Promise.resolve(1)))
      .bind("b", ({ a }) => Ok(a + 1)) // a sync Result is accepted too
      .let("c", ({ a, b }) => a + b);
    expect(r.unwrap()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("short-circuits on an async Err", async () => {
    const r = await Do()
      .toAsync()
      .bind("a", () => Err("denied"))
      .bind("b", () => Ok(1));
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

  it("turns an async bind/let on a non-object scope into a Defect", async () => {
    const fromBind = await Ok(5)
      .toAsync()
      .bind("a", () => Ok(1));
    expect(fromBind.isDefect()).toBe(true);

    const fromLet = await Ok(5)
      .toAsync()
      .let("a", () => 1);
    expect(fromLet.isDefect()).toBe(true);
  });
});
