// Type-level suite, checked by `tsc` — `Expect<Equal<A, B>>` is a hard error
// when the two differ, and `@ts-expect-error` guards what must NOT compile.
// The package's own `typecheck` runs it.
import { Err, ErrAsync, Ok, OkAsync, type AsyncResult } from "unthrown";

import { SagaAsync } from "./index.js";

type Expect<T extends true> = T;
type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

// `run()` answers the LAST step's value; the errors union across steps
const saga = SagaAsync()
  .step(() => Ok(1))
  .step(() => (Math.random() > 0 ? OkAsync("x") : ErrAsync<"e1">("e1")))
  .step(() => (Math.random() > 0 ? Ok(true) : Err<"e2">("e2")))
  .run();
type _saga = Expect<Equal<typeof saga, AsyncResult<boolean, "e1" | "e2">>>;

// an empty saga is `Ok(undefined)`
type _sagaEmpty = Expect<
  Equal<ReturnType<ReturnType<typeof SagaAsync>["run"]>, AsyncResult<undefined, never>>
>;

// an undo receives its own step's value…
SagaAsync().step(
  () => Ok({ id: "o-1" }),
  (order) => {
    type _undoValue = Expect<Equal<typeof order, { id: string }>>;
    return OkAsync();
  },
);

// …and may answer a plain `Result`, so a synchronous compensation needs no
// `toAsync()` — the same latitude `run` has, deliberately
SagaAsync().step(
  () => Ok(1),
  () => Ok(),
);

// …and may not fail in a way the caller has to handle: `E` must be `never`
SagaAsync().step(
  () => Ok(1),
  // @ts-expect-error -- compensation may not invent a new way for the saga to fail
  () => ErrAsync("undo failed"),
);

// a step handing back a bare Promise is refused — it would skip qualification
// @ts-expect-error -- a raw Promise is not a Result or an AsyncResult
SagaAsync().step(() => Promise.resolve(Ok(1)));
