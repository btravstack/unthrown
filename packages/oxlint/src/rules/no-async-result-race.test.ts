import { ruleTester } from "../tester.js";
import { noAsyncResultRace } from "./no-async-result-race.js";

ruleTester.run("no-async-result-race", noAsyncResultRace, {
  valid: [
    // One construction alone cannot race.
    { code: `import { OkAsync } from "unthrown";\nconst a = OkAsync(1);` },
    // Chained in one statement — the sanctioned sequence.
    {
      code: `import { OkAsync, ErrAsync } from "unthrown";\nconst r = OkAsync(1).flatMap(() => ErrAsync("e"));`,
    },
    // The earlier binding is consumed before the later work starts.
    {
      code: `import { OkAsync } from "unthrown";\nasync function f() {\n  const a = OkAsync(1);\n  const settled = await a;\n  const b = OkAsync(2);\n  return b;\n}`,
    },
    // Chained through the later initializer: `b` hangs off `a`, so `a` is
    // consumed at `b`'s construction — a sequence, not a race. (`b`'s own init
    // roots at `a`, not at a producer, so it is not even a construction.)
    {
      code: `import { OkAsync } from "unthrown";\nconst a = OkAsync(1);\nconst b = a.flatMap(() => OkAsync(2));`,
    },
    // First consumed TOGETHER: the sanctioned explicit join.
    {
      code: `import { OkAsync, allAsync } from "unthrown";\nconst a = OkAsync(1);\nconst b = OkAsync(2);\nconst joined = allAsync([a, b]);`,
    },
    // A producer inside a nested function is deferred, not constructed.
    {
      code: `import { OkAsync } from "unthrown";\nconst a = OkAsync(1);\nconst lazy = () => OkAsync(2);`,
    },
    // Different blocks do not share a statement list.
    {
      code: `import { OkAsync } from "unthrown";\nfunction f(x: boolean) {\n  if (x) {\n    const a = OkAsync(1);\n    return a;\n  }\n  const b = OkAsync(2);\n  return b;\n}`,
    },
    // A sync Result cannot race — settled at construction.
    {
      code: `import { Ok } from "unthrown";\nconst a = Ok(1);\nconst b = Ok(2);\nconst c = a.flatMap(() => b);`,
    },
    // A `Result` from another module is not unthrown's.
    {
      code: `import { OkAsync } from "elsewhere";\nconst a = OkAsync(1);\nconst b = OkAsync(2);\nvoid a;\nvoid b;`,
    },
    // The explicit join outside a declarator: both directly consumed in one
    // later statement.
    {
      code: `import { OkAsync, allAsync } from "unthrown";\nfunction f() {\n  const a = OkAsync(1);\n  const b = OkAsync(2);\n  return allAsync([a, b]);\n}`,
    },
    // A local function returning a plain Promise is not an AsyncResult.
    {
      code: `declare function step(): Promise<number>;\nconst a = step();\nconst b = step();\nvoid a;\nvoid b;`,
    },
  ],
  invalid: [
    // The canonical race: two producers bound, then chained after the fact.
    {
      code: `import { OkAsync } from "unthrown";\nconst a = OkAsync(1);\nconst b = OkAsync(2);\nconst r = a.flatMap(() => b);`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // Never consumed at all is still a race with the sibling.
    {
      code: `import { OkAsync, ErrAsync } from "unthrown";\nconst a = OkAsync(1);\nconst b = ErrAsync("e");`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // Start-both-await-both: manual concurrency's sanctioned spelling is
    // `allAsync([…])` in one statement; separate awaits are reported.
    {
      code: `import { OkAsync } from "unthrown";\nasync function f() {\n  const a = OkAsync(1);\n  const b = OkAsync(2);\n  const ra = await a;\n  const rb = await b;\n  return [ra, rb];\n}`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // An awaited later construction still starts while the earlier is open.
    {
      code: `import { OkAsync, DoAsync } from "unthrown";\nasync function f() {\n  const a = OkAsync(1);\n  const r = await DoAsync();\n  return [a, r];\n}`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // The chain roots at a producer, so the whole chain is one construction.
    {
      code: `import { OkAsync, ErrAsync } from "unthrown";\nconst a = OkAsync(1).map((n) => n + 1);\nconst b = ErrAsync("e").mapErr((e) => e);\nconst r = a.flatMap(() => b);`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // The facade companion constructs too.
    {
      code: `import { AsyncResult } from "unthrown";\nconst a = AsyncResult.Ok(1);\nconst b = AsyncResult.fromPromise(Promise.resolve(2), (e) => e);\nconst r = a.flatMap(() => b);`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // A local function whose return annotation is unthrown's AsyncResult.
    {
      code: `import { OkAsync, type AsyncResult } from "unthrown";\nconst step = (n: number): AsyncResult<number, never> => OkAsync(n);\nconst a = step(1);\nconst b = step(2);\nconst r = a.flatMap(() => b);`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // A declarator annotated with AsyncResult — the opt-in that catches a
    // service method call the syntax alone cannot resolve.
    {
      code: `import type { AsyncResult } from "unthrown";\ndeclare const svc: { step(n: number): AsyncResult<number, never> };\nconst a: AsyncResult<number, never> = svc.step(1);\nconst b: AsyncResult<number, never> = svc.step(2);\nconst r = a.flatMap(() => b);`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // Renamed import still resolves — keyed by the IMPORTED name.
    {
      code: `import { OkAsync as ok } from "unthrown";\nconst a = ok(1);\nconst b = ok(2);\nconst r = a.flatMap(() => b);`,
      errors: [{ messageId: "noAsyncResultRace" }],
    },
    // Three siblings: one fault per later construction, each against its
    // nearest open predecessor.
    {
      code: `import { OkAsync } from "unthrown";\nconst a = OkAsync(1);\nconst b = OkAsync(2);\nconst c = OkAsync(3);\nconst r = a.flatMap(() => b.flatMap(() => c));`,
      errors: [{ messageId: "noAsyncResultRace" }, { messageId: "noAsyncResultRace" }],
    },
  ],
});
