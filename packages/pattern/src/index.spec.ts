import { match, P as TP } from "ts-pattern";
import { Err, Ok, type Result, TaggedError } from "unthrown";
import { describe, expect, it } from "vitest";

import * as P from "./index.js";

class NotFound extends TaggedError("NotFound") {}
class Forbidden extends TaggedError("Forbidden")<{ user: string }> {}
type ApiError = NotFound | Forbidden;

const boom = new Error("boom");
const aDefect: Result<number, never> = Ok(0).map<number>(() => {
  throw boom;
});

describe("a Result is natively matchable", () => {
  it("matches directly on its tag, exhaustively", () => {
    const fold = (r: Result<number, string>): string =>
      match(r)
        .with({ tag: "Ok" }, ({ value }) => `ok:${value}`)
        .with({ tag: "Err" }, ({ error }) => `err:${error}`)
        .with({ tag: "Defect" }, ({ cause }) => `defect:${String(cause)}`)
        .exhaustive();

    expect(fold(Ok(2))).toBe("ok:2");
    expect(fold(Err("x"))).toBe("err:x");
    expect(fold(aDefect)).toBe(`defect:${String(boom)}`);
  });
});

describe("pattern constructors", () => {
  const fold = (r: Result<number, ApiError>): string =>
    match(r)
      .with(P.Ok(), ({ value }) => `ok:${value}`)
      // `error.user` only type-checks because P.tag narrows to Forbidden.
      .with(P.Err(P.tag("Forbidden")), ({ error }) => `forbidden:${error.user}`)
      .with(P.Err(P.tag("NotFound")), () => "not-found")
      .with(P.Defect(), () => "defect")
      .exhaustive();

  it("P.Ok / P.Err / P.Defect narrow each channel", () => {
    expect(fold(Ok(5))).toBe("ok:5");
    expect(fold(Err(new NotFound()))).toBe("not-found");
    expect(fold(Err(new Forbidden({ user: "bob" })))).toBe("forbidden:bob");
    expect(fold(aDefect)).toBe("defect");
  });

  it("P.Ok(pattern) constrains and selects the value", () => {
    const out = match(Ok<number>(42) as Result<number, string>)
      .with(P.Ok(TP.select()), (v) => v + 1)
      .otherwise(() => 0);
    expect(out).toBe(43);
  });

  it("constructors return plain ts-pattern object patterns", () => {
    expect(P.Ok()).toEqual({ tag: "Ok" });
    expect(P.Err()).toEqual({ tag: "Err" });
    expect(P.Defect()).toEqual({ tag: "Defect" });
    // with a sub-pattern argument on each channel
    expect(P.Ok(1)).toEqual({ tag: "Ok", value: 1 });
    expect(P.Err("boom")).toEqual({ tag: "Err", error: "boom" });
    expect(P.Defect("cause")).toEqual({ tag: "Defect", cause: "cause" });
    expect(P.tag("X")).toEqual({ _tag: "X" });
  });
});
