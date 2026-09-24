// The one list of what core produces a `Result` / `AsyncResult` from, shared by
// `no-unhandled-result` and `no-async-result-race`. `producers.test.ts` diffs it
// against core's actual exports, so a new producer cannot go silently unlinted.

/**
 * The `AsyncResult`-producing free functions core exports — the ones that
 * start work at construction.
 */
export const ASYNC_FREE_PRODUCERS: ReadonlySet<string> = new Set([
  "OkAsync",
  "ErrAsync",
  "DoAsync",
  "fromPromise",
  "fromSafePromise",
  "fromExecutor",
  "allAsync",
  "allFromDictAsync",
  "validateAllAsync",
  "validateAllFromDictAsync",
]);

/** Every `Result` / `AsyncResult`-producing free function core exports. */
export const FREE_PRODUCERS: ReadonlySet<string> = new Set([
  "Ok",
  "Err",
  "Do",
  "fromNullable",
  "fromThrowable",
  "fromSafeThrowable",
  "all",
  "allFromDict",
  "validateAll",
  "validateAllFromDict",
  ...ASYNC_FREE_PRODUCERS,
]);

/**
 * The producing members of the facade companions (`Result.Ok(...)`,
 * `AsyncResult.fromPromise(...)`). The guards (`Result.isOk` …) return
 * booleans, not Results, so they are deliberately absent.
 */
export const COMPANION_PRODUCERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    "Result",
    new Set([
      "Ok",
      "Err",
      "Do",
      "fromNullable",
      "fromThrowable",
      "fromSafeThrowable",
      "all",
      "allFromDict",
      "validateAll",
      "validateAllFromDict",
    ]),
  ],
  [
    "AsyncResult",
    new Set([
      "Ok",
      "Err",
      "Do",
      "fromExecutor",
      "fromPromise",
      "fromSafePromise",
      "all",
      "allFromDict",
      "validateAll",
      "validateAllFromDict",
    ]),
  ],
]);
