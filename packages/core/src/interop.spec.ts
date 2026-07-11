import { describe, expect, it } from "vitest";

import {
  type AsyncResult,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromSafeThrowable,
  fromThrowable,
  Ok,
  type Result,
} from "./index.js";

const boom = new Error("boom");

describe("fromNullable", () => {
  it("turns null/undefined into a modeled Err", () => {
    expect(fromNullable(null, () => "absent").getErr()).toBe("absent");
    expect(fromNullable(undefined, () => "absent").getErr()).toBe("absent");
  });

  it("keeps a present value as Ok (and treats falsy non-null as present)", () => {
    const r1 = fromNullable(5, () => "absent");
    expect(r1.isOk()).toBe(true);
    if (r1.isOk()) expect(r1.value).toBe(5);

    const r2 = fromNullable(0, () => "absent");
    expect(r2.isOk()).toBe(true);
    if (r2.isOk()) expect(r2.value).toBe(0);

    const r3 = fromNullable("", () => "absent");
    expect(r3.isOk()).toBe(true);
    if (r3.isOk()) expect(r3.value).toBe("");

    const r4 = fromNullable(false, () => "absent");
    expect(r4.isOk()).toBe(true);
    if (r4.isOk()) expect(r4.value).toBe(false);
  });
});

describe("fromThrowable", () => {
  it("wraps a successful call as Ok and forwards arguments", () => {
    const add = fromThrowable(
      (a: number, b: number) => a + b,
      () => "qualified",
    );
    const r = add(2, 3);
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toBe(5);
  });

  it("triages a thrown cause into Err when qualify returns E", () => {
    const parse = fromThrowable(
      (s: string) => JSON.parse(s) as unknown,
      () => "invalid-json",
    );
    const err = parse("{not json}");
    expect(err.isErr()).toBe(true);
    if (err.isErr()) expect(err.error).toBe("invalid-json");

    const ok = parse('{"a":1}');
    expect(ok.isOk()).toBe(true);
    if (ok.isOk()) expect(ok.value).toEqual({ a: 1 });
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
    expect(r.recoverDefect((c) => Ok(c === boom)).get()).toBe(true);
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
    expect(r.get()).toBe(1);
  });

  it("keeps the modeled arm while subtracting Defect: mixed qualify yields just E", () => {
    const fn = fromThrowable(
      (): number => 1,
      (c, defect) => (c === boom ? ("known" as const) : defect(c)),
    );
    const r: Result<number, "known"> = fn();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toBe(1);
  });
});

describe("fromSafeThrowable", () => {
  it("wraps a successful call as Ok and forwards arguments", () => {
    const add = fromSafeThrowable((a: number, b: number) => a + b);
    const r = add(2, 3);
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toBe(5);
  });

  it("turns every throw into a Defect with the original cause — never an Err", () => {
    const fn = fromSafeThrowable(() => {
      throw boom;
    });
    const r = fn();
    expect(r.isDefect()).toBe(true);
    expect(r.isErr()).toBe(false);
    if (r.isDefect()) expect(r.cause).toBe(boom);
  });

  it("types the error channel as never (the sync mirror of fromSafePromise)", () => {
    const fn = fromSafeThrowable((): number => 1);
    // Compiles only if `E` is `never` — `get()` is gated on Result<T, never>.
    const r: Result<number, never> = fn();
    expect(r.get()).toBe(1);
  });

  it("preserves a non-Error thrown value as the Defect cause", () => {
    const fn = fromSafeThrowable(() => {
      // oxlint-disable-next-line no-throw-literal -- the raw-value throw IS the case under test
      throw "nope";
    });
    const r = fn();
    expect(r.isDefect()).toBe(true);
    if (r.isDefect()) expect(r.cause).toBe("nope");
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
    expect((await typed).getErr()).toBe("known");
  });
});

describe("fromPromise — non-thenable absorption", () => {
  it("fromPromise tolerates a non-thenable input instead of throwing synchronously", async () => {
    const r = await fromPromise(42 as unknown as Promise<number>, (c, d) => d(c));
    expect(r.tag).toBe("Ok");
    if (r.isOk()) expect(r.value).toBe(42);
  });
});

describe("fromSafePromise — non-thenable absorption", () => {
  it("fromSafePromise tolerates a non-thenable input instead of throwing synchronously", async () => {
    const r = await fromSafePromise("x" as unknown as Promise<string>);
    expect(r.tag).toBe("Ok");
    if (r.isOk()) expect(r.value).toBe("x");
  });
});
