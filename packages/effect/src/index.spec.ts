import { Cause, Effect, Exit, Result as EffectResult } from "effect";
import { Err, Ok, type Result, OkAsync } from "unthrown";
import { describe, expect, it } from "vitest";

import { fromEffect, fromResult, fromExit, toEffect, toResult, toExit } from "./index.js";

// The fixtures' error channel, spelled as the concrete literal union it
// actually is: `string` would be an ambiguous `E` (Thesis #1), and these
// bridges only ever carry "nope" (a modeled Err) or "x" (an onDefect fold).
type Boom = "nope" | "x";

const boom = new Error("boom");
const aDefect: Result<number, Boom> = Ok(0).map<number>(() => {
  throw boom;
});

describe("toExit", () => {
  it("maps Ok to a success", () => {
    const exit = toExit(Ok(1));
    expect(Exit.isSuccess(exit) ? exit.value : undefined).toBe(1);
  });

  it("maps Err to a modeled failure (Cause.fail)", () => {
    const exit = toExit(Err("nope") as Result<number, Boom>);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(EffectResult.getOrNull(Cause.findError(exit.cause))).toBe("nope");
    }
  });

  it("maps a Defect to a die (Cause.die)", () => {
    const exit = toExit(aDefect);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(EffectResult.getOrNull(Cause.findDefect(exit.cause))).toBe(boom);
    }
  });
});

describe("fromExit", () => {
  it("maps a success to Ok", () => {
    expect(fromExit(Exit.succeed(1))).toMatchObject({ tag: "Ok", value: 1 });
  });

  it("maps a modeled failure to Err", () => {
    expect(fromExit(Exit.fail("nope"))).toMatchObject({ tag: "Err", error: "nope" });
  });

  it("maps a die to a Defect", () => {
    expect(fromExit(Exit.die(boom))).toMatchObject({ tag: "Defect", cause: boom });
  });

  it("maps a pure interruption to a Defect", () => {
    const exit = Exit.failCause(Cause.interrupt()) as Exit.Exit<number, string>;
    expect(fromExit(exit).tag).toBe("Defect");
  });

  it("lets a Defect dominate a modeled failure in a composite cause", () => {
    const exit = Exit.failCause(Cause.combine(Cause.fail("nope"), Cause.die(boom)));
    expect(fromExit(exit as Exit.Exit<number, string>)).toMatchObject({
      tag: "Defect",
      cause: boom,
    });
  });

  it("lets a Defect dominate when it precedes the modeled failure", () => {
    const exit = Exit.failCause(Cause.combine(Cause.die(boom), Cause.fail("nope")));
    expect(fromExit(exit)).toMatchObject({ tag: "Defect", cause: boom });
  });

  it("maps an empty cause to a Defect", () => {
    expect(fromExit(Exit.failCause(Cause.empty)).tag).toBe("Defect");
  });

  it("preserves an undefined modeled error", () => {
    expect(fromExit(Exit.fail(undefined))).toMatchObject({ tag: "Err", error: undefined });
  });

  it("lets an undefined Defect dominate a modeled failure", () => {
    const exit = Exit.failCause(Cause.combine(Cause.fail("nope"), Cause.die(undefined)));
    expect(fromExit(exit)).toMatchObject({ tag: "Defect", cause: undefined });
  });

  it("round-trips Ok/Err/Defect through toExit", () => {
    expect(fromExit(toExit(Ok(1)))).toMatchObject({ tag: "Ok", value: 1 });
    expect(fromExit(toExit(Err("nope") as Result<number, Boom>))).toMatchObject({
      tag: "Err",
      error: "nope",
    });
    expect(fromExit(toExit(aDefect))).toMatchObject({ tag: "Defect", cause: boom });
  });
});

describe("toResult", () => {
  it("maps Ok to Success and Err to Failure", () => {
    expect(EffectResult.getOrNull(toResult(Ok(1), () => "x"))).toBe(1);
    const failure = toResult(Err("nope") as Result<number, Boom>, () => "x");
    expect(EffectResult.isFailure(failure) ? failure.failure : undefined).toBe("nope");
  });

  it("forces a Defect to be triaged into the error channel", () => {
    const failure = toResult(aDefect, (cause) => `bug:${String(cause)}`);
    expect(EffectResult.isFailure(failure) ? failure.failure : undefined).toBe(
      `bug:${String(boom)}`,
    );
  });
});

describe("fromResult", () => {
  it("maps Success to Ok and Failure to Err — never a Defect", () => {
    expect(fromResult(EffectResult.succeed(1))).toMatchObject({ tag: "Ok", value: 1 });
    expect(fromResult(EffectResult.fail("nope"))).toMatchObject({ tag: "Err", error: "nope" });
  });
});

describe("toEffect", () => {
  it("maps a Result's three channels to succeed/fail/die", () => {
    expect(Effect.runSyncExit(toEffect(Ok(1)))).toStrictEqual(Exit.succeed(1));
    expect(Effect.runSyncExit(toEffect(Err("nope") as Result<number, Boom>))).toStrictEqual(
      Exit.fail("nope"),
    );
    const exit = Effect.runSyncExit(toEffect(aDefect));
    expect(Exit.isFailure(exit) && EffectResult.getOrNull(Cause.findDefect(exit.cause))).toBe(boom);
  });

  it("accepts an AsyncResult (the AsyncResult -> Effect direction)", async () => {
    expect(await Effect.runPromise(toEffect(OkAsync(1)))).toBe(1);
    const exit = await Effect.runPromiseExit(toEffect(aDefect.toAsync()));
    expect(Exit.isFailure(exit) && EffectResult.getOrNull(Cause.findDefect(exit.cause))).toBe(boom);
  });
});

describe("fromEffect", () => {
  it("collects succeed/fail/die into Ok/Err/Defect", async () => {
    expect(await fromEffect(Effect.succeed(1))).toMatchObject({ tag: "Ok", value: 1 });
    expect(await fromEffect(Effect.fail("nope"))).toMatchObject({ tag: "Err", error: "nope" });
    expect(await fromEffect(Effect.die(boom))).toMatchObject({ tag: "Defect", cause: boom });
  });
});
