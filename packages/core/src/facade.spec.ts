import { describe, expect, it } from "vitest";

import {
  all,
  allAsync,
  allFromDictAsync,
  AsyncResult,
  Err,
  fromNullable,
  fromPromise,
  fromSafePromise,
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
    expect(Result.Ok(5).unwrap()).toBe(5);
    expect(Result.Err("e").unwrapErr()).toBe("e");
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
    expect(Result.all).toBe(all);
    expect(Result.fromNullable(null, () => "absent").unwrapErr()).toBe("absent");
    expect(Result.all([Result.Ok(1), Result.Ok(2)]).unwrap()).toEqual([1, 2]);
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
    expect((await AsyncResult.fromSafePromise(Promise.resolve(3))).unwrap()).toBe(3);
    const both = await AsyncResult.all([
      AsyncResult.fromSafePromise(Promise.resolve(1)),
      AsyncResult.fromSafePromise(Promise.resolve(2)),
    ]);
    expect(both.unwrap()).toEqual([1, 2]);
    const dict = await AsyncResult.allFromDict({
      a: AsyncResult.fromSafePromise(Promise.resolve("x")),
    });
    expect(dict.unwrap()).toEqual({ a: "x" });
  });
});
