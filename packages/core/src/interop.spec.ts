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
    // Result (it has no Result methods) — and it is frozen: a mutated marker
    // cannot smuggle a different cause past the boundary.
    expect(marker).toMatchObject({ cause: boom });
    expect((marker as { isOk?: unknown }).isOk).toBeUndefined();
    expect(Object.isFrozen(marker)).toBe(true);
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

describe("qualify must be synchronous (runtime belt-and-braces)", () => {
  // An async qualify is a compile error (NotThenable, guarded in
  // types.test-d.ts); these exercise the runtime guard for untyped/JS callers.
  it("fromThrowable: an async qualify slipped past the types yields a Defect, never Err(Promise)", () => {
    const fn = fromThrowable(
      () => {
        throw boom;
      },
      (async () => "modeled") as never,
    );
    const r = fn();
    expect(r.isErr()).toBe(false);
    expect(r.isDefect()).toBe(true);
    if (r.isDefect()) {
      expect(r.cause).toBeInstanceOf(TypeError);
      expect(String((r.cause as TypeError).message)).toContain("qualify must be synchronous");
    }
  });

  it("fromPromise: an async qualify slipped past the types yields a Defect, never Err(Promise)", async () => {
    const r = await fromPromise(Promise.reject(boom), (async () => "modeled") as never);
    expect(r.isErr()).toBe(false);
    expect(r.isDefect()).toBe(true);
    if (r.isDefect()) expect(r.cause).toBeInstanceOf(TypeError);
  });

  it("an async-THROWING qualify still yields a Defect and its rejection never floats", async () => {
    const floated: unknown[] = [];
    const probe = (reason: unknown): void => {
      floated.push(reason);
    };
    process.on("unhandledRejection", probe);
    try {
      const r = await fromPromise(Promise.reject(boom), (async () => {
        throw new Error("late rejection");
      }) as never);
      expect(r.isDefect()).toBe(true);
      // Give the orphaned promise time to settle and Node's unhandled-rejection
      // detection a macrotask to fire — the adopt-and-silence handler must have
      // claimed the rejection.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(floated).toEqual([]);
    } finally {
      process.off("unhandledRejection", probe);
    }
  });
});

describe("the SYNC boundaries reject an async fn", () => {
  // A synchronous boundary only ever sees a synchronous `throw`, so an async
  // `fn` rejects long after it has returned: the rejection can never reach
  // `qualify`. Left alone it sat inside `Ok(<Promise>)` — un-triaged — and then
  // floated as an unhandled rejection, which terminates the process on Node by
  // default. This cannot be banned at compile time without breaking generic
  // functions (`fromSafeThrowable(structuredClone)`), so it is caught here.
  const withRejectionProbe = async (body: () => void): Promise<unknown[]> => {
    const floated: unknown[] = [];
    const probe = (reason: unknown): void => {
      floated.push(reason);
    };
    process.on("unhandledRejection", probe);
    try {
      body();
      // Two macrotasks: let the orphan settle, then let Node's
      // unhandled-rejection detection run.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return floated;
    } finally {
      process.off("unhandledRejection", probe);
    }
  };

  it("fromThrowable: an async fn is a Defect, never Ok(Promise)", async () => {
    const floated = await withRejectionProbe(() => {
      const fn = fromThrowable(
        async (): Promise<number> => {
          throw boom;
        },
        (cause, defect) => defect(cause),
      );
      const r = fn();
      expect(r.isOk()).toBe(false);
      expect(r.isDefect()).toBe(true);
      if (r.isDefect()) {
        expect(r.cause).toBeInstanceOf(TypeError);
        expect(String((r.cause as TypeError).message)).toContain("returned a thenable");
      }
    });
    // The orphaned rejection was adopted and silenced, not left to float.
    expect(floated).toEqual([]);
  });

  it("fromSafeThrowable: an async fn is a Defect, never Ok(Promise)", async () => {
    const floated = await withRejectionProbe(() => {
      const fn = fromSafeThrowable(async (): Promise<number> => {
        throw boom;
      });
      const r = fn();
      expect(r.isOk()).toBe(false);
      expect(r.isDefect()).toBe(true);
    });
    expect(floated).toEqual([]);
  });

  it("a RESOLVING async fn is a Defect too — the hazard is the shape, not the outcome", async () => {
    const fn = fromSafeThrowable(async () => 1);
    expect(fn().isDefect()).toBe(true);
  });

  it("a plain (non-promise) thenable is caught the same way", () => {
    // oxlint-disable-next-line no-thenable -- the point of the test: a hand-rolled thenable must be caught like a Promise
    const fn = fromSafeThrowable(() => ({ then: () => undefined }));
    expect(fn().isDefect()).toBe(true);
  });

  it("a synchronous fn returning an ordinary object is untouched", () => {
    // `then` is only a thenable marker when it is CALLABLE — a data property
    // named `then` must still flow through as an ordinary success value.
    // oxlint-disable-next-line no-thenable -- deliberately NOT a thenable: `then` is a number, which must not trip the guard
    const fn = fromSafeThrowable(() => ({ then: 1, ok: true }));
    const r = fn();
    expect(r.isOk()).toBe(true);
    // Asserted field-by-field rather than with a `{ then: … }` literal, which
    // would trip the same `no-thenable` lint the code under test is about.
    if (r.isOk()) {
      expect(r.value.then).toBe(1);
      expect(r.value.ok).toBe(true);
    }
  });
});
