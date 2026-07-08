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

  it("does not intercept a downstream subscriber's throw as an onDefect bug", async () => {
    const subscriberBoom = new Error("subscriber-threw");
    const rethrown: unknown[] = [];
    const originalQueue = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (cb: () => void) => {
      try {
        cb();
      } catch (e) {
        rethrown.push(e);
      }
    };
    // The subscriber throw escapes through Boxed's synchronous fan-out into
    // toBoxedFuture's internal (void-ed) promise chain — contain that
    // unhandled rejection so it doesn't fail the run, and restore vitest's
    // own listeners afterwards.
    const unhandled: unknown[] = [];
    const priorListeners = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", (reason) => {
      unhandled.push(reason);
    });
    try {
      const defect = fromSafePromise(Promise.reject(new Error("bug")));
      const future = toBoxedFuture(defect, () => "triaged");
      future.tap(() => {
        throw subscriberBoom;
      });
      await new Promise((r) => setTimeout(r, 0));
      // Our handler must not reroute the subscriber throw...
      expect(rethrown).toEqual([]);
      // ...it surfaces through the promise machinery (Boxed's pre-existing
      // behaviour), and the Future still resolved.
      expect(unhandled).toEqual([subscriberBoom]);
      expect((await future.toPromise()).isError()).toBe(true);
    } finally {
      process.removeAllListeners("unhandledRejection");
      for (const listener of priorListeners) {
        process.on("unhandledRejection", listener);
      }
      globalThis.queueMicrotask = originalQueue;
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
