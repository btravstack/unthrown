// Explicit guards for the load-bearing runtime invariants documented in
// CLAUDE.md. Most get a dedicated `describe` here; a couple are guarded where
// their feature lives instead — prototype-pollution safety and Defect-dominance
// (for the fail-fast `all` family and the accumulating `validateAll` one alike)
// are covered in `aggregate.spec.ts`.

import { describe, expect, it, vi } from "vitest";

import {
  Do,
  Err,
  fromExecutor,
  fromSafePromise,
  Ok,
  P,
  type Result,
  GetError,
  validateAll,
  validateAllAsync,
  validateAllFromDict,
  validateAllFromDictAsync,
} from "./index.js";
import { adoptionProbe, boom, defectOf, flushMicrotasks } from "./test-helpers.js";

describe("Invariant 1: throw inside any combinator becomes a Defect", () => {
  it("every catching combinator converts a thrown callback into a Defect", () => {
    const t = () => {
      throw boom;
    };
    expect(Ok(1).map(t).isDefect()).toBe(true);
    expect(Ok(1).flatMap(t).isDefect()).toBe(true);
    expect(Ok(1).tap(t).isDefect()).toBe(true);
    expect(Ok(1).flatTap(t).isDefect()).toBe(true);
    expect(
      Ok(1)
        .ensure(t, () => "e")
        .isDefect(),
    ).toBe(true);
    expect(
      Ok(1)
        .ensure(() => false, t)
        .isDefect(),
    ).toBe(true);
    expect(Do().bind("a", t).isDefect()).toBe(true);
    expect(Do().let("a", t).isDefect()).toBe(true);
    expect(
      Err("e")
        .mapErrCases((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .flatMapErrCases((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .recoverErrCases((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .tapErrCases((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .flatTapErrCases((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(defectOf(boom).recoverDefect(t).isDefect()).toBe(true);
    expect(defectOf(boom).tapDefect(t).isDefect()).toBe(true);
    expect(Err("e").tapFailure(t).isDefect()).toBe(true);
    expect(defectOf(boom).tapFailure(t).isDefect()).toBe(true);
  });

  it("covers the aggregates' `merge` too — the one callback outside the method surface", async () => {
    const t = () => {
      throw boom;
    };
    // `merge` is user code inside a core function, so the same rule holds: an
    // aggregate never lets a throw escape as a raw throw, which is what keeps
    // the "one match at the edge, no try/catch" promise true for these too.
    expect(validateAll([Err("e")], t).isDefect()).toBe(true);
    expect(validateAllFromDict({ a: Err("e") }, t).isDefect()).toBe(true);
    expect((await validateAllAsync([Err("e").toAsync()], t)).isDefect()).toBe(true);
    expect((await validateAllFromDictAsync({ a: Err("e").toAsync() }, t)).isDefect()).toBe(true);
  });
});

describe("Invariant 1b: a Result-constrained callback returning a non-Result becomes a Defect", () => {
  // Reachable only from untyped/JS callers (in typed code the constraint is a
  // compile error) — hence the `as never` casts. Same policy as the aggregates'
  // non-Result-element guard: a TypeError-caused Defect, never a poison value
  // that throws a raw TypeError later in the pipeline.
  const rogue = (() => 42) as never;

  it("sync: flatMap / flatTap / bind / flatMapErrCases / flatTapErrCases / recoverDefect", () => {
    const hardened = [
      Ok(1).flatMap(rogue),
      Ok(1).flatTap(rogue),
      Do().bind("a", rogue),
      Err("e").flatMapErrCases((matcher) => matcher.with(P._, () => 42 as never)),
      Err("e").flatTapErrCases((matcher) => matcher.with(P._, () => 42 as never)),
      defectOf(boom).recoverDefect(rogue),
    ];
    for (const r of hardened) {
      expect(r.isDefect()).toBe(true);
      if (r.isDefect()) {
        expect(r.cause).toBeInstanceOf(TypeError);
        expect(String((r.cause as TypeError).message)).toContain("non-Result");
      }
    }
  });

  it("async: the same six combinators, without rejecting the internal promise", async () => {
    const hardened = await Promise.all([
      Ok(1).toAsync().flatMap(rogue),
      Ok(1).toAsync().flatTap(rogue),
      Do().toAsync().bind("a", rogue),
      Err("e")
        .toAsync()
        .flatMapErrCases((matcher) => matcher.with(P._, () => 42 as never)),
      Err("e")
        .toAsync()
        .flatTapErrCases((matcher) => matcher.with(P._, () => 42 as never)),
      defectOf(boom).toAsync().recoverDefect(rogue),
    ]);
    for (const r of hardened) {
      expect(r.isDefect()).toBe(true);
      if (r.isDefect()) expect(r.cause).toBeInstanceOf(TypeError);
    }
  });

  it("async bind still legitimately accepts BOTH a Result and an AsyncResult", async () => {
    const r = await Do()
      .toAsync()
      .bind("sync", () => Ok(1))
      .bind("async", ({ sync }) => Ok(sync + 1).toAsync());
    expect(r.getOr(null)).toEqual({ sync: 1, async: 2 });
  });
});

describe("Invariant 1c: a deliberate defect(…) in a failure observer preserves the original failure", () => {
  // A branch may return the injected `defect(cause)` marker — freely in
  // `tapErrCases`, and under a `returnType` pin in `flatTapErrCases` (whose
  // `ExhaustiveMatch<Result<…>>` constraint otherwise rejects it). The marker is
  // the lint-clean, expression-position form of a `throw` (Thesis #5), so in
  // BOTH observers it takes the same route: the observed error survives in the
  // AggregateError instead of being replaced by a bare Defect — and
  // `tapErrCases` does not discard it, though it discards every other branch
  // return. (A branch returning a Defect-state *Result* still short-circuits and
  // replaces — an effect that blew up on its own.)
  const original = new Error("original");
  const cause = new Error("caller-cause");

  const expectAggregated = (r: Result<unknown, unknown>) => {
    expect(r.tag).toBe("Defect");
    if (r.isDefect()) {
      expect(r.cause).toBeInstanceOf(AggregateError);
      expect((r.cause as AggregateError).errors).toEqual([cause, original]);
    }
  };

  it("sync flatTapErrCases: the Defect aggregates [the caller's cause, the original error]", () => {
    expectAggregated(
      Err(original).flatTapErrCases((matcher, defect) =>
        matcher.returnType<Result<never, never>>().with(P._, () => defect(cause)),
      ),
    );
  });

  it("async flatTapErrCases: the same, on the awaiting surface", async () => {
    expectAggregated(
      await Err(original)
        .toAsync()
        .flatTapErrCases((matcher, defect) =>
          matcher.returnType<Result<never, never>>().with(P._, () => defect(cause)),
        ),
    );
  });

  it("sync tapErrCases: the marker is NOT discarded — it aggregates like a throw", () => {
    expectAggregated(
      Err(original).tapErrCases((matcher, defect) => matcher.with(P._, () => defect(cause))),
    );
  });

  it("async tapErrCases: the same, on the async surface", async () => {
    expectAggregated(
      await Err(original)
        .toAsync()
        .tapErrCases((matcher, defect) => matcher.with(P._, () => defect(cause))),
    );
  });

  it("tapErrCases still discards an ordinary branch value on both surfaces", async () => {
    const sync = Err(original).tapErrCases((matcher) => matcher.with(P._, () => "ignored"));
    expect(sync.tag).toBe("Err");
    const async_ = await Err(original)
      .toAsync()
      .tapErrCases((matcher) => matcher.with(P._, () => "ignored"));
    expect(async_.tag).toBe("Err");
  });
});

describe("Invariant 2: a Defect flows through every method except match() and recoverDefect()", () => {
  it("success/error combinators pass a Defect through and never call their callback", () => {
    const f = vi.fn();
    const passesThrough = [
      defectOf(boom).map(f),
      defectOf(boom).flatMap(f),
      defectOf(boom).tap(f),
      defectOf(boom).flatTap(f),
      defectOf(boom).bind("a", f),
      defectOf(boom).let("a", f),
      defectOf(boom).as(1),
      defectOf(boom).discard(),
      defectOf(boom).ensure((v) => {
        f(v);
        return true;
      }, f),
      defectOf(boom).mapErrCases((matcher) => matcher.with(P._, f)),
      defectOf(boom).flatMapErrCases((matcher) => matcher.with(P._, f)),
      defectOf(boom).recoverErrCases((matcher) => matcher.with(P._, f)),
      defectOf(boom).tapErrCases((matcher) => matcher.with(P._, f)),
      defectOf(boom).flatTapErrCases((matcher) => matcher.with(P._, f)),
    ];
    for (const r of passesThrough) expect(r.isDefect()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("the recovering eliminators still THROW on a Defect (they recover an Err, not a Defect)", () => {
    const d = defectOf(boom);
    expect(() => d.getOr(0)).toThrow();
    expect(() => d.getOrElse(() => 0)).toThrow();
    expect(() => d.getOrNull()).toThrow();
    expect(() => d.getOrUndefined()).toThrow();
  });

  it("only match(), recoverDefect(), and the defect observers see the Defect", () => {
    expect(
      defectOf(boom).match({
        ok: () => "o",
        errCases: (matcher) => matcher.with(P._, () => "e"),
        defect: () => "d",
      }),
    ).toBe("d");
    expect(
      defectOf(boom)
        .recoverDefect(() => Ok("handled"))
        .get(),
    ).toBe("handled");
    // tapDefect / tapFailure observe WITHOUT consuming — the Defect flows on.
    const observed: string[] = [];
    const d = defectOf(boom)
      .tapDefect(() => observed.push("tapDefect"))
      .tapFailure((f) => observed.push(f.tag));
    expect(observed).toEqual(["tapDefect", "Defect"]);
    expect(d.isDefect()).toBe(true);
  });
});

describe("Invariant 3: get() is asymmetric", () => {
  it("on Err throws a GetError carrying E", () => {
    try {
      // The Err branch is unreachable in typed code (get needs E = never);
      // force it via a cast to exercise the defensive runtime guard.
      (Err("modeled") as unknown as Result<number, never>).get();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GetError);
      expect((e as GetError<string>).error).toBe("modeled");
      // the offending value is also surfaced as the standard Error.cause
      expect((e as GetError<string>).cause).toBe("modeled");
    }
  });

  it("on a Defect rethrows the ORIGINAL cause with its original stack", () => {
    try {
      defectOf(boom).get();
      expect.unreachable();
    } catch (e) {
      expect(e).toBe(boom); // same instance ⇒ original stack preserved
      expect((e as Error).stack).toBe(boom.stack);
    }
  });
});

describe("Invariant 4: recoverErrCases empties the error channel in the type, not the runtime", () => {
  it("recoverErrCases() returns a value whose type is Result<_, never> but may still be a Defect", () => {
    const recovered = defectOf(boom).recoverErrCases((matcher) => matcher.with(P._, () => 1));
    // `never` in the type does not mean total — a Defect survives at runtime.
    expect(recovered.isDefect()).toBe(true);
  });
});

describe("Invariant 5: an AsyncResult's internal promise never rejects", () => {
  it("await always yields a Result and never throws, across all three channels", async () => {
    await expect(fromSafePromise(Promise.resolve(1))).resolves.toMatchObject({});
    await expect(fromSafePromise(Promise.reject(boom))).resolves.toMatchObject({});
    const okR = await fromSafePromise(Promise.resolve(1));
    const defectR = await fromSafePromise(Promise.reject(boom));
    expect(okR.get()).toBe(1);
    expect(defectR.isDefect()).toBe(true);
    await expect(
      fromExecutor<number, never>(() => {
        throw boom;
      }),
    ).resolves.toMatchObject({});
    const executorR = await fromExecutor<number, never>(async () => {
      throw boom;
    });
    expect(executorR.isDefect()).toBe(true);
  });
});

describe("Invariant 6: a DISCARDED thenable is adopted, so its rejection never floats", () => {
  // The observers throw their callback's return value away, and the
  // Result-returning combinators reject a non-Result one. A thenable that
  // slipped past `NotThenable` (a cast, a raw-JS caller) is therefore dropped
  // mid-flight — and an unhandled rejection is process-fatal on Node by
  // default. Worse for an observer: its whole job is to surface a failure, and
  // this is the one path where the failure would be invisible.
  //
  // Asserted POSITIVELY, via `adoptionProbe`: `Promise.resolve(x)` calls
  // `x.then(onFulfilled, onRejected)`, so an `onRejected` function arriving at
  // the fixture is proof the value was adopted. The earlier shape asserted the
  // *absence* of a global `unhandledRejection` after two `setTimeout(0)`s —
  // a negative assertion on a timing heuristic, which cannot tell "never fires"
  // from "fires later than the window", so it could have silently stopped
  // protecting. This settles in one microtask and depends on no timer.
  const expectAdopted = async (run: (thenable: PromiseLike<never>) => unknown): Promise<void> => {
    const { thenable, adoptions } = adoptionProbe();
    // Awaiting settles an AsyncResult's pipeline (a sync Result is not thenable,
    // so this is just a microtask turn); the extra flush lets
    // `Promise.resolve(thenable)` reach the fixture's `then`.
    await run(thenable);
    await flushMicrotasks();
    expect(adoptions).toHaveLength(1);
    expect(typeof adoptions[0]?.onRejected).toBe("function");
  };

  it.each([
    ["tap", (t: PromiseLike<never>) => Ok(1).tap((() => t) as never)],
    ["tapDefect", (t: PromiseLike<never>) => defectOf(boom).tapDefect((() => t) as never)],
    ["tapFailure", (t: PromiseLike<never>) => Err("e" as const).tapFailure((() => t) as never)],
    [
      "tapErrCases",
      (t: PromiseLike<never>) =>
        Err("e" as const).tapErrCases(
          // oxlint-disable-next-line unthrown/no-catch-all-pattern -- `E` here is a single type, not a union of cases
          (m) => m.with(P._, () => t) as never,
        ),
    ],
    ["flatMap", (t: PromiseLike<never>) => Ok(1).flatMap((() => t) as never)],
    ["flatTap", (t: PromiseLike<never>) => Ok(1).flatTap((() => t) as never)],
    ["bind", (t: PromiseLike<never>) => Do().bind("a", (() => t) as never)],
    ["fromExecutor", (t: PromiseLike<never>) => fromExecutor<number, never>(() => t)],
    [
      "fromExecutor settle",
      (t: PromiseLike<never>) =>
        fromExecutor<number, never>((s) => (s as unknown as (v: unknown) => void)(t)),
    ],
  ])("%s adopts a smuggled thenable rather than dropping it", async (_label, run) => {
    await expectAdopted(run);
  });

  it("the async surface adopts it too", async () => {
    await expectAdopted((t) =>
      Ok(1)
        .toAsync()
        .tap((() => t) as never),
    );
    await expectAdopted((t) =>
      defectOf(boom)
        .toAsync()
        .tapDefect((() => t) as never),
    );
    await expectAdopted((t) =>
      Err("e" as const)
        .toAsync()
        .tapFailure((() => t) as never),
    );
  });

  it("the observer still passes the original result through unchanged", () => {
    // Silencing must not change the outcome: `tap` observes, it does not decide.
    const { thenable } = adoptionProbe();
    expect(
      Ok(1)
        .tap((() => thenable) as never)
        .getOr(0),
    ).toBe(1);
    expect(
      Err("e" as const)
        .tapFailure((() => thenable) as never)
        .getOr("fallback"),
    ).toBe("fallback");
  });

  it("an ordinary, non-thenable return is left alone", () => {
    // The guard must not adopt everything — only what looks thenable.
    const { adoptions } = adoptionProbe();
    Ok(1).tap(() => 42);
    expect(adoptions).toHaveLength(0);
  });
});
