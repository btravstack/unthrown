import { describe, expect, it } from "vitest";

import {
  type AsyncResult,
  Err,
  fromSafePromise,
  matchTags,
  Ok,
  type Result,
  TaggedError,
} from "./index.js";

class NotFound extends TaggedError("NotFound") {}
class Forbidden extends TaggedError("Forbidden")<{ user: string }> {}
class HttpError extends TaggedError("HttpError")<{ status: number }> {}
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

  it("defines Error.message per subclass via a standard `override message` field", () => {
    class Timeout extends TaggedError("Timeout") {
      override message = "request timed out";
    }
    const e = new Timeout();
    expect(e.message).toBe("request timed out");
    expect(e._tag).toBe("Timeout");
  });

  it("lets the message field interpolate the payload fields via `this`", () => {
    class RangeErr extends TaggedError("RangeErr")<{ min: number; max: number }> {
      override message = `expected ${this.min}..${this.max}`;
    }
    const e = new RangeErr({ min: 1, max: 9 });
    expect(e.message).toBe("expected 1..9");
    expect(e.min).toBe(1);
    expect(e._tag).toBe("RangeErr");
  });

  it("leaves Error.message empty when the subclass does not set one", () => {
    class Bare extends TaggedError("Bare") {}
    expect(new Bare().message).toBe("");
  });

  it("keeps `_tag` authoritative even if the payload tries to set it", () => {
    const e = new Forbidden({ user: "x", _tag: "spoofed" } as { user: string });
    expect(e._tag).toBe("Forbidden");
  });

  it("keeps `name` reserved — a payload `name` cannot shadow the display name", () => {
    class UserError extends TaggedError("UserError")<{ user: string }> {}
    const e = new UserError({ user: "Alice", name: "Alice" } as { user: string });
    expect(e.name).toBe("UserError"); // display label, not the payload's `name`
    expect(e.user).toBe("Alice");
  });

  it("distinct tags produce distinct, discriminable classes", () => {
    const errors: ApiError[] = [new NotFound(), new Forbidden({ user: "a" })];
    expect(errors.map((e) => e._tag)).toEqual(["NotFound", "Forbidden"]);
  });

  it("defaults Error.name to the tag", () => {
    class Plain extends TaggedError("Plain") {}
    expect(new Plain().name).toBe("Plain");
  });

  it("decouples Error.name from a namespaced _tag via options.name", () => {
    class Retryable extends TaggedError("@my-lib/Retryable", { name: "Retryable" }) {
      override message = "boom";
    }
    const e = new Retryable();
    expect(e._tag).toBe("@my-lib/Retryable"); // namespaced discriminant
    expect(e.name).toBe("Retryable"); // clean display name
    expect(e.message).toBe("boom");
  });

  it("still dispatches on the namespaced _tag in matchTags", () => {
    class Retryable extends TaggedError("@my-lib/Retryable", { name: "Retryable" }) {}
    const out = matchTags(Err(new Retryable()) as Result<number, Retryable>, {
      Ok: (n) => `ok:${n}`,
      Defect: () => "defect",
      "@my-lib/Retryable": (e) => `retry:${e.name}`,
    });
    expect(out).toBe("retry:Retryable");
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
    expect(fold(Ok(7))).toBe("ok:7");
  });

  it("dispatches each tagged error to the handler matching its _tag", () => {
    expect(fold(Err(new NotFound()))).toBe("not-found");
    expect(fold(Err(new Forbidden({ user: "bob" })))).toBe("forbidden:bob");
    expect(fold(Err(new HttpError({ status: 503 })))).toBe("http:503");
  });

  it("narrows each error variant to its payload in its handler", () => {
    // `e.user` / `e.status` below only typecheck because the variant is narrowed.
    const r: Result<number, ApiError> = Err(new Forbidden({ user: "alice" }));
    expect(fold(r)).toBe("forbidden:alice");
  });

  it("dispatches a Defect to the Defect handler", () => {
    const boom = new Error("kaboom");
    const r = Ok(0).map<number>(() => {
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

  it("routes an error with an unhandled _tag to the Defect handler instead of crashing", () => {
    class Known extends TaggedError("Known") {}
    const rogue = { _tag: "Rogue" } as unknown as Known;
    const out = matchTags(Err(rogue), {
      Ok: () => "ok",
      Defect: (cause) => `defect:${(cause as { _tag: string })._tag}`,
      Known: () => "known",
    });
    expect(out).toBe("defect:Rogue");
  });

  it("routes an error whose _tag is the reserved 'Ok' to the Defect handler", () => {
    class Known extends TaggedError("Known") {}
    const rogue = { _tag: "Ok" } as unknown as Known;
    const out = matchTags(Err(rogue), {
      Ok: () => "ok",
      Defect: () => "defect",
      Known: () => "known",
    });
    expect(out).toBe("defect");
  });

  it("routes an error whose _tag is the reserved 'Defect' to the Defect handler", () => {
    class Known extends TaggedError("Known") {}
    const rogue = { _tag: "Defect" } as unknown as Known;
    const out = matchTags(Err(rogue), {
      Ok: () => "ok",
      Defect: () => "defect",
      Known: () => "known",
    });
    expect(out).toBe("defect");
  });

  it("routes a rogue _tag that collides with an inherited Object.prototype member (e.g. 'constructor') to the Defect handler, not the prototype's value", () => {
    class Known extends TaggedError("Known") {}
    const rogue = { _tag: "constructor" } as unknown as Known;
    const out = matchTags(Err(rogue), {
      Ok: () => "ok",
      Defect: (cause) => `defect:${(cause as { _tag: string })._tag}`,
      Known: () => "known",
    });
    expect(out).toBe("defect:constructor");
  });
});
