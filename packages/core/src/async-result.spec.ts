import { describe, expect, it, vi } from "vitest";

import { type AsyncResult, Defect, Err, fromPromise, fromSafePromise, Ok } from "./index.js";

const boom = new Error("boom");
const asyncOk = <T>(v: T): AsyncResult<T, never> => Ok(v).toAsync();
const asyncErr = <E>(e: E): AsyncResult<never, E> => Err(e).toAsync();
const asyncDefect = (): AsyncResult<number, never> =>
  Ok(0)
    .toAsync()
    .map<number>(() => {
      throw boom;
    });

describe("AsyncResult is awaitable and never rejects", () => {
  it("await yields a Result for each channel and never throws", async () => {
    expect((await asyncOk(7)).unwrap()).toBe(7);
    expect((await asyncErr("e")).unwrapErr()).toBe("e");
    expect((await asyncDefect()).isDefect()).toBe(true);
  });

  it("fromSafePromise: any rejection becomes a Defect, awaiting never throws", async () => {
    const r = await fromSafePromise(Promise.reject(boom));
    expect(r.isDefect()).toBe(true);
  });

  it("fromSafePromise: a resolved value becomes Ok", async () => {
    expect((await fromSafePromise(Promise.resolve(3))).unwrap()).toBe(3);
    expect((await fromSafePromise(() => Promise.resolve(4))).unwrap()).toBe(4);
  });

  it("fromPromise: a rejection is triaged by qualify into Err or Defect", async () => {
    const asErr = await fromPromise(Promise.reject("modeled"), (c) => c as string);
    expect(asErr.unwrapErr()).toBe("modeled");

    const asDefect = await fromPromise(Promise.reject(boom), (c) => Defect(c));
    expect(asDefect.isDefect()).toBe(true);
  });

  it("fromPromise: a throw inside qualify is itself a Defect", async () => {
    const r = await fromPromise(Promise.reject("x"), () => {
      throw boom;
    });
    expect(r.isDefect()).toBe(true);
  });

  it("fromPromise: a resolved value becomes Ok (promise and thunk forms)", async () => {
    expect((await fromPromise(Promise.resolve(5), (c) => c as string)).unwrap()).toBe(5);
    expect(
      (
        await fromPromise(
          () => Promise.resolve(6),
          (c) => c as string,
        )
      ).unwrap(),
    ).toBe(6);
  });
});

describe("AsyncResult: a throw in any combinator becomes a Defect", () => {
  const t = (): never => {
    throw boom;
  };

  it("covers every catching combinator", async () => {
    expect((await asyncOk(1).map(t)).isDefect()).toBe(true);
    expect((await asyncOk(1).flatMap(t)).isDefect()).toBe(true);
    expect((await asyncOk(1).tap(t)).isDefect()).toBe(true);
    expect((await asyncOk(1).flatTap(t)).isDefect()).toBe(true);
    expect((await asyncErr("e").mapErr(t)).isDefect()).toBe(true);
    expect((await asyncErr("e").orElse(t)).isDefect()).toBe(true);
    expect((await asyncErr("e").recover(t)).isDefect()).toBe(true);
    expect((await asyncErr("e").tapErr(t)).isDefect()).toBe(true);
    expect((await asyncErr("e").flatTapErr(t)).isDefect()).toBe(true);
    expect((await asyncDefect().recoverDefect(t)).isDefect()).toBe(true);
    expect((await asyncDefect().tapDefect(t)).isDefect()).toBe(true);
  });
});

describe("AsyncResult success channel", () => {
  it("map transforms the Ok value", async () => {
    expect((await asyncOk(2).map((n) => n + 1)).unwrap()).toBe(3);
  });

  it("map converts a thrown sync callback into a Defect", async () => {
    const r = await asyncOk(1).map(() => {
      throw boom;
    });
    expect(r.isDefect()).toBe(true);
  });

  it("flatMap composes with a Result", async () => {
    expect((await asyncOk(2).flatMap((n) => Ok(n * 5))).unwrap()).toBe(10);
  });

  it("flatMap composes further async work via a qualified boundary", async () => {
    const r = await asyncOk(2).flatMap((n) => fromSafePromise(Promise.resolve(n * 10)));
    expect(r.unwrap()).toBe(20);
  });

  it("tap runs the side effect and preserves the value", async () => {
    const seen: number[] = [];
    const r = await asyncOk(5).tap((n) => seen.push(n));
    expect(seen).toEqual([5]);
    expect(r.unwrap()).toBe(5);
  });

  it("flatTap keeps the original value when the effect succeeds", async () => {
    const r = await asyncOk(5).flatTap((n) => Ok(n * 100));
    expect(r.unwrap()).toBe(5); // original, not 500
  });

  it("flatTap short-circuits to the effect's Err", async () => {
    expect((await asyncOk(5).flatTap(() => Err("denied"))).unwrapErr()).toBe("denied");
  });

  it("flatTap composes an async effect via a qualified boundary, keeping the value", async () => {
    const r = await asyncOk(5).flatTap(() => fromSafePromise(Promise.resolve("logged")));
    expect(r.unwrap()).toBe(5);
  });

  it("flatTap does not run the effect on Err or Defect", async () => {
    const f = vi.fn(() => Ok(1));
    expect((await asyncErr("e").flatTap(f)).unwrapErr()).toBe("e");
    expect((await asyncDefect().flatTap(f)).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("as replaces the Ok value, and passes Err/Defect through", async () => {
    expect((await asyncOk(1).as("x")).unwrap()).toBe("x");
    expect((await asyncErr("e").as("x")).unwrapErr()).toBe("e");
    expect((await asyncDefect().as("x")).isDefect()).toBe(true);
  });
});

describe("AsyncResult error channel", () => {
  it("mapErr transforms the Err", async () => {
    expect((await asyncErr("e").mapErr((s) => `${s}!`)).unwrapErr()).toBe("e!");
  });

  it("orElse recovers an Err", async () => {
    expect((await asyncErr("e").orElse(() => Ok(9))).unwrap()).toBe(9);
  });

  it("orElse composes async recovery via a qualified boundary", async () => {
    const r = await asyncErr<string>("e").orElse(() =>
      fromSafePromise(Promise.resolve("recovered")),
    );
    expect(r.unwrap()).toBe("recovered");
  });

  it("recover turns an Err into an Ok", async () => {
    expect((await asyncErr("e").recover(() => 1)).unwrap()).toBe(1);
  });

  it("tapErr runs the side effect and preserves the error", async () => {
    const seen: string[] = [];
    const r = await asyncErr("e").tapErr((s) => seen.push(s));
    expect(seen).toEqual(["e"]);
    expect(r.unwrapErr()).toBe("e");
  });

  it("flatTapErr keeps the original error when the effect succeeds", async () => {
    const r = await asyncErr("e").flatTapErr(() => Ok("ignored"));
    expect(r.unwrapErr()).toBe("e");
  });

  it("flatTapErr threads the effect's Err", async () => {
    expect((await asyncErr("e").flatTapErr(() => Err("log_failed"))).unwrapErr()).toBe(
      "log_failed",
    );
  });

  it("flatTapErr composes an async effect via a qualified boundary, keeping the error", async () => {
    const r = await asyncErr("e").flatTapErr(() => fromSafePromise(Promise.resolve("logged")));
    expect(r.unwrapErr()).toBe("e");
  });

  it("flatTapErr does not run the effect on Ok or Defect", async () => {
    const f = vi.fn(() => Ok(1));
    expect((await asyncOk(1).flatTapErr(f)).unwrap()).toBe(1);
    expect((await asyncDefect().flatTapErr(f)).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("AsyncResult Defect channel", () => {
  it("a Defect flows through the success and error combinators untouched", async () => {
    const f = vi.fn();
    expect((await asyncDefect().map(f)).isDefect()).toBe(true);
    expect((await asyncDefect().mapErr(f)).isDefect()).toBe(true);
    expect((await asyncDefect().recover(f)).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("recoverDefect is the only door — it replaces the Defect", async () => {
    const r = await asyncDefect().recoverDefect((c) => Ok(c === boom));
    expect(r.unwrap()).toBe(true);
  });

  it("tapDefect observes the cause and passes the Defect through", async () => {
    const seen: unknown[] = [];
    const r = await asyncDefect().tapDefect((c) => seen.push(c));
    expect(seen).toEqual([boom]);
    expect(r.isDefect()).toBe(true);
  });
});

describe("AsyncResult eliminators", () => {
  it("match dispatches each channel", async () => {
    const fold = (r: AsyncResult<number, string>) =>
      r.match({ ok: (v) => `ok:${v}`, err: (e) => `err:${e}`, defect: () => "defect" });
    expect(await fold(asyncOk(1))).toBe("ok:1");
    expect(await fold(asyncErr("e"))).toBe("err:e");
    expect(await fold(asyncDefect())).toBe("defect");
  });

  it("unwrap resolves the value and rejects (via UnwrapError) on Err", async () => {
    await expect(asyncOk(1).unwrap()).resolves.toBe(1);
    await expect(asyncErr("e").unwrap()).rejects.toMatchObject({ name: "UnwrapError", error: "e" });
  });

  it("unwrapErr resolves the error", async () => {
    await expect(asyncErr("e").unwrapErr()).resolves.toBe("e");
  });

  it("unwrapOr / unwrapOrElse recover an Err", async () => {
    const e: AsyncResult<number, string> = Err("e").toAsync();
    await expect(e.unwrapOr(9)).resolves.toBe(9);
    await expect(e.unwrapOrElse((s) => s.length)).resolves.toBe(1);
  });

  it("getOrNull / getOrUndefined return the empty sentinel on Err", async () => {
    await expect(asyncErr("e").getOrNull()).resolves.toBe(null);
    await expect(asyncErr("e").getOrUndefined()).resolves.toBe(undefined);
    await expect(asyncOk(2).getOrNull()).resolves.toBe(2);
  });

  it("a Defect rejects the eliminators with the original cause", async () => {
    await expect(asyncDefect().unwrap()).rejects.toBe(boom);
    await expect(asyncDefect().unwrapOr(0)).rejects.toBe(boom);
    await expect(asyncDefect().getOrNull()).rejects.toBe(boom);
  });
});
