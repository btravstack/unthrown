import { describe, expect, it } from "vitest";

import { defect, err, isDefect, isErr, isOk, ok, type Result, UnwrapError } from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  ok(0).map<number>(() => {
    throw cause;
  });

describe("constructors", () => {
  it("ok wraps a value in the success channel", () => {
    const r = ok(42);
    expect(r.isOk()).toBe(true);
    expect(r.isErr()).toBe(false);
    expect(r.isDefect()).toBe(false);
    expect(r.unwrap()).toBe(42);
  });

  it("err wraps a modeled error", () => {
    const r = err("nope");
    expect(r.isErr()).toBe(true);
    expect(r.isOk()).toBe(false);
    expect(r.isDefect()).toBe(false);
    expect(r.unwrapErr()).toBe("nope");
  });

  it("defect wraps a cause as a qualify-time marker (not a Result)", () => {
    const marker = defect(boom);
    // The marker is opaque; it carries the cause for the boundary to triage.
    expect(marker).toMatchObject({ cause: boom });
    // It is NOT a Result — it has no Result methods.
    expect((marker as unknown as { isOk?: unknown }).isOk).toBeUndefined();
  });
});

describe("standalone guards narrow and expose the relevant field", () => {
  it("isOk narrows to OkView and exposes value", () => {
    const r: Result<number, string> = ok(7);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toBe(7);
    }
  });

  it("isErr narrows to ErrView and exposes error", () => {
    const r: Result<number, string> = err("bad");
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
    const o = ok(1);
    const e = err("e");
    const d = defectOf(boom);
    expect([isOk(o), isErr(o), isDefect(o)]).toEqual([true, false, false]);
    expect([isOk(e), isErr(e), isDefect(e)]).toEqual([false, true, false]);
    expect([isOk(d), isErr(d), isDefect(d)]).toEqual([false, false, true]);
  });
});

describe("method guards narrow (parity with the standalone guards)", () => {
  it("r.isOk() narrows to OkView and exposes value", () => {
    const r: Result<number, string> = ok(7);
    if (r.isOk()) {
      // Only compiles because `.isOk()` is a `this is OkView` predicate.
      expect(r.value).toBe(7);
    } else {
      expect.fail("expected Ok");
    }
  });

  it("r.isErr() narrows to ErrView and exposes error", () => {
    const r: Result<number, string> = err("bad");
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

describe("UnwrapError", () => {
  it("carries the offending error and is an Error instance", () => {
    const e = new UnwrapError("payload");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(UnwrapError);
    expect(e.name).toBe("UnwrapError");
    expect(e.error).toBe("payload");
  });
});
