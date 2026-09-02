import { describe, expect, it, vi } from "vitest";

import { Err, ErrAsync, Ok, OkAsync, SagaAsync } from "./index.js";
import { boom, defectOf, expectDefect, expectErr, expectOk } from "./test-helpers.js";

describe("SagaAsync", () => {
  it("answers the last step's value when every step succeeds", async () => {
    const result = await SagaAsync()
      .step(() => OkAsync(1))
      .step(() => OkAsync("done"))
      .run();
    expectOk(result, "done");
  });

  it("answers Ok(undefined) for a saga with no steps", async () => {
    expectOk(await SagaAsync().run(), undefined);
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
    expectErr(result, "denied");
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
    expectErr(result, "shipping is down");
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
      .step(() => defectOf(boom))
      .run();
    expectDefect(result, boom);
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
    expectDefect(result, boom);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("accepts a synchronous Result from a step", async () => {
    expectErr(
      await SagaAsync()
        .step(() => Ok(1))
        .step(() => Err("denied"))
        .run(),
      "denied",
    );
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
    expectDefect(result, boom);
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
