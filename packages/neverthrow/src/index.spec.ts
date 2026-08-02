import {
  errAsync,
  okAsync,
  ResultAsync,
  err as neverthrowErr,
  ok as neverthrowOk,
} from "neverthrow";
import { Err, Ok, type Result } from "unthrown";
import { describe, expect, it } from "vitest";

import { fromNeverthrow, fromNeverthrowAsync, toNeverthrow, toNeverthrowAsync } from "./index.js";

// The fixtures' error channel, spelled as the concrete literal union it
// actually is: `string` would be an ambiguous `E` (Thesis #1), and these
// bridges only ever carry "nope" (a modeled Err) or "x" (an onDefect fold).
type Boom = "nope" | "x";

const boom = new Error("boom");
const aDefect: Result<number, Boom> = Ok(0).map<number>(() => {
  throw boom;
});

describe("toNeverthrow", () => {
  it("maps Ok and Err across", () => {
    const okR = toNeverthrow(Ok(1), () => "x");
    expect(okR.isOk() && okR.value).toBe(1);
    const errR = toNeverthrow(Err("nope") as Result<number, Boom>, () => "x");
    expect(errR.isErr() && errR.error).toBe("nope");
  });

  it("forces a Defect to be triaged into the error channel", () => {
    const r = toNeverthrow(aDefect, (cause) => `bug:${String(cause)}`);
    expect(r.isErr() && r.error).toBe(`bug:${String(boom)}`);
  });
});

describe("fromNeverthrow", () => {
  it("maps Ok to Ok and Err to Err — never a Defect", () => {
    expect(fromNeverthrow(neverthrowOk(1))).toMatchObject({ tag: "Ok", value: 1 });
    expect(fromNeverthrow(neverthrowErr("nope"))).toMatchObject({ tag: "Err", error: "nope" });
  });
});

describe("toNeverthrowAsync", () => {
  it("maps Ok across and triages a Defect", async () => {
    const okR = await toNeverthrowAsync(Ok(1).toAsync(), () => "x");
    expect(okR.isOk() && okR.value).toBe(1);
    const defR = await toNeverthrowAsync(aDefect.toAsync(), (cause) => `bug:${String(cause)}`);
    expect(defR.isErr() && defR.error).toBe(`bug:${String(boom)}`);
  });
});

describe("fromNeverthrowAsync", () => {
  it("maps okAsync/errAsync, and an unexpected rejection to a Defect", async () => {
    expect(await fromNeverthrowAsync(okAsync(1))).toMatchObject({ tag: "Ok", value: 1 });
    expect(await fromNeverthrowAsync(errAsync("nope"))).toMatchObject({
      tag: "Err",
      error: "nope",
    });
    const rejecting: ResultAsync<number, string> = ResultAsync.fromSafePromise(
      Promise.reject(boom),
    );
    expect(await fromNeverthrowAsync(rejecting)).toMatchObject({ tag: "Defect", cause: boom });
  });
});
