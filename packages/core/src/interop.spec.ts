import { describe, expect, it } from "vitest";

import { defect, fromNullable, fromThrowable, ok } from "./index.js";

const boom = new Error("boom");

describe("fromNullable", () => {
  it("turns null/undefined into a modeled Err", () => {
    expect(fromNullable(null, () => "absent").unwrapErr()).toBe("absent");
    expect(fromNullable(undefined, () => "absent").unwrapErr()).toBe("absent");
  });

  it("keeps a present value as Ok (and treats falsy non-null as present)", () => {
    expect(fromNullable(5, () => "absent").unwrap()).toBe(5);
    expect(fromNullable(0, () => "absent").unwrap()).toBe(0);
    expect(fromNullable("", () => "absent").unwrap()).toBe("");
    expect(fromNullable(false, () => "absent").unwrap()).toBe(false);
  });
});

describe("fromThrowable", () => {
  it("wraps a successful call as Ok and forwards arguments", () => {
    const add = fromThrowable(
      (a: number, b: number) => a + b,
      () => "qualified",
    );
    expect(add(2, 3).unwrap()).toBe(5);
  });

  it("triages a thrown cause into Err when qualify returns E", () => {
    const parse = fromThrowable(
      (s: string) => JSON.parse(s) as unknown,
      () => "invalid-json",
    );
    expect(parse("{not json}").unwrapErr()).toBe("invalid-json");
    expect(parse('{"a":1}').unwrap()).toEqual({ a: 1 });
  });

  it("triages a thrown cause into a Defect when qualify returns a defect marker", () => {
    const fn = fromThrowable(
      () => {
        throw boom;
      },
      (c) => defect(c),
    );
    const r = fn();
    expect(r.isDefect()).toBe(true);
    // the original cause is preserved on the defect channel
    expect(r.recoverDefect((c) => ok(c === boom)).unwrap()).toBe(true);
  });

  it("treats a throw inside qualify as a Defect", () => {
    const fn = fromThrowable(
      () => {
        throw new Error("original");
      },
      () => {
        throw boom;
      },
    );
    expect(fn().isDefect()).toBe(true);
  });
});
