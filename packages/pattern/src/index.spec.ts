import { match, P as TP } from "ts-pattern";
import { err, ok, type Result, TaggedError } from "unthrown";
import { describe, expect, it } from "vitest";

import * as P from "./index.js";

class NotFound extends TaggedError("NotFound") {}
class Forbidden extends TaggedError("Forbidden")<{ user: string }> {}
type ApiError = NotFound | Forbidden;

const boom = new Error("boom");
const aDefect: Result<number, never> = ok(0).map<number>(() => {
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

    expect(fold(ok(2))).toBe("ok:2");
    expect(fold(err("x"))).toBe("err:x");
    expect(fold(aDefect)).toBe(`defect:${String(boom)}`);
  });
});

describe("pattern constructors", () => {
  const fold = (r: Result<number, ApiError>): string =>
    match(r)
      .with(P.ok(), ({ value }) => `ok:${value}`)
      // `error.user` only type-checks because P.tag narrows to Forbidden.
      .with(P.err(P.tag("Forbidden")), ({ error }) => `forbidden:${error.user}`)
      .with(P.err(P.tag("NotFound")), () => "not-found")
      .with(P.defect(), () => "defect")
      .exhaustive();

  it("P.ok / P.err / P.defect narrow each channel", () => {
    expect(fold(ok(5))).toBe("ok:5");
    expect(fold(err(new NotFound()))).toBe("not-found");
    expect(fold(err(new Forbidden({ user: "bob" })))).toBe("forbidden:bob");
  });

  it("P.ok(pattern) constrains and selects the value", () => {
    const out = match(ok<number>(42) as Result<number, string>)
      .with(P.ok(TP.select()), (v) => v + 1)
      .otherwise(() => 0);
    expect(out).toBe(43);
  });

  it("constructors return plain ts-pattern object patterns", () => {
    expect(P.ok()).toEqual({ tag: "Ok" });
    expect(P.err()).toEqual({ tag: "Err" });
    expect(P.defect()).toEqual({ tag: "Defect" });
    expect(P.ok(1)).toEqual({ tag: "Ok", value: 1 });
    expect(P.tag("X")).toEqual({ _tag: "X" });
  });
});
