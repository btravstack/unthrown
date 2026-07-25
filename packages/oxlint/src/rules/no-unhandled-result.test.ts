import { ruleTester } from "../tester.js";
import { noUnhandledResult } from "./no-unhandled-result.js";

// Every Result/AsyncResult-producing free function core exports — each one,
// dropped as a bare statement, must be flagged.
const FREE_PRODUCERS = [
  "Ok",
  "Err",
  "OkAsync",
  "ErrAsync",
  "Do",
  "DoAsync",
  "fromNullable",
  "fromThrowable",
  "fromSafeThrowable",
  "fromPromise",
  "fromSafePromise",
  "all",
  "allAsync",
  "allFromDict",
  "allFromDictAsync",
] as const;

ruleTester.run("no-unhandled-result", noUnhandledResult, {
  valid: [
    // Assigned — the Result is bound, not dropped.
    { code: `import { Ok } from "unthrown";\nconst r = Ok(1);` },
    // Returned.
    { code: `import { Ok } from "unthrown";\nfunction f() { return Ok(1); }` },
    // Awaited into a binding.
    {
      code: `import { fromPromise } from "unthrown";\nasync function f(p, q) { const r = await fromPromise(p, q); }`,
    },
    // Passed as an argument — consumed by the broader expression.
    { code: `import { Ok } from "unthrown";\nconsole.log(Ok(1));` },
    // A facade member call that is assigned.
    { code: `import { Result } from "unthrown";\nconst r = Result.Ok(1);` },
    // A non-producing unthrown import (a guard returns a boolean, not a Result).
    { code: `import { isOk } from "unthrown";\nisOk(r);` },
    // A non-producing facade member.
    { code: `import { Result } from "unthrown";\nResult.isOk(r);` },
    // An `Ok` from another library is none of our business.
    { code: `import { Ok } from "true-myth";\nOk(1);` },
    // A local function without a Result return annotation.
    { code: `function f(): number { return 1; }\nf();` },
    // A local binding that isn't a function at all.
    { code: `const f = console.log;\nf();` },
    // A local function whose `Result` annotation comes from another library.
    {
      code: `import type { Result } from "neverthrow";\nfunction f(): Result<number, string> { return null as never; }\nf();`,
    },
    // A dropped method CHAIN (`r.map(f);`) is type-dependent — deliberately out
    // of scope for this syntactic rule (documented in the Linting guide).
    { code: `import { Ok } from "unthrown";\nconst r = Ok(1);\nr.map((n) => n + 1);` },
  ],
  invalid: [
    // Every producing free function, dropped bare.
    ...FREE_PRODUCERS.map((name) => ({
      code: `import { ${name} } from "unthrown";\n${name}();`,
      errors: [{ messageId: "noUnhandledResult" }],
    })),
    // A renamed import is still a producer — resolution goes through the
    // *imported* name.
    {
      code: `import { Ok as pure } from "unthrown";\npure(1);`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
    // Facade companion members.
    {
      code: `import { Result } from "unthrown";\nResult.Ok(1);`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
    {
      code: `import { AsyncResult } from "unthrown";\nAsyncResult.fromPromise(p, q);`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
    {
      code: `import { AsyncResult } from "unthrown";\nAsyncResult.Do();`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
    // An AWAITED bare producer call is still a dropped result — awaiting an
    // AsyncResult yields a Result, which is then discarded.
    {
      code: `import { fromPromise } from "unthrown";\nasync function f(p, q) { await fromPromise(p, q); }`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
    // A locally-declared function whose return annotation is unthrown's Result.
    {
      code: `import type { Result } from "unthrown";\nfunction f(): Result<number, string> { return null as never; }\nf();`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
    // Same, awaited — an AsyncResult-returning arrow bound to a const.
    {
      code: `import type { AsyncResult } from "unthrown";\nconst g = (): AsyncResult<number, string> => null as never;\nasync function main() { await g(); }`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
    // A `declare`d function counts too.
    {
      code: `import type { Result } from "unthrown";\ndeclare function f(): Result<number, string>;\nf();`,
      errors: [{ messageId: "noUnhandledResult" }],
    },
  ],
});
