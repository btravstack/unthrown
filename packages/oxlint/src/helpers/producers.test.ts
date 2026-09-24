import * as core from "unthrown";
import { describe, expect, it } from "vitest";

import { ASYNC_FREE_PRODUCERS, COMPANION_PRODUCERS, FREE_PRODUCERS } from "./producers.js";

// Core's runtime exports that do NOT produce a Result. A new core export fails
// the first test until it is classified here or in `producers.ts` — so a new
// producer cannot slip past `no-unhandled-result` / `no-async-result-race`.
const NON_PRODUCERS = [
  "AsyncResult",
  "GetError",
  "NonExhaustiveError",
  "P",
  "Result",
  "TaggedError",
  "isDefect",
  "isErr",
  "isOk",
  "isResult",
  "match",
];

const sorted = (names: Iterable<string>) => [...names].toSorted();

describe("producer lists mirror core's exports", () => {
  it("classifies every core export", () => {
    expect(sorted(Object.keys(core))).toEqual(sorted([...FREE_PRODUCERS, ...NON_PRODUCERS]));
  });

  it("lists exactly the async free producers — the ones the AsyncResult companion aliases", () => {
    const aliased: unknown[] = Object.values(core.AsyncResult);
    const asyncNames = Object.entries(core).flatMap(([name, value]) =>
      aliased.includes(value) ? [name] : [],
    );
    expect(sorted(ASYNC_FREE_PRODUCERS)).toEqual(sorted(asyncNames));
  });

  it("lists every producing companion member", () => {
    const guards: unknown[] = [core.isOk, core.isErr, core.isDefect, core.isResult];
    const resultProducers = Object.entries(core.Result).flatMap(([name, value]) =>
      guards.includes(value) ? [] : [name],
    );
    expect(sorted(COMPANION_PRODUCERS.get("Result") ?? [])).toEqual(sorted(resultProducers));
    expect(sorted(COMPANION_PRODUCERS.get("AsyncResult") ?? [])).toEqual(
      sorted(Object.keys(core.AsyncResult)),
    );
  });
});
