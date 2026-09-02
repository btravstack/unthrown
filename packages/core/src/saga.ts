// The saga: a sequence whose steps carry compensating undos, unwound LIFO when
// a later step fails. `DoAsync` is the sibling for a sequence that only ever
// goes forward.

import { AsyncRes, defectRes, okRes } from "./core.js";
import type { AsyncResult, Awaitable, Result } from "./types.js";

/**
 * What a step or an undo may hand back: a `Result`, or an `AsyncResult`.
 *
 * Spelled `Awaitable & { flatMap }` rather than `AsyncResult`, exactly as
 * `flatMap`'s async branch is: inference runs through the `Awaitable`
 * then-channel so `T` and `E` stay precise instead of collapsing to `unknown`,
 * while the marker still rejects a bare `Promise`, which has no `flatMap`.
 */
type Produced<T, E> = Result<T, E> | (Awaitable<Result<T, E>> & { flatMap: unknown });

/** One recorded step: how to run it, and (optionally) how to take it back. */
type Step = {
  readonly run: () => Produced<unknown, unknown>;
  readonly undo: ((value: never) => Produced<unknown, never>) | undefined;
};

/**
 * The builder {@link SagaAsync} returns: steps in, one `AsyncResult` out.
 *
 * @typeParam T - what the last step produced, and what `run()` answers.
 * @typeParam E - the union of every step's modeled error type.
 *
 * @category Saga
 */
export type SagaAsyncBuilder<T, E> = {
  /**
   * Add a step, with the undo that takes it back.
   *
   * @remarks
   * `run` is a **thunk**: an `AsyncResult` starts on construction, so a step
   * built eagerly would run before the saga reached it. `undo` receives the
   * value the step produced and answers `AsyncResult<unknown, never>` —
   * compensation may not invent a new way for the saga to fail, because the
   * caller is already handling the failure that triggered it.
   */
  readonly step: <T2, E2>(
    run: () => Produced<T2, E2>,
    undo?: (value: T2) => Produced<unknown, never>,
  ) => SagaAsyncBuilder<T2, E | E2>;
  /** Run the steps in order, unwinding LIFO on the first failure. */
  readonly run: () => AsyncResult<T, E>;
};

/**
 * Adopt whatever a step handed back — a `Result`, an `AsyncResult`, or a throw.
 *
 * A thrown step is a `Defect`, exactly as it would be inside `flatMap`; a
 * rejecting thenable slipped past the types is one too, so the promise this
 * saga folds over never rejects.
 */
const settle = async (
  produce: () => Produced<unknown, unknown>,
): Promise<Result<unknown, unknown>> => {
  try {
    return await produce();
  } catch (cause) {
    return defectRes(cause);
  }
};

/**
 * Run the recorded undos in reverse, best effort.
 *
 * Every one runs even when an earlier one defected — stopping would leave the
 * steps before it uncompensated, which is the state the saga exists to avoid.
 * The FIRST defect is what comes back, since a compensation that broke is worse
 * news than the failure that triggered it.
 */
const unwind = async (undos: readonly (() => Produced<unknown, never>)[]) => {
  let broken: Result<never, never> | undefined;
  for (const undo of [...undos].reverse()) {
    const settled = await settle(undo);
    if (settled.isDefect() && broken === undefined) broken = settled as Result<never, never>;
  }
  return broken;
};

const build = <T, E>(steps: readonly Step[]): SagaAsyncBuilder<T, E> => ({
  step: <T2, E2>(run: () => Produced<T2, E2>, undo?: (value: T2) => Produced<unknown, never>) =>
    build<T2, E | E2>([...steps, { run: run as Step["run"], undo: undo as Step["undo"] }]),
  run: () =>
    new AsyncRes<T, E>(
      (async (): Promise<Result<T, E>> => {
        const undos: (() => Produced<unknown, never>)[] = [];
        let last: unknown = undefined;
        for (const step of steps) {
          const settled = await settle(step.run);
          if (!settled.isOk()) return (await unwind(undos)) ?? (settled as Result<T, E>);
          last = settled.value;
          const { undo } = step;
          if (undo !== undefined) {
            // Bound to the value HERE: the loop's `last` moves on, and an undo
            // reading it later would compensate with the wrong step's output.
            const value = last;
            undos.push(() => undo(value as never));
          }
        }
        return okRes<T, E>(last as T);
      })(),
    ),
});

/**
 * Start a saga: a sequence of steps, each with an optional compensating undo,
 * unwound **last-in, first-out** the moment a step fails.
 *
 * @remarks
 * `DoAsync` is the sibling for a sequence that only goes forward. Reach for a
 * saga when a later step's failure must take back what the earlier ones did —
 * a placement to cancel, a reservation to release — and the alternative is the
 * hand-written walk-back, where two things go wrong quietly: the undos run in
 * the wrong order, and an `AsyncResult` built outside the failure branch runs
 * whether or not it was needed (an `AsyncResult` starts on construction, which
 * is why every argument here is a thunk).
 *
 * The saga answers what the **last** step produced. A failure — a modeled `Err`
 * or a `Defect` — unwinds every undo recorded so far and then comes back
 * unchanged, so a caller triages exactly what it would have without the saga.
 * The one exception is a **defect inside an undo**: it wins over the failure
 * that triggered it, because a compensation that broke is the more urgent
 * report. Every remaining undo still runs first.
 *
 * It is pure control flow — no timers, no clock, no randomness — so it replays
 * deterministically inside a workflow sandbox.
 *
 * @category Saga
 *
 * @example
 * ```ts
 * import { SagaAsync } from "unthrown";
 *
 * const fulfilled = await SagaAsync()
 *   .step(() => place(order), () => cancelPlacement(order))
 *   .step(() => reserveStock(order), () => releaseStock(order))
 *   .step(() => arrangeShipping(order))
 *   .run();
 * // shipping failed → stock released, then placement cancelled, then Err(ShippingUnavailable)
 * ```
 *
 * @example
 * ```ts
 * import { SagaAsync, ErrAsync, OkAsync } from "unthrown";
 *
 * // The undo receives the step's own value, so it can take back exactly what
 * // that step created:
 * await SagaAsync()
 *   .step(() => OkAsync({ id: "o-1" }), (order) => releaseStock(order.id))
 *   .step(() => ErrAsync("shipping is down"))
 *   .run(); // => Err("shipping is down"), with the stock released first
 * ```
 */
export function SagaAsync(): SagaAsyncBuilder<undefined, never> {
  return build<undefined, never>([]);
}
