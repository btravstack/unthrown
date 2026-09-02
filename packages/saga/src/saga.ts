// The saga: a sequence whose steps carry compensating undos, unwound LIFO when
// a later step fails. `DoAsync` is the sibling for a sequence that only ever
// goes forward.
//
// **A package of its own, not a core export.** It is pure control flow over
// core's types and adds no dependency — but it is a PATTERN rather than a
// channel operation, and it already carries opinions about sagas (a defect in
// an undo outranks the failure that triggered it; undos are best effort and all
// of them run). unthrown's core is meant to be finishable; a saga is where
// somebody eventually wants policies. Opting in is the boundary.
//
// It is built on the PUBLIC surface alone — `fromSafePromise`, `flatMap`,
// `OkAsync` — so nothing here reaches into core's internals, which is what
// keeps this package honest about being a consumer.

import { Ok, OkAsync, fromSafePromise, isDefect, isOk, isResult } from "unthrown";
import type { AsyncResult, Awaitable, Result } from "unthrown";

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
   * built eagerly would run before the saga reached it. It takes no argument;
   * `undo` receives the value its own step produced. Either may answer a plain
   * `Result` in place of an `AsyncResult`, so a synchronous compensation needs
   * no `toAsync()`.
   *
   * An `undo` answers `unknown` in the Ok channel and `never` in the Err one:
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
 * Adopt whatever a step handed back — a `Result`, an `AsyncResult`, a throw, or
 * something out of contract.
 *
 * A thrown step is a `Defect`, exactly as it would be inside `flatMap`; a
 * rejecting thenable slipped past the types is one too. **A value that is not a
 * `Result` at all is a `Defect` as well**, rather than an object whose `isOk`
 * is read a line later: a cast or untyped caller can return `42`, and reading
 * `.isOk()` off it would throw where nothing catches, rejecting the internal
 * promise an `AsyncResult` promises never rejects.
 */
// oxlint-disable-next-line unthrown/no-ambiguous-error-type -- the step's own error type is the caller's; this adapter is deliberately channel-agnostic and the builder re-narrows to `E`
const settle = (produce: () => Produced<unknown, unknown>): AsyncResult<unknown, unknown> =>
  fromSafePromise(async () => await produce()).flatMap((settled) =>
    isResult(settled)
      ? settled
      : OkAsync().map((): never => {
          // oxlint-disable-next-line unthrown/no-throw -- `Defect` has no public constructor, so a throw inside a combinator is the only way to mint one from outside core; this arm is unreachable for a caller who respects the types
          throw new TypeError(
            "@unthrown/saga: a step must return a Result or an AsyncResult, and one returned something else",
          );
        }),
  );

/**
 * Run the recorded undos in reverse, best effort.
 *
 * Every one runs even when an earlier one defected — stopping would leave the
 * steps before it uncompensated, which is the state the saga exists to avoid.
 * The FIRST defect is what comes back, since a compensation that broke is worse
 * news than the failure that triggered it.
 */
const unwind = async (
  undos: readonly (() => Produced<unknown, never>)[],
): Promise<Result<never, never> | undefined> => {
  let broken: Result<never, never> | undefined;
  for (const undo of [...undos].reverse()) {
    const settled = await settle(undo);
    if (isDefect(settled) && broken === undefined) broken = settled as Result<never, never>;
  }
  return broken;
};

const build = <T, E>(steps: readonly Step[]): SagaAsyncBuilder<T, E> => ({
  step: <T2, E2>(run: () => Produced<T2, E2>, undo?: (value: T2) => Produced<unknown, never>) =>
    build<T2, E | E2>([...steps, { run: run as Step["run"], undo: undo as Step["undo"] }]),
  run: () =>
    // oxlint-disable-next-line unthrown/prefer-async-result -- this IS the argument to `fromSafePromise`; the surface it returns is the `AsyncResult` the rule asks for
    fromSafePromise(async (): Promise<Result<T, E>> => {
      const undos: (() => Produced<unknown, never>)[] = [];
      let last: unknown = undefined;
      for (const step of steps) {
        const settled = await settle(step.run);
        if (!isOk(settled)) return (await unwind(undos)) ?? (settled as Result<T, E>);
        last = settled.value;
        const { undo } = step;
        if (undo !== undefined) {
          // Bound to the value HERE: the loop's `last` moves on, and an undo
          // reading it later would compensate with the wrong step's output.
          const value = last;
          undos.push(() => undo(value as never));
        }
      }
      return Ok(last as T);
    }).flatMap((settled) => settled),
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
