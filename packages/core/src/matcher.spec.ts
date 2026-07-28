import { describe, expect, it } from "vitest";

import { match, NonExhaustiveError, P } from "./matcher.js";
import { tag } from "./tagged.js";

describe("the built-in matcher engine", () => {
  it("matches a primitive literal (Object.is semantics)", () => {
    expect(
      match("a" as "a" | "b")
        .with("a", () => 1)
        .with("b", () => 2)
        .run(),
    ).toBe(1);
    expect(
      match(Number.NaN as number)
        .with(Number.NaN, () => "nan")
        .with(P.number, () => "num")
        .run(),
    ).toBe("nan");
  });

  it("matches an object pattern structurally (extra keys ignored, nested literals)", () => {
    type E = { code: "NOT_FOUND"; status: number } | { code: "FORBIDDEN"; status: number };
    const e: E = { code: "NOT_FOUND", status: 404 };
    expect(
      match(e)
        .with({ code: "NOT_FOUND" }, (n) => n.status)
        .with({ code: "FORBIDDEN" }, () => -1)
        .run(),
    ).toBe(404);
    // nested object literal
    const nested = { kind: "x", meta: { level: 2 } } as
      | { kind: "x"; meta: { level: number } }
      | { kind: "y" };
    expect(
      match(nested)
        .with({ meta: { level: 2 } }, () => "deep")
        .with(P._, () => "other")
        .run(),
    ).toBe("deep");
    // an object pattern never matches a primitive value
    expect(
      match("prim" as "prim" | { code: "X" })
        .with({ code: "X" }, () => "obj")
        .with(P._, () => "prim")
        .run(),
    ).toBe("prim");
  });

  it("matches tag() patterns and grouped patterns with one handler", () => {
    type E = { _tag: "A"; a: number } | { _tag: "B" } | { _tag: "C" };
    const run = (e: E) =>
      match(e)
        .with(tag("A"), (a) => `a:${a.a}`)
        .with(tag("B"), tag("C"), (bc) => `bc:${bc._tag}`)
        .run();
    expect(run({ _tag: "A", a: 1 })).toBe("a:1");
    expect(run({ _tag: "B" })).toBe("bc:B");
    expect(run({ _tag: "C" })).toBe("bc:C");
  });

  it("first matching arm wins; later arms are not evaluated", () => {
    let later = 0;
    const out = match("x" as string)
      .with(P.string, () => "first")
      .with(P._, () => {
        later += 1;
        return "second";
      })
      .run();
    expect(out).toBe("first");
    expect(later).toBe(0);
  });

  it("P._ and P.any match anything", () => {
    expect(
      match(123 as unknown)
        .with(P._, (v) => v)
        .run(),
    ).toBe(123);
    expect(
      match(undefined as unknown)
        .with(P.any, () => "caught")
        .run(),
    ).toBe("caught");
  });

  it("P.instanceOf narrows by class, P.when by guard, P.string/P.number by typeof", () => {
    class Boom extends Error {}
    const e: Boom | string | number = new Boom("x");
    expect(
      match(e)
        .with(P.instanceOf(Boom), (b) => b.message)
        .with(P.string, (s) => s)
        .with(P.number, (n) => String(n))
        .run(),
    ).toBe("x");
    expect(
      match(7 as Boom | string | number)
        .with(P.instanceOf(Boom), (b) => b.message)
        .with(P.string, (s) => s)
        .with(P.number, (n) => `n:${n}`)
        .run(),
    ).toBe("n:7");
    const isEven = (v: unknown): v is number => typeof v === "number" && v % 2 === 0;
    expect(
      match(4 as number | string)
        .with(P.when(isEven), () => "even")
        .with(P._, () => "other")
        .run(),
    ).toBe("even");
  });

  it("P.union matches when any sub-pattern matches", () => {
    type E = { _tag: "A" } | { _tag: "B" } | { _tag: "C" };
    const run = (e: E) =>
      match(e)
        .with(P.union(tag("A"), tag("B")), (ab) => `ab:${ab._tag}`)
        .with(tag("C"), () => "c")
        .run();
    expect(run({ _tag: "A" })).toBe("ab:A");
    expect(run({ _tag: "B" })).toBe("ab:B");
    expect(run({ _tag: "C" })).toBe("c");
  });

  it("exhaustive() returns the result; a rogue unmatched value throws NonExhaustiveError", () => {
    expect(
      match("a" as "a")
        .with("a", () => 1)
        .exhaustive(),
    ).toBe(1);
    // A value that slipped past the types (cast) with no matching arm:
    const rogue = match("zzz" as "a").with("a", () => 1);
    expect(() => rogue.run()).toThrowError(NonExhaustiveError);
    try {
      rogue.run();
    } catch (error) {
      expect(error).toBeInstanceOf(NonExhaustiveError);
      expect((error as NonExhaustiveError).input).toBe("zzz");
      expect((error as NonExhaustiveError).message).toContain('"zzz"');
    }
  });

  it("NonExhaustiveError prints non-JSON-serializable inputs via String()", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    const builder = match(cyclic as unknown as "a").with("a", () => 1);
    expect(() => builder.run()).toThrowError(NonExhaustiveError);
    try {
      builder.run();
    } catch (error) {
      expect((error as NonExhaustiveError).message).toContain("[object Object]");
    }
  });

  it("a non-plain object pattern never matches structurally — identity only", () => {
    // A keyless class instance (Date, Error) or a foreign symbol-keyed pattern
    // object (e.g. a real ts-pattern matcher) must NOT vacuously match every
    // object via empty Object.entries — only reference identity matches.
    const value = { anything: true } as unknown as "fallback";
    const datePattern = new Date(0) as unknown as "fallback";
    const errorPattern = new Error("x") as unknown as "fallback";
    const foreignPattern = { [Symbol.for("@ts-pattern/matcher")]: () => ({ matched: true }) };
    expect(
      match(value)
        .with(datePattern, () => "date")
        .with(errorPattern, () => "error")
        .with(foreignPattern as unknown as "fallback", () => "foreign")
        .with(P._, () => "catch-all")
        .run(),
    ).toBe("catch-all");
    // Identity still matches a non-plain object pattern:
    const exact = new Date(0);
    expect(
      match(exact as unknown as "x")
        .with(exact as unknown as "x", () => "same")
        .run(),
    ).toBe("same");
    // Object.create(null) counts as plain (a null-prototype record):
    const bare = Object.create(null) as Record<string, unknown>;
    bare["k"] = 1;
    expect(
      match({ k: 1 } as unknown as "x")
        .with(bare as unknown as "x", () => "bare")
        .run(),
    ).toBe("bare");
  });

  it("arms after a match are inert (builder short-circuits)", () => {
    let sideEffect = 0;
    const out = match({ _tag: "A" } as { _tag: "A" } | { _tag: "B" })
      .with(tag("A"), () => "a")
      .with(tag("B"), () => {
        sideEffect += 1;
        return "b";
      })
      .run();
    expect(out).toBe("a");
    expect(sideEffect).toBe(0);
  });

  it("returnType() pins the output type and is a runtime no-op", () => {
    // The pin is type-level only: the builder is returned unchanged and the
    // match evaluates exactly as it would unpinned.
    expect(
      match("a" as "a" | "b")
        .returnType<number>()
        .with("a", () => 1)
        .with("b", () => 2)
        .run(),
    ).toBe(1);
  });

  it("still throws NonExhaustiveError under a pin when no arm matches", () => {
    // A rogue value that slipped past the types: pinning must not swallow the
    // non-exhaustive throw (the combinators' throw-to-defect net relies on it).
    const rogue = "c" as unknown as "a" | "b";
    expect(() =>
      match(rogue)
        .returnType<number>()
        .with("a", () => 1)
        .with("b", () => 2)
        .run(),
    ).toThrow(NonExhaustiveError);
  });
});
