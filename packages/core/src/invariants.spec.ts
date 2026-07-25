// Explicit guards for the load-bearing runtime invariants documented in
// CLAUDE.md. Most get a dedicated `describe` here; a couple are guarded where
// their feature lives instead — prototype-pollution safety and `all` / `allAsync`
// Defect-dominance are covered in `aggregate.spec.ts`.

import { describe, expect, it, vi } from "vitest";

import { Do, Err, fromSafePromise, Ok, P, type Result, GetError } from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

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
        .mapErr((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .flatMapErr((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .recoverErr((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .tapErr((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(
      Err("e")
        .flatTapErr((matcher) => matcher.with(P._, t))
        .isDefect(),
    ).toBe(true);
    expect(defectOf(boom).recoverDefect(t).isDefect()).toBe(true);
    expect(defectOf(boom).tapDefect(t).isDefect()).toBe(true);
    expect(Err("e").tapFailure(t).isDefect()).toBe(true);
    expect(defectOf(boom).tapFailure(t).isDefect()).toBe(true);
  });
});

describe("Invariant 1b: a Result-constrained callback returning a non-Result becomes a Defect", () => {
  // Reachable only from untyped/JS callers (in typed code the constraint is a
  // compile error) — hence the `as never` casts. Same policy as the aggregates'
  // non-Result-element guard: a TypeError-caused Defect, never a poison value
  // that throws a raw TypeError later in the pipeline.
  const rogue = (() => 42) as never;

  it("sync: flatMap / flatTap / bind / flatMapErr / flatTapErr / recoverDefect", () => {
    const hardened = [
      Ok(1).flatMap(rogue),
      Ok(1).flatTap(rogue),
      Do().bind("a", rogue),
      Err("e").flatMapErr((matcher) => matcher.with(P._, () => 42 as never)),
      Err("e").flatTapErr((matcher) => matcher.with(P._, () => 42 as never)),
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
        .flatMapErr((matcher) => matcher.with(P._, () => 42 as never)),
      Err("e")
        .toAsync()
        .flatTapErr((matcher) => matcher.with(P._, () => 42 as never)),
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
      defectOf(boom).mapErr((matcher) => matcher.with(P._, f)),
      defectOf(boom).flatMapErr((matcher) => matcher.with(P._, f)),
      defectOf(boom).recoverErr((matcher) => matcher.with(P._, f)),
      defectOf(boom).tapErr((matcher) => matcher.with(P._, f)),
      defectOf(boom).flatTapErr((matcher) => matcher.with(P._, f)),
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
        err: (matcher) => matcher.with(P._, () => "e"),
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

describe("Invariant 4: recoverErr empties the error channel in the type, not the runtime", () => {
  it("recoverErr() returns a value whose type is Result<_, never> but may still be a Defect", () => {
    const recovered = defectOf(boom).recoverErr((matcher) => matcher.with(P._, () => 1));
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
  });
});
