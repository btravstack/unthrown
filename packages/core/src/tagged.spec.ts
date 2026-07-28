import { describe, expect, it } from "vitest";

import {
  type AsyncResult,
  Err,
  fromSafePromise,
  Ok,
  P,
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

  it("keeps `message` reserved — a payload `message` cannot set Error.message", () => {
    class UserError extends TaggedError("UserError")<{ user: string }> {}
    // An untyped/JS caller sneaks a `message` past the compile-time reservation.
    const e = new UserError({ user: "Bob", message: "sneaky" } as { user: string });
    expect(e.message).toBe(""); // dropped — message is not sourced from the payload
    expect(e.user).toBe("Bob");
  });

  it("keeps `stack` reserved — an untyped payload `stack` cannot clobber the real trace", () => {
    class UserError extends TaggedError("UserError")<{ user: string }> {}
    // An untyped/JS caller sneaks a `stack` past the compile-time reservation.
    const e = new UserError({ user: "Eve", stack: 123 } as unknown as { user: string });
    expect(e.stack).not.toBe(123); // the genuine Error trace survives
    expect(typeof e.stack).toBe("string");
    expect(e.user).toBe("Eve");
  });

  it("allows `cause` as a payload field (deliberately not reserved — Error.cause is unknown)", () => {
    const driverFailure = new Error("driver blew up");
    class DriverError extends TaggedError("DriverError")<{ cause: unknown }> {}
    const e = new DriverError({ cause: driverFailure });
    expect(e.cause).toBe(driverFailure);
    expect(e._tag).toBe("DriverError");
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

  it("still dispatches on the namespaced _tag via match's error matcher", () => {
    class Retryable extends TaggedError("@my-lib/Retryable", { name: "Retryable" }) {}
    const out = (Err(new Retryable()) as Result<number, Retryable>).match({
      ok: (n) => `ok:${n}`,
      defect: () => "defect",
      errCases: (matcher) => matcher.with(P.tag("@my-lib/Retryable"), (e) => `retry:${e.name}`),
    });
    expect(out).toBe("retry:Retryable");
  });
});

// The per-tag exhaustive fold that `matchTags` used to provide is now `match`
// with its `errCases` handler driven by the error matcher and `P.tag(t)`.
describe("match — per-tag error matching", () => {
  const fold = (r: Result<number, ApiError>): string =>
    r.match({
      ok: (n) => `ok:${n}`,
      defect: (cause) => `defect:${String(cause)}`,
      errCases: (matcher) =>
        matcher
          .with(P.tag("NotFound"), () => "not-found")
          .with(P.tag("Forbidden"), (e) => `forbidden:${e.user}`)
          .with(P.tag("HttpError"), (e) => `http:${e.status}`),
    });

  it("dispatches Ok to the ok handler", () => {
    expect(fold(Ok(7))).toBe("ok:7");
  });

  it("dispatches each tagged error to the branch matching its _tag", () => {
    expect(fold(Err(new NotFound()))).toBe("not-found");
    expect(fold(Err(new Forbidden({ user: "bob" })))).toBe("forbidden:bob");
    expect(fold(Err(new HttpError({ status: 503 })))).toBe("http:503");
  });

  it("narrows each error variant to its payload in its branch", () => {
    // `e.user` / `e.status` below only typecheck because the variant is narrowed.
    const r: Result<number, ApiError> = Err(new Forbidden({ user: "alice" }));
    expect(fold(r)).toBe("forbidden:alice");
  });

  it("dispatches a Defect to the defect handler", () => {
    const boom = new Error("kaboom");
    const r = Ok(0).map<number>(() => {
      throw boom;
    }) as Result<number, ApiError>;
    expect(fold(r)).toBe(`defect:${String(boom)}`);
  });

  it("folds an AsyncResult to a Promise", async () => {
    const r = fromSafePromise(Promise.resolve(1)) as unknown as AsyncResult<number, ApiError>;
    const out = await r.match({
      ok: (n) => `ok:${n}`,
      defect: () => "defect",
      errCases: (matcher) =>
        matcher
          .with(P.tag("NotFound"), () => "nf")
          .with(P.tag("Forbidden"), () => "fb")
          .with(P.tag("HttpError"), () => "he"),
    });
    expect(out).toBe("ok:1");
  });

  it("the P._ escape hatch reaches every error when no case is named", () => {
    const uniform = (r: Result<number, ApiError>): string =>
      r.match({
        ok: (n) => `ok:${n}`,
        defect: () => "defect",
        errCases: (matcher) => matcher.with(P._, (e) => `err:${e._tag}`),
      });
    expect(uniform(Err(new NotFound()))).toBe("err:NotFound");
    expect(uniform(Err(new HttpError({ status: 500 })))).toBe("err:HttpError");
  });

  it("throws NonExhaustiveError on a rogue _tag slipped past the types (edge elimination — not routed to Defect)", () => {
    class Known extends TaggedError("Known") {}
    const rogue = { _tag: "Rogue" } as unknown as Known;
    expect(() =>
      (Err(rogue) as Result<number, Known>).match({
        ok: () => "ok",
        defect: () => "defect",
        errCases: (matcher) => matcher.with(P.tag("Known"), () => "known"),
      }),
    ).toThrow();
  });
});
