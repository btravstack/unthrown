import { describe, expect, it } from "vitest";

import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  AsyncResult,
  Do,
  Err,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromSafeThrowable,
  fromThrowable,
  isDefect,
  isErr,
  isOk,
  isResult,
  Ok,
  Result,
} from "./index.js";

const boom = new Error("boom");

describe("Result facade mirrors the free functions", () => {
  it("exposes the same constructors", () => {
    expect(Result.Ok(5).get()).toBe(5);
    expect(Result.Err("e").getErr()).toBe("e");
    expect(Result.Ok).toBe(Ok);
    expect(Result.Err).toBe(Err);
  });

  it("exposes the same guards", () => {
    expect(Result.isOk).toBe(isOk);
    expect(Result.isErr).toBe(isErr);
    expect(Result.isDefect).toBe(isDefect);
    expect(Result.isResult).toBe(isResult);

    const d = Result.Ok(1).map(() => {
      throw boom;
    });
    expect(Result.isOk(Result.Ok(1))).toBe(true);
    expect(Result.isErr(Result.Err("e"))).toBe(true);
    expect(Result.isDefect(d)).toBe(true);
    expect(Result.isResult(Result.Ok(1))).toBe(true);
    expect(Result.isResult(42)).toBe(false);
  });

  it("exposes the sync interop and aggregate entry points", () => {
    expect(Result.fromNullable).toBe(fromNullable);
    expect(Result.fromThrowable).toBe(fromThrowable);
    expect(Result.fromSafeThrowable).toBe(fromSafeThrowable);
    expect(Result.Do).toBe(Do);
    expect(Result.all).toBe(all);
    expect(Result.allFromDict).toBe(allFromDict);
    expect(Result.fromNullable(null, () => "absent").getErr()).toBe("absent");
    expect(Result.all([Result.Ok(1), Result.Ok(2)]).get()).toEqual([1, 2]);
    expect(Result.allFromDict({ a: Result.Ok(1) }).get()).toEqual({ a: 1 });
  });

  it("does NOT carry the async entry points (those live on AsyncResult)", () => {
    expect("fromPromise" in Result).toBe(false);
    expect("fromSafePromise" in Result).toBe(false);
    expect("allAsync" in Result).toBe(false);
    expect("allFromDictAsync" in Result).toBe(false);
  });
});

describe("AsyncResult facade groups the async-producing entry points", () => {
  it("aliases the free functions, dropping the Async suffix on the aggregates", () => {
    expect(AsyncResult.fromPromise).toBe(fromPromise);
    expect(AsyncResult.fromSafePromise).toBe(fromSafePromise);
    expect(AsyncResult.all).toBe(allAsync);
    expect(AsyncResult.allFromDict).toBe(allFromDictAsync);
  });

  it("constructs and aggregates async results", async () => {
    expect((await AsyncResult.fromSafePromise(Promise.resolve(3))).get()).toBe(3);
    const both = await AsyncResult.all([
      AsyncResult.fromSafePromise(Promise.resolve(1)),
      AsyncResult.fromSafePromise(Promise.resolve(2)),
    ]);
    expect(both.get()).toEqual([1, 2]);
    const dict = await AsyncResult.allFromDict({
      a: AsyncResult.fromSafePromise(Promise.resolve("x")),
    });
    expect(dict.get()).toEqual({ a: "x" });
  });
});
