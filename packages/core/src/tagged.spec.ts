import { describe, expect, it } from "vitest";

import {
  type AsyncResult,
  err,
  fromSafePromise,
  matchTags,
  ok,
  type Result,
  TaggedError,
} from "./index.js";

class NotFound extends TaggedError("NotFound") {}
class Forbidden extends TaggedError("Forbidden")<{ user: string }> {}
class HttpError extends TaggedError("HttpError")<{ status: number; message: string }> {}
type ApiError = NotFound | Forbidden | HttpError;

describe("TaggedError", () => {
  it("constructs a payload-less error with no arguments", () => {
    const e = new NotFound();
    expect(e._tag).toBe("NotFound");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(NotFound);
    expect(e.name).toBe("NotFound");
  });

  it("constructs an error carrying its payload", () => {
    const e = new Forbidden({ user: "bob" });
    expect(e._tag).toBe("Forbidden");
    expect(e.user).toBe("bob");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(Forbidden);
  });

  it("forwards a `message` payload field to Error", () => {
    const e = new HttpError({ status: 500, message: "boom" });
    expect(e.message).toBe("boom");
    expect(e.status).toBe(500);
    expect(e._tag).toBe("HttpError");
  });

  it("keeps `_tag` authoritative even if the payload tries to set it", () => {
    const e = new Forbidden({ user: "x", _tag: "spoofed" } as { user: string });
    expect(e._tag).toBe("Forbidden");
  });

  it("distinct tags produce distinct, discriminable classes", () => {
    const errors: ApiError[] = [new NotFound(), new Forbidden({ user: "a" })];
    expect(errors.map((e) => e._tag)).toEqual(["NotFound", "Forbidden"]);
  });
});

describe("matchTags", () => {
  const fold = (r: Result<number, ApiError>): string =>
    matchTags(r, {
      Ok: (n) => `ok:${n}`,
      Defect: (cause) => `defect:${String(cause)}`,
      NotFound: () => "not-found",
      Forbidden: (e) => `forbidden:${e.user}`,
      HttpError: (e) => `http:${e.status}`,
    });

  it("dispatches Ok to the Ok handler", () => {
    expect(fold(ok(7))).toBe("ok:7");
  });

  it("dispatches each tagged error to the handler matching its _tag", () => {
    expect(fold(err(new NotFound()))).toBe("not-found");
    expect(fold(err(new Forbidden({ user: "bob" })))).toBe("forbidden:bob");
    expect(fold(err(new HttpError({ status: 503, message: "down" })))).toBe("http:503");
  });

  it("narrows each error variant to its payload in its handler", () => {
    // `e.user` / `e.status` below only typecheck because the variant is narrowed.
    const r: Result<number, ApiError> = err(new Forbidden({ user: "alice" }));
    expect(fold(r)).toBe("forbidden:alice");
  });

  it("dispatches a Defect to the Defect handler", () => {
    const boom = new Error("kaboom");
    const r = ok(0).map<number>(() => {
      throw boom;
    }) as Result<number, ApiError>;
    expect(fold(r)).toBe(`defect:${String(boom)}`);
  });

  it("folds an AsyncResult to a Promise", async () => {
    const r = fromSafePromise(Promise.resolve(1)) as unknown as AsyncResult<number, ApiError>;
    const out = await matchTags(r, {
      Ok: (n) => `ok:${n}`,
      Defect: () => "defect",
      NotFound: () => "nf",
      Forbidden: () => "fb",
      HttpError: () => "he",
    });
    expect(out).toBe("ok:1");
  });
});
