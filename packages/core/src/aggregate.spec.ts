import { describe, expect, it } from "vitest";

import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  type AsyncResult,
  Err,
  fromPromise,
  fromSafePromise,
  Ok,
  type Result,
} from "./index.js";

const boom = new Error("boom");
const defectOf = (cause: unknown): Result<number, never> =>
  Ok(0).map<number>(() => {
    throw cause;
  });

describe("all", () => {
  it("collects a tuple of Ok values, preserving positional types", () => {
    const r = all([Ok(1), Ok("two"), Ok(true)]);
    expect(r.unwrap()).toEqual([1, "two", true]);
  });

  it("returns Ok([]) for an empty tuple, typed as the empty tuple (not never[])", () => {
    const r = all([]);
    // Compiles only if the empty input keeps tuple typing `Result<[], never>`
    // rather than collapsing to `Result<never[], never>`.
    const empty: Result<[], never> = r;
    expect(empty.unwrap()).toEqual([]);
  });

  it("short-circuits on the first Err", () => {
    const r = all([Ok(1), Err("first"), Err("second")]);
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("first");
  });

  it("lets any Defect dominate, even over an earlier Err", () => {
    const r = all([Ok(1), Err("e"), defectOf(boom)]);
    expect(r.isDefect()).toBe(true);
    const recovered = r.recoverDefect((c) => Ok(c === boom));
    expect(recovered.isOk()).toBe(true);
    if (recovered.isOk()) expect(recovered.value).toBe(true);
  });

  it("keeps the first Defect when several are present", () => {
    const first = new Error("first");
    const r = all([defectOf(first), defectOf(new Error("second"))]);
    expect(r.recoverDefect((c) => Ok(c === first)).unwrap()).toBe(true);
  });

  it("collapses a dynamic Result[] to Result<T[], E> without a cast", () => {
    // The array overload: no `as` needed, even in a generic-feeling shape.
    const combine = <T, E>(rs: Result<T, E>[]): Result<T[], E> => all(rs);
    const r = combine([Ok(1), Ok(2), Ok(3)] as Result<number, string>[]);
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toEqual([1, 2, 3]);

    const e = combine([Ok(1), Err("bad")] as Result<number, string>[]);
    expect(e.isErr()).toBe(true);
    if (e.isErr()) expect(e.error).toBe("bad");
  });
});

describe("allFromDict", () => {
  it("collects a record of Ok values into a record, keyed by name", () => {
    const r = allFromDict({ id: Ok(1), name: Ok("ada"), admin: Ok(true) });
    // Typed `Result<{ id: number; name: string; admin: boolean }, never>`.
    const value: { id: number; name: string; admin: boolean } = r.unwrap();
    expect(value).toEqual({ id: 1, name: "ada", admin: true });
  });

  it("short-circuits a record on the first Err and lets a Defect dominate", () => {
    const r = allFromDict({ a: Ok(1), b: Err("bad") });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("bad");
    const d = allFromDict({ a: Ok(1), b: Err("e"), c: defectOf(boom) });
    expect(d.isDefect()).toBe(true);
    const recovered = d.recoverDefect((c) => Ok(c === boom));
    expect(recovered.isOk()).toBe(true);
    if (recovered.isOk()) expect(recovered.value).toBe(true);
  });

  it("returns Ok({}) for an empty record", () => {
    expect(allFromDict({}).unwrap()).toEqual({});
  });

  it("does not let a `__proto__` key pollute the prototype", () => {
    const r = allFromDict({ ["__proto__"]: Ok({ polluted: true }), safe: Ok(1) });
    expect(r.isOk()).toBe(true);
    // The dangerous key lands as a normal own property, not on Object.prototype.
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("allAsync", () => {
  it("collects a tuple of AsyncResult Ok values, preserving positional types", async () => {
    const r = await allAsync([
      fromSafePromise(Promise.resolve(1)),
      fromSafePromise(Promise.resolve("two")),
      fromSafePromise(Promise.resolve(true)),
    ]);
    expect(r.unwrap()).toEqual([1, "two", true]);
  });

  it("returns Ok([]) for an empty input", async () => {
    expect((await allAsync([])).unwrap()).toEqual([]);
  });

  it("short-circuits on the first Err", async () => {
    const r = await allAsync([
      fromPromise(Promise.reject("first"), (c) => c as string),
      fromPromise(Promise.reject("second"), (c) => c as string),
    ]);
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("first");
  });

  it("lets any Defect dominate, even over an earlier Err", async () => {
    const r = await allAsync([
      fromPromise(Promise.reject("e"), (c) => c as string),
      fromSafePromise(Promise.reject(boom)),
    ]);
    expect(r.isDefect()).toBe(true);
    const recovered = await r.toAsync().recoverDefect((c) => Ok(c === boom));
    expect(recovered.isOk()).toBe(true);
    if (recovered.isOk()) expect(recovered.value).toBe(true);
  });

  it("never rejects — await always yields a Result", async () => {
    const r = await allAsync([fromSafePromise(Promise.reject(boom))]);
    expect(r.isDefect()).toBe(true);
  });

  it("collapses a dynamic AsyncResult[] to AsyncResult<T[], E> without a cast", async () => {
    const combine = <T, E>(rs: AsyncResult<T, E>[]): AsyncResult<T[], E> => allAsync(rs);
    const r = await combine([
      fromSafePromise(Promise.resolve(1)),
      fromSafePromise(Promise.resolve(2)),
    ]);
    expect(r.unwrap()).toEqual([1, 2]);
  });
});

describe("allFromDictAsync", () => {
  it("collects a record of AsyncResults into a record, keyed by name", async () => {
    const r = await allFromDictAsync({
      id: fromSafePromise(Promise.resolve(1)),
      name: fromSafePromise(Promise.resolve("ada")),
    });
    const value: { id: number; name: string } = r.unwrap();
    expect(value).toEqual({ id: 1, name: "ada" });
  });

  it("short-circuits a record on the first Err", async () => {
    const r = await allFromDictAsync({
      a: fromSafePromise(Promise.resolve(1)),
      b: fromPromise(Promise.reject("bad"), (c) => c as string),
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error).toBe("bad");
  });

  it("lets any Defect dominate over an earlier Err", async () => {
    const r = await allFromDictAsync({
      a: fromPromise(Promise.reject("e"), (c) => c as string),
      b: fromSafePromise(Promise.reject(boom)),
    });
    expect(r.isDefect()).toBe(true);
  });

  it("returns Ok({}) for an empty record", async () => {
    expect((await allFromDictAsync({})).unwrap()).toEqual({});
  });

  it("does not let a `__proto__` key pollute the prototype", async () => {
    const r = await allFromDictAsync({
      ["__proto__"]: fromSafePromise(Promise.resolve({ polluted: true })),
      safe: fromSafePromise(Promise.resolve(1)),
    });
    expect(r.isOk()).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
