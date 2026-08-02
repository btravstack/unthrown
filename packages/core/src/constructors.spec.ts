import { describe, expect, it } from "vitest";

import {
  AsyncResult,
  Err,
  ErrAsync,
  isDefect,
  isErr,
  isOk,
  isResult,
  Ok,
  OkAsync,
  type Result,
  GetError,
} from "./index.js";
import { boom, defectOf } from "./test-helpers.js";

describe("constructors", () => {
  it("Ok wraps a value in the success channel", () => {
    const r = Ok(42);
    expect(r.isOk()).toBe(true);
    expect(r.isErr()).toBe(false);
    expect(r.isDefect()).toBe(false);
    expect(r.get()).toBe(42);
  });

  it("Err wraps a modeled error", () => {
    const r = Err("nope");
    expect(r.isErr()).toBe(true);
    expect(r.isOk()).toBe(false);
    expect(r.isDefect()).toBe(false);
    expect(r.getErr()).toBe("nope");
  });

  it("Err(undefined) and Err(null) are real Errs — discrimination is by tag, never payload presence", () => {
    const u = Err(undefined);
    expect(u.tag).toBe("Err");
    expect(u.isErr()).toBe(true);
    if (u.isErr()) expect(u.error).toBeUndefined();
    const n = Err(null);
    if (n.isErr()) expect(n.error).toBeNull();
  });

  it("Ok(Err(x)) does not flatten — a Result is an ordinary value", () => {
    const nested = Ok(Err("inner"));
    expect(nested.tag).toBe("Ok");
    if (nested.isOk()) {
      expect(nested.value.tag).toBe("Err");
    }
  });
});

describe("pre-lifted async constructors (OkAsync / ErrAsync)", () => {
  it("OkAsync lifts a value into a success AsyncResult — no Ok(x).toAsync()", async () => {
    const r = await OkAsync(42);
    expect(r.isOk()).toBe(true);
    expect(r.get()).toBe(42);
  });

  it("ErrAsync lifts an error into a failed AsyncResult", async () => {
    const r = await ErrAsync("nope");
    expect(r.isErr()).toBe(true);
    expect(r.getErr()).toBe("nope");
  });

  it("await-ing never throws and yields the same outcome as Ok(x).toAsync()", async () => {
    expect(await OkAsync(1)).toStrictEqual(await Ok(1).toAsync());
    expect(await ErrAsync("e")).toStrictEqual(await Err("e").toAsync());
  });

  it("the AsyncResult companion aliases them (suffix dropped inside the namespace)", () => {
    expect(AsyncResult.Ok).toBe(OkAsync);
    expect(AsyncResult.Err).toBe(ErrAsync);
  });
});

describe("standalone guards narrow and expose the relevant field", () => {
  it("isOk narrows to OkView and exposes value", () => {
    const r: Result<number, string> = Ok(7);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toBe(7);
    }
  });

  it("isErr narrows to ErrView and exposes error", () => {
    const r: Result<number, string> = Err("bad");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBe("bad");
    }
  });

  it("isDefect narrows to DefectView and exposes cause", () => {
    const r: Result<number, string> = defectOf(boom);
    expect(isDefect(r)).toBe(true);
    if (isDefect(r)) {
      expect(r.cause).toBe(boom);
    }
  });

  it("guards are mutually exclusive", () => {
    const o = Ok(1);
    const e = Err("e");
    const d = defectOf(boom);
    expect([isOk(o), isErr(o), isDefect(o)]).toEqual([true, false, false]);
    expect([isOk(e), isErr(e), isDefect(e)]).toEqual([false, true, false]);
    expect([isOk(d), isErr(d), isDefect(d)]).toEqual([false, false, true]);
  });
});

describe("isResult narrows an unknown value to a Result", () => {
  it("is true for every Result variant", () => {
    expect(isResult(Ok(1))).toBe(true);
    expect(isResult(Err("e"))).toBe(true);
    expect(isResult(defectOf(boom))).toBe(true);
  });

  it("is false for look-alikes, primitives, and unrelated objects", () => {
    expect(isResult({ tag: "Ok", value: 1 })).toBe(false); // structural look-alike
    expect(isResult(null)).toBe(false);
    expect(isResult(undefined)).toBe(false);
    expect(isResult(42)).toBe(false);
    expect(isResult("Ok")).toBe(false);
    expect(isResult({})).toBe(false);
  });

  it("is false for an AsyncResult (not a Result)", () => {
    expect(isResult(Ok(1).toAsync())).toBe(false);
  });

  it("accepts a Result from another copy of unthrown via the Symbol.for prototype brand", () => {
    // Simulate a dual-copy (the CJS and ESM builds side by side) or cross-realm
    // Result: a foreign prototype that carries the shared Symbol.for brand but
    // is not our Res prototype, so `instanceof` alone would reject it.
    const foreignProto = Object.defineProperty({}, Symbol.for("unthrown.Result"), { value: true });
    const foreign = Object.assign(Object.create(foreignProto), { tag: "Ok", value: 1 });
    expect(foreign instanceof Object.getPrototypeOf(Ok(1)).constructor).toBe(false);
    expect(isResult(foreign)).toBe(true);
  });

  it("still rejects a structural look-alike that carries no brand on its prototype", () => {
    expect(isResult(Object.assign(Object.create({}), { tag: "Ok", value: 1 }))).toBe(false);
    // The brand comes only from a copy of unthrown's prototype — an accidental
    // `{ tag: "Ok" }` literal never carries it.
    expect(isResult({ tag: "Ok", value: 1, isOk: () => true })).toBe(false);
  });

  it("fails closed (false, never a throw) on hostile inputs", () => {
    // A guard for untyped boundaries must not throw. A Proxy whose `get` trap
    // throws — or a throwing getter at the brand key — is `false`.
    const hostileProxy = new Proxy(
      {},
      {
        get() {
          throw new Error("trapped");
        },
      },
    );
    expect(isResult(hostileProxy)).toBe(false);
    const throwingGetter = Object.defineProperty({}, Symbol.for("unthrown.Result"), {
      get() {
        throw new Error("trapped");
      },
    });
    expect(isResult(throwingGetter)).toBe(false);
  });
});

describe("method guards narrow (parity with the standalone guards)", () => {
  it("r.isOk() narrows to OkView and exposes value", () => {
    const r: Result<number, string> = Ok(7);
    if (r.isOk()) {
      // Only compiles because `.isOk()` is a `this is OkView` predicate.
      expect(r.value).toBe(7);
    } else {
      expect.fail("expected Ok");
    }
  });

  it("r.isErr() narrows to ErrView and exposes error", () => {
    const r: Result<number, string> = Err("bad");
    if (r.isErr()) {
      expect(r.error).toBe("bad");
    } else {
      expect.fail("expected Err");
    }
  });

  it("r.isDefect() narrows to DefectView and exposes cause", () => {
    const r: Result<number, string> = defectOf(boom);
    if (r.isDefect()) {
      expect(r.cause).toBe(boom);
    } else {
      expect.fail("expected Defect");
    }
  });
});

describe("Result instances are frozen — a variant cannot be forged by mutation", () => {
  it("freezes instances so tag cannot be mutated", () => {
    const r = Ok(1);
    expect(Object.isFrozen(r)).toBe(true);
    expect(() => {
      (r as { tag: string }).tag = "Err";
    }).toThrow(TypeError);
    expect(r.isOk()).toBe(true);
    expect(Object.isFrozen(Err("e"))).toBe(true);
  });

  it("freezes Defect instances too (all three variants share the guarantee)", () => {
    const d = defectOf(boom);
    expect(Object.isFrozen(d)).toBe(true);
    expect(() => {
      (d as unknown as { tag: string }).tag = "Ok";
    }).toThrow(TypeError);
    expect(d.isDefect()).toBe(true);
  });

  it("freezes the prototypes — the shared combinators cannot be swapped out", () => {
    expect(Object.isFrozen(Object.getPrototypeOf(Ok(1)))).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(Ok(1).toAsync()))).toBe(true);
  });
});

describe("GetError", () => {
  it("carries the offending error and is an Error instance", () => {
    const e = new GetError("payload");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(GetError);
    expect(e.name).toBe("GetError");
    expect(e.error).toBe("payload");
    expect(e.cause).toBe("payload");
  });

  it("chains an Error payload through the standard cause", () => {
    const boom = new Error("boom");
    const e = new GetError(boom);
    expect(e.cause).toBe(boom);
    expect((e.cause as Error).stack).toBe(boom.stack);
  });
});
