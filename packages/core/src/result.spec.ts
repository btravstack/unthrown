import { describe, expect, it, vi } from "vitest";

import { Err, mergeTags, Ok, type Result } from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

describe("Ok() with no argument", () => {
  it("constructs a void success", () => {
    expect(Ok().isOk()).toBe(true);
    expect(Ok().get()).toBeUndefined();
  });
});

describe("Result.map", () => {
  it("maps the Ok value", () => {
    expect(
      Ok(2)
        .map((n) => n + 1)
        .get(),
    ).toBe(3);
  });

  it("passes Err through untouched without calling the callback", () => {
    const f = vi.fn();
    const r = Err<string>("e").map(f);
    expect(f).not.toHaveBeenCalled();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("e");
  });

  it("passes a Defect through untouched without calling the callback", () => {
    const f = vi.fn();
    const r = defectOf(boom).map(f);
    expect(f).not.toHaveBeenCalled();
    expect(r.isDefect()).toBe(true);
  });

  it("converts a throw into a Defect carrying the cause", () => {
    const r = Ok(1).map(() => {
      throw boom;
    });
    expect(r.isDefect()).toBe(true);
    expect(r.recoverDefect((c) => Ok(c === boom)).get()).toBe(true);
  });
});

describe("Result.flatMap", () => {
  it("chains into another Ok", () => {
    expect(
      Ok(2)
        .flatMap((n) => Ok(n * 10))
        .get(),
    ).toBe(20);
  });

  it("chains into an Err, widening the error type", () => {
    expect(
      Ok(2)
        .flatMap(() => Err("downstream"))
        .getErr(),
    ).toBe("downstream");
  });

  it("passes Err through and does not call the callback", () => {
    const f = vi.fn();
    const r = Err<string>("e").flatMap(f);
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("e");
    expect(f).not.toHaveBeenCalled();
  });

  it("passes a Defect through and does not call the callback", () => {
    const f = vi.fn();
    expect(defectOf(boom).flatMap(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      Ok(1)
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
    const r = Ok(5).tap((n) => seen.push(n));
    expect(seen).toEqual([5]);
    expect(r.get()).toBe(5);
  });

  it("does not run on Err or Defect", () => {
    const f = vi.fn();
    expect(Err("e").tap(f).isErr()).toBe(true);
    expect(defectOf(boom).tap(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      Ok(1)
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
    const r = Ok(5).flatTap((n) => {
      seen.push(n);
      return Ok("ignored");
    });
    expect(seen).toEqual([5]);
    expect(r.get()).toBe(5); // original value preserved, not "ignored"
  });

  it("short-circuits to the effect's Err", () => {
    const r = Ok(5).flatTap(() => Err("denied"));
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("denied");
  });

  it("propagates a Defect from the effect", () => {
    const r = Ok(5).flatTap(() => defectOf(boom));
    expect(r.isDefect()).toBe(true);
  });

  it("does not run on Err or Defect", () => {
    const f = vi.fn(() => Ok(1));
    expect(Err("e").flatTap(f).isErr()).toBe(true);
    expect(defectOf(boom).flatTap(f).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      Ok(1)
        .flatTap(() => {
          throw boom;
        })
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.as", () => {
  it("replaces the Ok value", () => {
    expect(Ok(1).as("x").get()).toBe("x");
  });

  it("passes Err and Defect through", () => {
    const r = Err("e").as("x");
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("e");
    expect(defectOf(boom).as("x").isDefect()).toBe(true);
  });
});

describe("Result.discard", () => {
  it("drops the Ok value", () => {
    expect(Ok(1).discard().get()).toBeUndefined();
  });

  it("passes Err and Defect through", () => {
    const r = Err("e").discard();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("e");
    expect(defectOf(boom).discard().isDefect()).toBe(true);
  });
});

type TagA = { _tag: "A"; a: number };
type TagB = { _tag: "B"; b: string };
const errA = (a: number): Result<never, TagA | TagB> => Err<TagA | TagB>({ _tag: "A", a });

describe("Result.mapErr", () => {
  it("maps an untagged Err through a merged handler", () => {
    expect(
      Err("e")
        .mapErr(mergeTags((s) => `${s}!`))
        .getErr(),
    ).toBe("e!");
  });

  it("dispatches a tagged error to its tag's branch", () => {
    const r = errA(7).mapErr({
      A: (e) => `a:${e.a}`,
      B: (e) => `b:${e.b}`,
    });
    expect(r.getErr()).toBe("a:7");
  });

  it("mergeTags handles every tag uniformly — the explicit opt-out of exhaustiveness", () => {
    const r = errA(7).mapErr(mergeTags((e) => `merged:${e._tag}`));
    expect(r.getErr()).toBe("merged:A");
  });

  it('a tag literally named "Else" is an ordinary tag (no reserved keys)', () => {
    type TagElse = { _tag: "Else"; x: number };
    const r = Err<TagElse>({ _tag: "Else", x: 1 }).mapErr({ Else: (e) => e.x });
    expect(r.getErr()).toBe(1);
  });

  it("turns an unhandled tag (outside the typed contract) into a Defect carrying the error", () => {
    const smuggled = Err({ _tag: "C", c: true }) as unknown as Result<never, TagA>;
    const r = smuggled.mapErr({ A: (e) => e.a });
    expect(r.isDefect()).toBe(true);
    if (r.isDefect()) expect(r.cause).toEqual({ _tag: "C", c: true });
  });

  it("does not resolve a rogue tag through the prototype chain", () => {
    const smuggled = Err({ _tag: "toString" }) as unknown as Result<never, TagA>;
    const r = smuggled.mapErr({ A: (e) => e.a });
    expect(r.isDefect()).toBe(true);
  });

  it("passes Ok through and does not call any branch", () => {
    const f = vi.fn();
    const r = Ok(1).mapErr(mergeTags(f));
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("passes a Defect through and does not call any branch", () => {
    const f = vi.fn();
    expect(defectOf(boom).mapErr(mergeTags(f)).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      Err("e")
        .mapErr(
          mergeTags(() => {
            throw boom;
          }),
        )
        .isDefect(),
    ).toBe(true);
  });

  it("a branch returning the injected defect(cause) becomes a Defect carrying that cause", () => {
    const r = errA(7).mapErr({
      A: (e) => `a:${e.a}`,
      B: (_e, defect) => defect(boom),
    });
    expect(r.isDefect()).toBe(false); // an A error takes the mapped branch
    const d = Err<TagA | TagB>({ _tag: "B", b: "x" }).mapErr({
      A: (e) => `a:${e.a}`,
      B: (_e, defect) => defect(boom),
    });
    expect(d.isDefect()).toBe(true);
    if (d.isDefect()) expect(d.cause).toBe(boom);
  });

  it("a merged handler also receives the injected defect helper", () => {
    const d = Err("e").mapErr(mergeTags((e, defect) => defect(e)));
    expect(d.isDefect()).toBe(true);
    if (d.isDefect()) expect(d.cause).toBe("e");
  });
});

describe("Result.flatMapErr", () => {
  it("recovers an Err into an Ok", () => {
    expect(
      Err("e")
        .flatMapErr(mergeTags(() => Ok(99)))
        .get(),
    ).toBe(99);
  });

  it("recovers an Err into another Err", () => {
    expect(
      Err("e")
        .flatMapErr(mergeTags(() => Err("e2")))
        .getErr(),
    ).toBe("e2");
  });

  it("dispatches per tag — one branch recovers, another re-emits", () => {
    const triage = {
      A: (e: TagA) => Ok(e.a),
      B: (e: TagB) => Err(e),
    };
    expect(errA(7).flatMapErr(triage).getOr(-1)).toBe(7);
    const reEmitted = Err<TagA | TagB>({ _tag: "B", b: "x" }).flatMapErr(triage);
    expect(reEmitted.isErr() && reEmitted.error).toEqual({ _tag: "B", b: "x" });
  });

  it("passes Ok through and does not call any branch", () => {
    const f = vi.fn();
    const r = Ok(1).flatMapErr(mergeTags(f));
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("passes a Defect through and does not call any branch", () => {
    const f = vi.fn();
    expect(defectOf(boom).flatMapErr(mergeTags(f)).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("turns an unhandled tag (outside the typed contract) into a Defect carrying the error", () => {
    const smuggled = Err({ _tag: "C" }) as unknown as Result<never, TagA>;
    expect(smuggled.flatMapErr({ A: (e) => Ok(e.a) }).isDefect()).toBe(true);
  });

  it("converts a throw into a Defect", () => {
    expect(
      Err("e")
        .flatMapErr(
          mergeTags(() => {
            throw boom;
          }),
        )
        .isDefect(),
    ).toBe(true);
  });

  it("a branch returning the injected defect(cause) becomes a Defect", () => {
    const d = Err("e").flatMapErr(mergeTags((_e, defect) => defect(boom)));
    expect(d.isDefect()).toBe(true);
    if (d.isDefect()) expect(d.cause).toBe(boom);
  });
});

describe("Result.recoverErr", () => {
  it("turns an Err into an Ok", () => {
    expect(
      Err("e")
        .recoverErr(mergeTags(() => 7))
        .get(),
    ).toBe(7);
  });

  it("dispatches per tag and unions the recovered values", () => {
    expect(
      errA(7)
        .recoverErr({ A: (e) => e.a, B: (e) => e.b })
        .get(),
    ).toBe(7);
  });

  it("passes Ok through and does not call any branch", () => {
    const f = vi.fn();
    expect(Ok(1).recoverErr(mergeTags(f)).get()).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("does NOT recover a Defect — `never` empties only the error channel", () => {
    const f = vi.fn();
    const recovered = defectOf(boom).recoverErr(mergeTags(f));
    expect(f).not.toHaveBeenCalled();
    expect(recovered.isDefect()).toBe(true);
  });

  it("turns an unhandled tag (outside the typed contract) into a Defect carrying the error", () => {
    const smuggled = Err({ _tag: "C" }) as unknown as Result<never, TagA>;
    expect(smuggled.recoverErr({ A: (e) => e.a }).isDefect()).toBe(true);
  });

  it("converts a throw into a Defect", () => {
    expect(
      Err("e")
        .recoverErr(
          mergeTags(() => {
            throw boom;
          }),
        )
        .isDefect(),
    ).toBe(true);
  });

  it("a branch returning the injected defect(cause) becomes a Defect (not a recovery)", () => {
    const d = Err("e").recoverErr(mergeTags((_e, defect) => defect(boom)));
    expect(d.isDefect()).toBe(true);
    if (d.isDefect()) expect(d.cause).toBe(boom);
  });
});

describe("Result.tapErr", () => {
  it("runs the side effect on Err and returns the same error", () => {
    const seen: string[] = [];
    const r = Err("e").tapErr(mergeTags((s) => seen.push(s)));
    expect(seen).toEqual(["e"]);
    expect(r.getErr()).toBe("e");
  });

  it("does not run on Ok or Defect", () => {
    const f = vi.fn();
    expect(Ok(1).tapErr(mergeTags(f)).get()).toBe(1);
    expect(defectOf(boom).tapErr(mergeTags(f)).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("Result.tapErr (per-tag partial observation)", () => {
  it("runs only the matching tag branch; an unobserved tag flows through untouched", () => {
    const seenA: number[] = [];
    const observedA = errA(7).tapErr({ A: (e) => seenA.push(e.a) });
    expect(seenA).toEqual([7]);
    expect(observedA.isErr()).toBe(true);

    const seenB: string[] = [];
    const unobserved = errA(7).tapErr({ B: (e) => seenB.push(e.b) });
    expect(seenB).toEqual([]);
    expect(unobserved.isErr() && unobserved.error).toEqual({ _tag: "A", a: 7 });
  });

  it("observing nothing is a no-op", () => {
    const r = errA(7).tapErr({});
    expect(r.isErr() && r.error).toEqual({ _tag: "A", a: 7 });
  });
});

describe("Result.flatTapErr", () => {
  it("runs the failable effect on Err and keeps the original error on success", () => {
    const seen: string[] = [];
    const r = Err("e").flatTapErr(
      mergeTags((s) => {
        seen.push(s);
        return Ok("ignored");
      }),
    );
    expect(seen).toEqual(["e"]);
    expect(r.getErr()).toBe("e"); // original error preserved
  });

  it("threads the effect's Err", () => {
    const r = Err("e").flatTapErr(mergeTags(() => Err("log_failed")));
    expect(r.getErr()).toBe("log_failed");
  });

  it("propagates a Defect from the effect", () => {
    const r = Err("e").flatTapErr(mergeTags(() => defectOf(boom)));
    expect(r.isDefect()).toBe(true);
  });

  it("does not run on Ok or Defect", () => {
    const f = vi.fn(() => Ok(1));
    expect(Ok(1).flatTapErr(mergeTags(f)).get()).toBe(1);
    expect(defectOf(boom).flatTapErr(mergeTags(f)).isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      Err("e")
        .flatTapErr(
          mergeTags(() => {
            throw boom;
          }),
        )
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.recoverDefect (the only door to a Defect)", () => {
  it("replaces a Defect with an Ok", () => {
    expect(
      defectOf(boom)
        .recoverDefect((c) => Ok(c === boom ? "handled" : "other"))
        .get(),
    ).toBe("handled");
  });

  it("replaces a Defect with an Err", () => {
    const r = defectOf(boom).recoverDefect(() => Err("modeled now"));
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("modeled now");
  });

  it("passes Ok and Err through and does not call the callback", () => {
    const f = vi.fn();
    const okR = Ok(1).recoverDefect(f);
    expect(okR.isOk()).toBe(true);
    if (okR.isOk()) expect(okR.value).toBe(1);
    const errR = Err("e").recoverDefect(f);
    expect(errR.isErr()).toBe(true);
    if (errR.isErr()) expect(errR.error).toBe("e");
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
    expect(Ok(1).tapDefect(f).get()).toBe(1);
    expect(Err("e").tapDefect(f).getErr()).toBe("e");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("Result.tapFailure (the cross-channel observer)", () => {
  it("runs on Err, receiving the Err variant, and passes the error through", () => {
    const seen: string[] = [];
    const r = Err("e").tapFailure((f) => {
      if (f.tag === "Err") seen.push(f.error);
    });
    expect(seen).toEqual(["e"]);
    expect(r.getErr()).toBe("e");
  });

  it("runs on a Defect, receiving the Defect variant, and passes it through", () => {
    const seen: unknown[] = [];
    const r = defectOf(boom).tapFailure((f) => {
      if (f.tag === "Defect") seen.push(f.cause);
    });
    expect(seen).toEqual([boom]);
    expect(r.isDefect()).toBe(true);
  });

  it("does not run on Ok", () => {
    const f = vi.fn();
    expect(Ok(1).tapFailure(f).get()).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("observes without consuming: the failure is the same frozen instance", () => {
    const err = Err("e");
    expect(err.tapFailure(() => "ignored")).toBe(err);
    const defect = defectOf(boom);
    expect(defect.tapFailure(() => "ignored")).toBe(defect);
  });
});

describe("failure-observer throws preserve the original failure", () => {
  it("tapErr: a throwing callback yields a Defect aggregating [thrown, original]", () => {
    const boom = new Error("boom");
    const r = Err("original").tapErr(
      mergeTags(() => {
        throw boom;
      }),
    );
    expect(r.tag).toBe("Defect");
    if (r.isDefect()) {
      expect(r.cause).toBeInstanceOf(AggregateError);
      expect((r.cause as AggregateError).errors).toEqual([boom, "original"]);
    }
  });

  it("tapDefect: a throwing callback yields a Defect aggregating [thrown, original cause]", () => {
    const original = new Error("original-bug");
    const defect = defectOf(original);
    const boom = new Error("logger-failed");
    const r = defect.tapDefect(() => {
      throw boom;
    });
    expect(r.tag).toBe("Defect");
    if (r.isDefect()) {
      expect((r.cause as AggregateError).errors).toEqual([boom, original]);
    }
  });

  it("flatTapErr: a throwing callback yields a Defect aggregating [thrown, original]", () => {
    const boom = new Error("boom");
    const r = Err("original").flatTapErr(
      mergeTags(() => {
        throw boom;
      }),
    );
    expect(r.tag).toBe("Defect");
    if (r.isDefect()) {
      expect((r.cause as AggregateError).errors).toEqual([boom, "original"]);
    }
  });

  it("tapFailure on Err: a throwing callback yields a Defect aggregating [thrown, original error]", () => {
    const boom = new Error("boom");
    const r = Err("original").tapFailure(() => {
      throw boom;
    });
    expect(r.tag).toBe("Defect");
    if (r.isDefect()) {
      expect((r.cause as AggregateError).errors).toEqual([boom, "original"]);
    }
  });

  it("tapFailure on a Defect: a throwing callback yields a Defect aggregating [thrown, original cause]", () => {
    const original = new Error("original-bug");
    const boom = new Error("logger-failed");
    const r = defectOf(original).tapFailure(() => {
      throw boom;
    });
    expect(r.tag).toBe("Defect");
    if (r.isDefect()) {
      expect((r.cause as AggregateError).errors).toEqual([boom, original]);
    }
  });

  it("tap (success channel) is unchanged: the Defect cause is the thrown value itself", () => {
    const boom = new Error("boom");
    const r = Ok(1).tap(() => {
      throw boom;
    });
    expect(r.tag).toBe("Defect");
    if (r.isDefect()) expect(r.cause).toBe(boom);
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
    expect(fold(Ok(1))).toBe("ok:1");
    expect(fold(Err("e"))).toBe("err:e");
    expect(fold(defectOf(boom))).toBe("defect:boom");
  });
});

describe("Result eliminators on Ok / Err", () => {
  it("get returns the Ok value; throws UnwrapError on Err", () => {
    expect(Ok(1).get()).toBe(1);
    try {
      // The Err branch is unreachable in typed code (get needs E = never);
      // force it via a cast to exercise the defensive runtime guard.
      (Err("e") as unknown as Result<number, never>).get();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as { name: string }).name).toBe("UnwrapError");
      expect((e as { error: unknown }).error).toBe("e");
    }
  });

  it("getErr returns the Err; throws UnwrapError on Ok; rethrows the cause on a Defect", () => {
    expect(Err("e").getErr()).toBe("e");
    try {
      // The Ok branch is unreachable in typed code (getErr needs T = never);
      // force it via a cast to exercise the defensive runtime guard.
      (Ok(1) as unknown as Result<never, number>).getErr();
      expect.unreachable();
    } catch (e) {
      expect((e as { name: string }).name).toBe("UnwrapError");
      expect((e as { error: unknown }).error).toBe(1);
    }
    try {
      // Also type-unreachable (getErr needs T = never; defectOf's declared
      // T is number) — cast to exercise the Defect-rethrow guard.
      (defectOf(boom) as unknown as Result<never, never>).getErr();
      expect.unreachable();
    } catch (e) {
      expect(e).toBe(boom);
    }
  });

  it("getOr / getOrElse recover an Err", () => {
    const e: Result<number, string> = Err("e");
    expect(e.getOr(9)).toBe(9);
    expect(e.getOrElse((s) => s.length)).toBe(1);
    expect(Ok(3).getOr(9)).toBe(3);
  });

  it("getOrNull / getOrUndefined return the value or the empty sentinel on Err", () => {
    expect(Ok(3).getOrNull()).toBe(3);
    expect(Err("e").getOrNull()).toBe(null);
    expect(Ok(3).getOrUndefined()).toBe(3);
    expect(Err("e").getOrUndefined()).toBe(undefined);
  });

  it("getOrThrow returns the Ok value, throws the modeled error as-is on Err, and panics on a Defect", () => {
    expect(Ok(3).getOrThrow()).toBe(3);

    // Err throws the error value itself, BY REFERENCE (faithful to
    // `.flatMapErr((e) => { throw e })`). `toThrow(err)` only matches the message,
    // so assert identity via try/catch instead.
    const err = new Error("modeled");
    try {
      Err(err).getOrThrow();
      expect.unreachable();
    } catch (thrown) {
      expect(thrown).toBe(err); // same instance, not merely same message
    }
    // even a non-Error error value is thrown as-is
    try {
      Err("plain").getOrThrow();
      expect.unreachable();
    } catch (thrown) {
      expect(thrown).toBe("plain");
    }

    // a Defect rethrows the ORIGINAL cause with its stack (a panic, like getOrNull)
    try {
      defectOf(boom).getOrThrow();
      expect.unreachable();
    } catch (thrown) {
      expect(thrown).toBe(boom);
      expect((thrown as Error).stack).toBe(boom.stack);
    }
  });
});

describe("Result.toAsync", () => {
  it("lifts a Result into an awaitable AsyncResult", async () => {
    expect((await Ok(5).toAsync()).get()).toBe(5);
    expect((await Err("e").toAsync()).getErr()).toBe("e");
    expect((await defectOf(boom).toAsync()).isDefect()).toBe(true);
  });
});
