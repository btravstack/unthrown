import { describe, expect, it } from "vitest";

import {
  type AsyncResult,
  fromNullable,
  fromPromise,
  fromThrowable,
  Ok,
  type Result,
} from "./index.js";

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

  it("triages a thrown cause into a Defect when qualify returns the injected defect marker", () => {
    let marker: unknown;
    const fn = fromThrowable(
      () => {
        throw boom;
      },
      (c, defect) => {
        marker = defect(c);
        return marker as ReturnType<typeof defect>;
      },
    );
    const r = fn();
    expect(r.isDefect()).toBe(true);
    // the original cause is preserved on the Defect channel
    expect(r.recoverDefect((c) => Ok(c === boom)).unwrap()).toBe(true);
    // the injected helper yields an opaque marker carrying the cause — NOT a
    // Result (it has no Result methods).
    expect(marker).toMatchObject({ cause: boom });
    expect((marker as { isOk?: unknown }).isOk).toBeUndefined();
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

  it("subtracts Defect from the error channel: a Defect-only qualify yields E = never", () => {
    const fn = fromThrowable(
      (): number => 1,
      (c, defect) => defect(c),
    );
    // Compiles only if `E` is `never` — `Defect` must not leak into the channel.
    const r: Result<number, never> = fn();
    expect(r.unwrap()).toBe(1);
  });

  it("keeps the modeled arm while subtracting Defect: mixed qualify yields just E", () => {
    const fn = fromThrowable(
      (): number => 1,
      (c, defect) => (c === boom ? ("known" as const) : defect(c)),
    );
    const r: Result<number, "known"> = fn();
    expect(r.unwrap()).toBe(1);
  });
});

describe("fromPromise — error-channel inference", () => {
  it("a Defect-only qualify yields AsyncResult<T, never>", async () => {
    const ar = fromPromise(Promise.reject(boom), (c, defect) => defect(c));
    const typed: AsyncResult<never, never> = ar;
    expect((await typed).isDefect()).toBe(true);
  });

  it("a mixed qualify keeps only the modeled arm in E", async () => {
    const ar = fromPromise(Promise.reject(boom), (c, defect) =>
      c === boom ? ("known" as const) : defect(c),
    );
    const typed: AsyncResult<never, "known"> = ar;
    // `boom` matches the modeled arm, so it lands in Err — not a Defect.
    expect((await typed).unwrapErr()).toBe("known");
  });
});
