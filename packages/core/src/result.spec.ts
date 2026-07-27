import { describe, expect, it, vi } from "vitest";

import { Err, Ok, P, type Result, tag } from "./index.js";

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

describe("Result.ensure", () => {
  it("keeps the SAME Ok when the predicate holds (no reallocation)", () => {
    const r = Ok(5);
    expect(
      r.ensure(
        (n) => n > 0,
        () => "neg" as const,
      ),
    ).toBe(r);
  });

  it("fails into the modeled channel with onFail(value) when the predicate rejects", () => {
    const r = Ok(-2).ensure(
      (n) => n > 0,
      (n) => `neg:${n}`,
    );
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("neg:-2");
  });

  it("refines the success type with a type-guard predicate", () => {
    const r = (Ok("x") as Result<string | number, "e">).ensure(
      (v): v is string => typeof v === "string",
      () => "not_a_string" as const,
    );
    // `s.toUpperCase()` compiles only because the guard refined the value to string.
    expect(r.map((s) => s.toUpperCase()).getOr("?")).toBe("X");
  });

  it("passes Err and Defect through without running either callback", () => {
    const p = vi.fn(() => true);
    const f = vi.fn(() => "e2");
    const e = Err("e").ensure(p, f);
    expect(e.isErr()).toBe(true);
    if (e.isErr()) expect(e.error).toBe("e");
    expect(defectOf(boom).ensure(p, f).isDefect()).toBe(true);
    expect(p).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw in the predicate or in onFail into a Defect", () => {
    expect(
      Ok(1)
        .ensure(
          () => {
            throw boom;
          },
          () => "e",
        )
        .isDefect(),
    ).toBe(true);
    expect(
      Ok(1)
        .ensure(
          () => false,
          () => {
            throw boom;
          },
        )
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
const errB = (b: string): Result<never, TagA | TagB> => Err<TagA | TagB>({ _tag: "B", b });

describe("Result.mapErrCases (ts-pattern matcher)", () => {
  it("dispatches a tagged error to its matching branch", () => {
    const r = errA(7).mapErrCases((matcher) =>
      matcher.with(tag("A"), (e) => `a:${e.a}`).with(tag("B"), (e) => `b:${e.b}`),
    );
    expect(r.getErr()).toBe("a:7");
  });

  it("matches a non-_tag (code-discriminated) union", () => {
    type CodeErr = { code: "NOT_FOUND" } | { code: "FORBIDDEN" };
    const r = (Err({ code: "FORBIDDEN" }) as Result<never, CodeErr>).mapErrCases((matcher) =>
      matcher.with({ code: "NOT_FOUND" }, () => 404).with({ code: "FORBIDDEN" }, () => 403),
    );
    expect(r.getErr()).toBe(403);
  });

  it("shares one strategy across grouped patterns", () => {
    const build = (r: Result<never, TagA | TagB>) =>
      r.mapErrCases((matcher) => matcher.with(tag("A"), tag("B"), () => "grouped" as const));
    expect(build(errA(7)).getErr()).toBe("grouped");
    expect(build(errB("x")).getErr()).toBe("grouped");
  });

  it("P._ is the deliberate catch-all", () => {
    const r = errA(7).mapErrCases((matcher) => matcher.with(P._, (e) => `all:${e._tag}`));
    expect(r.getErr()).toBe("all:A");
  });

  it("a branch returning the injected defect(cause) becomes a Defect carrying that cause", () => {
    const ok = errA(7).mapErrCases((matcher, defect) =>
      matcher.with(tag("A"), (e) => e.a).with(tag("B"), (_e) => defect(boom)),
    );
    expect(ok.isDefect()).toBe(false); // an A error takes the mapped branch

    const d = errB("x").mapErrCases((matcher, defect) =>
      matcher.with(tag("A"), (e) => e.a).with(tag("B"), (_e) => defect(boom)),
    );
    expect(d.isDefect()).toBe(true);
    if (d.isDefect()) expect(d.cause).toBe(boom);
  });

  it("throws NonExhaustiveError → Defect when a value slips past the types", () => {
    const smuggled = Err({ _tag: "C" }) as unknown as Result<never, TagA>;
    const r = smuggled.mapErrCases((matcher) => matcher.with(tag("A"), (e) => e.a));
    expect(r.isDefect()).toBe(true);
  });

  it("passes Ok through and does not run the matcher", () => {
    const f = vi.fn();
    const r = Ok(1).mapErrCases((matcher) => matcher.with(P._, f));
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("passes a Defect through and does not run the matcher", () => {
    const f = vi.fn();
    expect(
      defectOf(boom)
        .mapErrCases((matcher) => matcher.with(P._, f))
        .isDefect(),
    ).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw inside a branch into a Defect", () => {
    const r = errA(7).mapErrCases((matcher) =>
      matcher.with(P._, () => {
        throw boom;
      }),
    );
    expect(r.isDefect()).toBe(true);
  });
});

describe("Result.flatMapErrCases (ts-pattern matcher)", () => {
  it("recovers an Err into an Ok", () => {
    expect(
      Err("e")
        .flatMapErrCases((matcher) => matcher.with(P._, () => Ok(99)))
        .get(),
    ).toBe(99);
  });

  it("dispatches per tag — one branch recovers, another re-emits", () => {
    const build = (r: Result<never, TagA | TagB>) =>
      r.flatMapErrCases((matcher) =>
        matcher.with(tag("A"), (e) => Ok(e.a)).with(tag("B"), (e) => Err(e)),
      );
    expect(build(errA(7)).getOr(-1)).toBe(7);
    const reEmitted = build(errB("x"));
    expect(reEmitted.isErr() && reEmitted.error).toEqual({ _tag: "B", b: "x" });
  });

  it("a branch may return defect(cause)", () => {
    const d = Err("e").flatMapErrCases((matcher, defect) => matcher.with(P._, (e) => defect(e)));
    expect(d.isDefect()).toBe(true);
    if (d.isDefect()) expect(d.cause).toBe("e");
  });

  it("passes Ok and Defect through without running the matcher", () => {
    const f = vi.fn();
    expect(
      Ok(1)
        .flatMapErrCases((matcher) => matcher.with(P._, f))
        .getOr(-1),
    ).toBe(1);
    expect(
      defectOf(boom)
        .flatMapErrCases((matcher) => matcher.with(P._, f))
        .isDefect(),
    ).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      Err("e")
        .flatMapErrCases((matcher) =>
          matcher.with(P._, () => {
            throw boom;
          }),
        )
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.recoverErrCases (ts-pattern matcher)", () => {
  it("turns an Err into an Ok", () => {
    expect(
      Err("e")
        .recoverErrCases((matcher) => matcher.with(P._, () => 7))
        .get(),
    ).toBe(7);
  });

  it("dispatches per tag and unions the recovered values", () => {
    expect(
      errA(7)
        .recoverErrCases((matcher) => matcher.with(tag("A"), (e) => e.a).with(tag("B"), (e) => e.b))
        .get(),
    ).toBe(7);
  });

  it("passes Ok through and does not run the matcher", () => {
    const f = vi.fn();
    expect(
      Ok(1)
        .recoverErrCases((matcher) => matcher.with(P._, f))
        .get(),
    ).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("does NOT recover a Defect — `never` empties only the error channel", () => {
    const f = vi.fn();
    const recovered = defectOf(boom).recoverErrCases((matcher) => matcher.with(P._, f));
    expect(f).not.toHaveBeenCalled();
    expect(recovered.isDefect()).toBe(true);
  });

  it("a branch returning defect(cause) stays a Defect (not a recovery)", () => {
    const d = Err("e").recoverErrCases((matcher, defect) => matcher.with(P._, (e) => defect(e)));
    expect(d.isDefect()).toBe(true);
    if (d.isDefect()) expect(d.cause).toBe("e");
  });

  it("converts a throw into a Defect", () => {
    expect(
      Err("e")
        .recoverErrCases((matcher) =>
          matcher.with(P._, () => {
            throw boom;
          }),
        )
        .isDefect(),
    ).toBe(true);
  });
});

describe("Result.tapErrCases (ts-pattern matcher, exhaustive)", () => {
  it("runs the side effect on Err and returns the same error", () => {
    const seen: string[] = [];
    const r = Err("e").tapErrCases((matcher) => matcher.with(P._, (s) => seen.push(s)));
    expect(seen).toEqual(["e"]);
    expect(r.getErr()).toBe("e");
  });

  it("runs only the matching branch; the error still passes through unchanged", () => {
    const seenA: number[] = [];
    const observed = errA(7).tapErrCases((matcher) =>
      matcher.with(tag("A"), (e) => seenA.push(e.a)).with(tag("B"), () => undefined),
    );
    expect(seenA).toEqual([7]);
    expect(observed.isErr() && observed.error).toEqual({ _tag: "A", a: 7 });
  });

  it("does not run on Ok or Defect", () => {
    const f = vi.fn();
    expect(
      Ok(1)
        .tapErrCases((matcher) => matcher.with(P._, f))
        .getOr(-1),
    ).toBe(1);
    expect(
      defectOf(boom)
        .tapErrCases((matcher) => matcher.with(P._, f))
        .isDefect(),
    ).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("Result.flatTapErrCases (ts-pattern matcher, exhaustive)", () => {
  it("runs the failable effect on Err and keeps the original error on success", () => {
    const seen: string[] = [];
    const r = Err("e").flatTapErrCases((matcher) =>
      matcher.with(P._, (s) => {
        seen.push(s);
        return Ok("ignored");
      }),
    );
    expect(seen).toEqual(["e"]);
    expect(r.getErr()).toBe("e"); // original error preserved
  });

  it("threads the effect's Err", () => {
    const r = Err("e").flatTapErrCases((matcher) => matcher.with(P._, () => Err("log_failed")));
    expect(r.getErr()).toBe("log_failed");
  });

  it("propagates a Defect from the effect", () => {
    const r = Err("e").flatTapErrCases((matcher) => matcher.with(P._, () => defectOf(boom)));
    expect(r.isDefect()).toBe(true);
  });

  it("does not run on Ok or Defect", () => {
    const f = vi.fn(() => Ok(1));
    expect(
      Ok(1)
        .flatTapErrCases((matcher) => matcher.with(P._, f))
        .getOr(-1),
    ).toBe(1);
    expect(
      defectOf(boom)
        .flatTapErrCases((matcher) => matcher.with(P._, f))
        .isDefect(),
    ).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("converts a throw into a Defect", () => {
    expect(
      Err("e")
        .flatTapErrCases((matcher) =>
          matcher.with(P._, () => {
            throw boom;
          }),
        )
        .isDefect(),
    ).toBe(true);
  });
});

describe("a rogue value past the types: NonExhaustiveError → Defect in EVERY error combinator", () => {
  // The mapErrCases case is guarded above; the other four share runMatch, but the
  // invariant claims all five — so each gets its own probe.
  const smuggled = () => Err({ _tag: "C" }) as unknown as Result<never, TagA>;

  it("flatMapErrCases routes the unmatched rogue value to a Defect", () => {
    expect(
      smuggled()
        .flatMapErrCases((matcher) => matcher.with(tag("A"), (e) => Ok(e.a)))
        .isDefect(),
    ).toBe(true);
  });

  it("recoverErrCases routes the unmatched rogue value to a Defect", () => {
    expect(
      smuggled()
        .recoverErrCases((matcher) => matcher.with(tag("A"), (e) => e.a))
        .isDefect(),
    ).toBe(true);
  });

  it("tapErrCases routes the unmatched rogue value to a Defect", () => {
    expect(
      smuggled()
        .tapErrCases((matcher) => matcher.with(tag("A"), () => undefined))
        .isDefect(),
    ).toBe(true);
  });

  it("flatTapErrCases routes the unmatched rogue value to a Defect", () => {
    expect(
      smuggled()
        .flatTapErrCases((matcher) => matcher.with(tag("A"), () => Ok(1)))
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
  it("tapErrCases: a throwing callback yields a Defect aggregating [thrown, original]", () => {
    const boom = new Error("boom");
    const r = Err("original").tapErrCases((matcher) =>
      matcher.with(P._, () => {
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

  it("flatTapErrCases: a throwing callback yields a Defect aggregating [thrown, original]", () => {
    const boom = new Error("boom");
    const r = Err("original").flatTapErrCases((matcher) =>
      matcher.with(P._, () => {
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
        errCases: (matcher) => matcher.with(P._, (e) => `err:${e}`),
        defect: (c) => `defect:${(c as Error).message}`,
      });
    expect(fold(Ok(1))).toBe("ok:1");
    expect(fold(Err("e"))).toBe("err:e");
    expect(fold(defectOf(boom))).toBe("defect:boom");
  });
});

describe("Result eliminators on Ok / Err", () => {
  it("get returns the Ok value; throws GetError on Err", () => {
    expect(Ok(1).get()).toBe(1);
    try {
      // The Err branch is unreachable in typed code (get needs E = never);
      // force it via a cast to exercise the defensive runtime guard.
      (Err("e") as unknown as Result<number, never>).get();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as { name: string }).name).toBe("GetError");
      expect((e as { error: unknown }).error).toBe("e");
    }
  });

  it("getErr returns the Err; throws GetError on Ok; rethrows the cause on a Defect", () => {
    expect(Err("e").getErr()).toBe("e");
    try {
      // The Ok branch is unreachable in typed code (getErr needs T = never);
      // force it via a cast to exercise the defensive runtime guard.
      (Ok(1) as unknown as Result<never, number>).getErr();
      expect.unreachable();
    } catch (e) {
      expect((e as { name: string }).name).toBe("GetError");
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
    // getOrThrow is gated to a non-empty error channel (E ≠ never); the casts
    // give an Ok/Defect a fallible type so the runtime paths can be exercised.
    expect((Ok(3) as Result<number, "e">).getOrThrow()).toBe(3);

    // Err throws the error value itself, BY REFERENCE (faithful to
    // `.flatMapErrCases((m) => m.with(P._, (e) => { throw e }))`). `toThrow(err)` only matches the message,
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
      (defectOf(boom) as Result<number, "e">).getOrThrow();
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
