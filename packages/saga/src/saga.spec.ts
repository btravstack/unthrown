import "@unthrown/vitest";
import { Err, ErrAsync, Ok, OkAsync } from "unthrown";
import { describe, expect, it, vi } from "vitest";

import { SagaAsync } from "./index.js";

/** The stock thrown cause, so specs do not each mint their own. */
const boom = new Error("boom");

/**
 * A Defect-state `Result` carrying `boom`. Going through `map` is deliberate: a
 * defect has no public constructor, so a throw inside a combinator is the only
 * way to mint one.
 */
const defectOf = () =>
  Ok(0).map((): number => {
    // oxlint-disable-next-line unthrown/no-throw -- the defect channel is the subject here, and a throw inside a combinator is the only way to reach it
    throw boom;
  });

describe("SagaAsync", () => {
  it("answers the last step's value when every step succeeds", async () => {
    const result = await SagaAsync()
      .step(() => OkAsync(1))
      .step(() => OkAsync("done"))
      .run();
    expect(result).toBeOkWith("done");
  });

  it("answers Ok(undefined) for a saga with no steps", async () => {
    // GIVEN nothing to do
    // WHEN it is run
    // THEN the empty saga is a success carrying nothing
    await expect(SagaAsync().run()).toBeOkWith(undefined);
  });

  it("runs the steps in order and stops at the first failure", async () => {
    const order: string[] = [];
    const later = vi.fn(() => OkAsync("never"));
    const result = await SagaAsync()
      .step(() => {
        order.push("a");
        return OkAsync(1);
      })
      .step(() => {
        order.push("b");
        return ErrAsync("denied");
      })
      .step(later)
      .run();
    expect(result).toBeErrWith("denied");
    expect(order).toEqual(["a", "b"]);
    expect(later).not.toHaveBeenCalled();
  });

  it("unwinds the undos last-in, first-out", async () => {
    const undone: string[] = [];
    const result = await SagaAsync()
      .step(
        () => OkAsync("placed"),
        () => {
          undone.push("placement");
          return OkAsync();
        },
      )
      .step(
        () => OkAsync("reserved"),
        () => {
          undone.push("stock");
          return OkAsync();
        },
      )
      .step(() => ErrAsync("shipping is down"))
      .run();
    expect(result).toBeErrWith("shipping is down");
    expect(undone).toEqual(["stock", "placement"]);
  });

  it("hands an undo the value its own step produced", async () => {
    const released: unknown[] = [];
    await SagaAsync()
      .step(
        () => OkAsync({ id: "o-1" }),
        (order) => {
          released.push(order.id);
          return OkAsync();
        },
      )
      .step(() => OkAsync({ id: "o-2" }))
      .step(() => ErrAsync("shipping is down"))
      .run();
    expect(released).toEqual(["o-1"]);
  });

  it("does not run the undo of the step that failed", async () => {
    const undo = vi.fn(() => OkAsync());
    await SagaAsync()
      .step(() => ErrAsync("denied"), undo)
      .run();
    expect(undo).not.toHaveBeenCalled();
  });

  it("unwinds on a Defect and answers it unchanged", async () => {
    const undone: string[] = [];
    const result = await SagaAsync()
      .step(
        () => OkAsync("placed"),
        () => {
          undone.push("placement");
          return OkAsync();
        },
      )
      .step(() => defectOf())
      .run();
    expect(result).toBeDefectWith(boom);
    expect(undone).toEqual(["placement"]);
  });

  it("turns a throwing step into a Defect and still unwinds", async () => {
    const undo = vi.fn(() => OkAsync());
    const result = await SagaAsync()
      .step(() => OkAsync("placed"), undo)
      .step((): never => {
        throw boom;
      })
      .run();
    expect(result).toBeDefectWith(boom);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("accepts a synchronous Result from a step", async () => {
    // GIVEN steps that answer a plain `Result` rather than an `AsyncResult`
    // WHEN the saga runs them
    const result = await SagaAsync()
      .step(() => Ok(1))
      .step(() => Err("denied"))
      .run();

    // THEN both forms are accepted, and the failure comes back unchanged
    expect(result).toBeErrWith("denied");
  });

  it("turns a step that answers something other than a Result into a Defect", async () => {
    // GIVEN a step that a cast — or untyped JavaScript — smuggled past the
    // types, answering a number instead of a `Result`
    const outOfContract = () => 42 as unknown as ReturnType<typeof OkAsync<number>>;

    // WHEN the saga runs it
    const result = await SagaAsync().step(outOfContract).run();

    // THEN it is a Defect rather than a rejection: reading `.isOk()` off a
    // number would throw where nothing catches, and an `AsyncResult` promises
    // its internal promise never rejects
    expect(result).toBeDefectWith(expect.objectContaining({ constructor: TypeError }));
  });

  it("answers a defect thrown by an undo, and runs the remaining undos first", async () => {
    const undone: string[] = [];
    const result = await SagaAsync()
      .step(
        () => OkAsync("placed"),
        () => {
          undone.push("placement");
          return OkAsync();
        },
      )
      .step(
        () => OkAsync("reserved"),
        (): never => {
          throw boom;
        },
      )
      .step(() => ErrAsync("shipping is down"))
      .run();
    // The broken compensation wins over the failure that triggered it — and
    // the undo below it still ran.
    expect(result).toBeDefectWith(boom);
    expect(undone).toEqual(["placement"]);
  });

  it("runs nothing until run() is called", async () => {
    const step = vi.fn(() => OkAsync(1));
    const saga = SagaAsync().step(step);
    expect(step).not.toHaveBeenCalled();
    await saga.run();
    expect(step).toHaveBeenCalledTimes(1);
  });
});
