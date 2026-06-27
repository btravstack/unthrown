import { describe, expect, it, vi } from "vitest";

import { err, ok, type Result } from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  ok(0).map<number>(() => {
    throw cause;
  });

describe("Result.map", () => {
  it("maps the Ok value", () => {
    expect(
      ok(2)
        .map((n) => n + 1)
        .unwrap(),
    ).toBe(3);
  });

  it("passes Err through untouched without calling the callback", () => {
    const f = vi.fn();
    const r = err<string>("e").map(f);
    expect(f).not.toHaveBeenCalled();
    expect(r.unwrapErr()).toBe("e");
  });

  it("passes a Defect through untouched without calling the callback", () => {
    const f = vi.fn();
    const r = defectOf(boom).map(f);
    expect(f).not.toHaveBeenCalled();
    expect(r.isDefect()).toBe(true);
  });

  it("converts a throw into a Defect carrying the cause", () => {
    const r = ok(1).map(() => {
      throw boom;
    });
    expect(r.isDefect()).toBe(true);
    expect(r.recoverDefect((c) => ok(c === boom)).unwrap()).toBe(true);
  });
});

describe("Result.flatMap", () => {
  it("chains into another Ok", () => {
    expect(
      ok(2)
        .flatMap((n) => ok(n * 10))
        .unwrap(),
    ).toBe(20);
  });

  it("chains into an Err, widening the error type", () => {
    expect(
      ok(2)
        .flatMap(() => err("downstream"))
        .unwrapErr(),
    ).toBe("downstream");
  });

  it("passes Err through and does not call the callback", () => {
    const f = vi.fn();
    expect(err<string>("e").flatMap(f).unwrapErr()).toBe("e");
    expect(f).not.toHaveBeenCalled();
  });

  it("passes a Defect through and does not call the callback", () => {
    const f = vi.fn();
    expect(defectOf(boom).flatMap(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      ok(1)
        .flatMap(() => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.tap", () => {
  it("runs the side effect on Ok and returns the same value", () => {
    const seen: number[] = [];
    const r = ok(5).tap((n) => seen.push(n));
    expect(seen).toEqual([5]);
    expect(r.unwrap()).toBe(5);
  });

  it("does not run on Err or Defect", () => {
    const f = vi.fn();
    expect(err("e").tap(f).isErr()).toBe(true);
    expect(defectOf(boom).tap(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      ok(1)
        .tap(() => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.flatTap", () => {
  it("runs the failable effect on Ok and keeps the original value on success", () => {
    const seen: number[] = [];
    const r = ok(5).flatTap((n) => {
      seen.push(n);
      return ok("ignored");
    });
    expect(seen).toEqual([5]);
    expect(r.unwrap()).toBe(5); // original value preserved, not "ignored"
  });

  it("short-circuits to the effect's Err", () => {
    const r = ok(5).flatTap(() => err("denied"));
    expect(r.unwrapErr()).toBe("denied");
  });

  it("propagates a Defect from the effect", () => {
    const r = ok(5).flatTap(() => defectOf(boom));
    expect(r.isDefect()).toBe(true);
  });

  it("does not run on Err or Defect", () => {
    const f = vi.fn(() => ok(1));
    expect(err("e").flatTap(f).isErr()).toBe(true);
    expect(defectOf(boom).flatTap(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      ok(1)
        .flatTap(() => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.as", () => {
  it("replaces the Ok value", () => {
    expect(ok(1).as("x").unwrap()).toBe("x");
  });

  it("passes Err and Defect through", () => {
    expect(err("e").as("x").unwrapErr()).toBe("e");
    expect(defectOf(boom).as("x").isDefect()).toBe(true);
  });
});

describe("Result.mapErr", () => {
  it("maps the Err value", () => {
    expect(
      err("e")
        .mapErr((s) => `${s}!`)
        .unwrapErr(),
    ).toBe("e!");
  });

  it("passes Ok through and does not call the callback", () => {
    const f = vi.fn();
    expect(ok(1).mapErr(f).unwrap()).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("passes a Defect through and does not call the callback", () => {
    const f = vi.fn();
    expect(defectOf(boom).mapErr(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      err("e")
        .mapErr(() => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.orElse", () => {
  it("recovers an Err into an Ok", () => {
    expect(
      err("e")
        .orElse(() => ok(99))
        .unwrap(),
    ).toBe(99);
  });

  it("recovers an Err into another Err", () => {
    expect(
      err("e")
        .orElse(() => err("e2"))
        .unwrapErr(),
    ).toBe("e2");
  });

  it("passes Ok through and does not call the callback", () => {
    const f = vi.fn();
    expect(ok(1).orElse(f).unwrap()).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("passes a Defect through and does not call the callback", () => {
    const f = vi.fn();
    expect(defectOf(boom).orElse(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      err("e")
        .orElse(() => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.recover", () => {
  it("turns an Err into an Ok", () => {
    expect(
      err("e")
        .recover(() => 7)
        .unwrap(),
    ).toBe(7);
  });

  it("passes Ok through and does not call the callback", () => {
    const f = vi.fn();
    expect(ok(1).recover(f).unwrap()).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("does NOT recover a Defect — `never` empties only the error channel", () => {
    const f = vi.fn();
    const recovered = defectOf(boom).recover(f);
    expect(f).not.toHaveBeenCalled();
    expect(recovered.isDefect()).toBe(true);
  });

  it("converts a throw into a Defect", () => {
    expect(
      err("e")
        .recover(() => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.tapErr", () => {
  it("runs the side effect on Err and returns the same error", () => {
    const seen: string[] = [];
    const r = err("e").tapErr((s) => seen.push(s));
    expect(seen).toEqual(["e"]);
    expect(r.unwrapErr()).toBe("e");
  });

  it("does not run on Ok or Defect", () => {
    const f = vi.fn();
    expect(ok(1).tapErr(f).unwrap()).toBe(1);
    expect(defectOf(boom).tapErr(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("Result.recoverDefect (the only door to a Defect)", () => {
  it("replaces a Defect with an Ok", () => {
    expect(
      defectOf(boom)
        .recoverDefect((c) => ok(c === boom ? "handled" : "other"))
        .unwrap(),
    ).toBe("handled");
  });

  it("replaces a Defect with an Err", () => {
    expect(
      defectOf(boom)
        .recoverDefect(() => err("modeled now"))
        .unwrapErr(),
    ).toBe("modeled now");
  });

  it("passes Ok and Err through and does not call the callback", () => {
    const f = vi.fn();
    expect(ok(1).recoverDefect(f).unwrap()).toBe(1);
    expect(err("e").recoverDefect(f).unwrapErr()).toBe("e");
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      defectOf(boom)
        .recoverDefect(() => {
          throw new Error("again");
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.tapDefect", () => {
  it("runs the side effect on a Defect and passes it through", () => {
    const seen: unknown[] = [];
    const r = defectOf(boom).tapDefect((c) => seen.push(c));
    expect(seen).toEqual([boom]);
    expect(r.isDefect()).toBe(true);
  });

  it("does not run on Ok or Err", () => {
    const f = vi.fn();
    expect(ok(1).tapDefect(f).unwrap()).toBe(1);
    expect(err("e").tapDefect(f).unwrapErr()).toBe("e");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("Result.match", () => {
  it("dispatches each of the three channels", () => {
    const fold = (r: Result<number, string>) =>
      r.match({
        ok: (v) => `ok:${v}`,
        err: (e) => `err:${e}`,
        defect: (c) => `defect:${(c as Error).message}`,
      });
    expect(fold(ok(1))).toBe("ok:1");
    expect(fold(err("e"))).toBe("err:e");
    expect(fold(defectOf(boom))).toBe("defect:boom");
  });
});

describe("Result eliminators on Ok / Err", () => {
  it("unwrap returns the Ok value; throws UnwrapError on Err", () => {
    expect(ok(1).unwrap()).toBe(1);
    try {
      err("e").unwrap();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as { name: string }).name).toBe("UnwrapError");
      expect((e as { error: unknown }).error).toBe("e");
    }
  });

  it("unwrapErr returns the Err; throws UnwrapError on Ok; rethrows the cause on a Defect", () => {
    expect(err("e").unwrapErr()).toBe("e");
    try {
      ok(1).unwrapErr();
      expect.unreachable();
    } catch (e) {
      expect((e as { name: string }).name).toBe("UnwrapError");
      expect((e as { error: unknown }).error).toBe(1);
    }
    try {
      defectOf(boom).unwrapErr();
      expect.unreachable();
    } catch (e) {
      expect(e).toBe(boom);
    }
  });

  it("unwrapOr / unwrapOrElse recover an Err", () => {
    const e: Result<number, string> = err("e");
    expect(e.unwrapOr(9)).toBe(9);
    expect(e.unwrapOrElse((s) => s.length)).toBe(1);
    expect(ok(3).unwrapOr(9)).toBe(3);
  });

  it("getOrNull / getOrUndefined return the value or the empty sentinel on Err", () => {
    expect(ok(3).getOrNull()).toBe(3);
    expect(err("e").getOrNull()).toBe(null);
    expect(ok(3).getOrUndefined()).toBe(3);
    expect(err("e").getOrUndefined()).toBe(undefined);
  });
});

describe("Result.toAsync", () => {
  it("lifts a Result into an awaitable AsyncResult", async () => {
    expect((await ok(5).toAsync()).unwrap()).toBe(5);
    expect((await err("e").toAsync()).unwrapErr()).toBe("e");
    expect((await defectOf(boom).toAsync()).isDefect()).toBe(true);
  });
});
