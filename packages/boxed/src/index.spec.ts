import { Future, Result as BoxedResult } from "@bloodyowl/boxed";
import { Err, fromSafePromise, Ok, type Result } from "unthrown";
import { describe, expect, it } from "vitest";

import { fromBoxed, fromBoxedFuture, toBoxed, toBoxedFuture } from "./index.js";

const boom = new Error("boom");
const aDefect: Result<number, string> = Ok(0).map<number>(() => {
  throw boom;
});

describe("toBoxed", () => {
  it("maps Ok and Err across", () => {
    const okR = toBoxed(Ok(1), () => "x");
    expect(okR.isOk() && okR.get()).toBe(1);
    const errR = toBoxed(Err("nope") as Result<number, string>, () => "x");
    expect(errR.isError() && errR.getError()).toBe("nope");
  });

  it("forces a Defect to be triaged into the error channel", () => {
    const r = toBoxed(aDefect, (cause) => `bug:${String(cause)}`);
    expect(r.isError() && r.getError()).toBe(`bug:${String(boom)}`);
  });
});

describe("fromBoxed", () => {
  it("maps Result.Ok to Ok and Result.Error to Err — never a Defect", () => {
    expect(fromBoxed(BoxedResult.Ok(1))).toMatchObject({ tag: "Ok", value: 1 });
    expect(fromBoxed(BoxedResult.Error("nope"))).toMatchObject({ tag: "Err", error: "nope" });
  });
});

describe("toBoxedFuture", () => {
  it("maps Ok across and triages a Defect", async () => {
    const okR = await toBoxedFuture(Ok(1).toAsync(), () => "x").toPromise();
    expect(okR.isOk() && okR.get()).toBe(1);
    const defR = await toBoxedFuture(
      aDefect.toAsync(),
      (cause) => `bug:${String(cause)}`,
    ).toPromise();
    expect(defR.isError() && defR.getError()).toBe(`bug:${String(boom)}`);
  });

  it("surfaces a throwing onDefect out-of-band instead of hanging the Future", async () => {
    const boomDefect = new Error("onDefect-threw");
    const rethrown: unknown[] = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (cb: () => void) => {
      try {
        cb();
      } catch (e) {
        rethrown.push(e);
      }
    };
    try {
      const defect = fromSafePromise(Promise.reject(new Error("bug")));
      toBoxedFuture(defect, () => {
        throw boomDefect;
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(rethrown).toEqual([boomDefect]);
    } finally {
      globalThis.queueMicrotask = original;
    }
  });
});

describe("fromBoxedFuture", () => {
  it("maps a Future of Ok/Error to Ok/Err", async () => {
    expect(await fromBoxedFuture(Future.value(BoxedResult.Ok<number, string>(1)))).toMatchObject({
      tag: "Ok",
      value: 1,
    });
    expect(
      await fromBoxedFuture(Future.value(BoxedResult.Error<number, string>("nope"))),
    ).toMatchObject({ tag: "Err", error: "nope" });
  });
});
