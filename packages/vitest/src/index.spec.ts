import { err, fromSafePromise, ok, type Result, TaggedError } from "unthrown";
import { describe, expect, it } from "vitest";

// Registers the matchers and brings the `Matchers` augmentation into scope.
import "./index.js";

class MyError extends TaggedError("MyError")<{ code: number }> {}

const boom = new Error("boom");
const aDefect: Result<number, never> = ok(0).map<number>(() => {
  throw boom;
});

describe("toBeOk / toBeOkWith", () => {
  it("passes on Ok and fails otherwise", () => {
    expect(ok(1)).toBeOk();
    expect(err("e")).not.toBeOk();
    expect(aDefect).not.toBeOk();
  });

  it("toBeOkWith compares the success value deeply", () => {
    expect(ok(1)).toBeOkWith(1);
    expect(ok({ a: [1, 2] })).toBeOkWith({ a: [1, 2] });
    expect(ok(1)).not.toBeOkWith(2);
    expect(err("e")).not.toBeOkWith(1);
  });
});

describe("toBeErr / toBeErrTagged", () => {
  it("passes on Err and fails otherwise", () => {
    expect(err("e")).toBeErr();
    expect(ok(1)).not.toBeErr();
    expect(aDefect).not.toBeErr();
  });

  it("toBeErrTagged matches a tagged error by its _tag", () => {
    const r: Result<number, MyError> = err(new MyError({ code: 42 }));
    expect(r).toBeErrTagged("MyError");
    expect(r).not.toBeErrTagged("Other");
    expect(err("plain")).not.toBeErrTagged("MyError");
  });

  it("toBeErrTagged matches the payload exactly when given a plain object", () => {
    const r: Result<number, MyError> = err(new MyError({ code: 42 }));
    expect(r).toBeErrTagged("MyError", { code: 42 });
    expect(r).not.toBeErrTagged("MyError", { code: 99 });
    // exact: an extra/missing field fails
    expect(r).not.toBeErrTagged("MyError", { code: 42, extra: true });
  });

  it("toBeErrTagged matches the payload partially with an asymmetric matcher", () => {
    class Multi extends TaggedError("Multi")<{ id: number; msg: string }> {}
    const r: Result<number, Multi> = err(new Multi({ id: 1, msg: "boom" }));
    expect(r).toBeErrTagged("Multi", expect.objectContaining({ id: 1 }));
    expect(r).toBeErrTagged("Multi", { id: 1, msg: "boom" });
    expect(r).not.toBeErrTagged("Multi", expect.objectContaining({ id: 2 }));
    // wrong tag → fails even when the payload sub-pattern would match
    expect(r).not.toBeErrTagged("Other", expect.objectContaining({ id: 1 }));
  });

  it("toBeErrTagged with a payload still requires the right tag", () => {
    const r: Result<number, MyError> = err(new MyError({ code: 42 }));
    expect(r).not.toBeErrTagged("Other", { code: 42 });
  });
});

describe("toBeDefect", () => {
  it("passes on a Defect and fails otherwise", () => {
    expect(aDefect).toBeDefect();
    expect(ok(1)).not.toBeDefect();
    expect(err("e")).not.toBeDefect();
  });
});

describe("AsyncResult matchers (await required)", () => {
  it("awaits the AsyncResult before asserting", async () => {
    await expect(fromSafePromise(Promise.resolve(1))).toBeOk();
    await expect(fromSafePromise(Promise.resolve(1))).toBeOkWith(1);
    await expect(fromSafePromise(Promise.reject(boom))).toBeDefect();
    await expect(fromSafePromise(Promise.resolve(1))).not.toBeErr();
  });
});

describe("non-Result input", () => {
  it("fails rather than throwing when given something that is not a Result", () => {
    expect(42).not.toBeOk();
    expect({}).not.toBeErr();
  });
});
