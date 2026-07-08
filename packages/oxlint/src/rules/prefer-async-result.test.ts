import { ruleTester } from "../tester.js";
import { preferAsyncResult } from "./prefer-async-result.js";

ruleTester.run("prefer-async-result", preferAsyncResult, {
  valid: [
    // Already an AsyncResult.
    {
      code: `import type { AsyncResult } from "unthrown";\ntype T = AsyncResult<number, MyError>;`,
    },
    // A plain Promise (not of a Result).
    { code: `import type { Result } from "unthrown";\ntype T = Promise<number>;` },
    // A Promise of a non-unthrown Result is none of our business.
    {
      code: `import type { Result } from "neverthrow";\ntype T = Promise<Result<number, MyError>>;`,
    },
  ],
  invalid: [
    // `AsyncResult` is imported → safe to autofix.
    {
      code: `import type { Result, AsyncResult } from "unthrown";\ntype T = Promise<Result<number, MyError>>;`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: `import type { Result, AsyncResult } from "unthrown";\ntype T = AsyncResult<number, MyError>;`,
    },
    // `AsyncResult` is NOT imported → still reported, but no autofix (it would
    // rewrite to an undefined name). `output: null` asserts the fix is withheld.
    {
      code: `import type { Result } from "unthrown";\ntype T = Promise<Result<number, MyError>>;`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
    // Inner scope — a function return-type annotation, with AsyncResult imported
    // so the autofix applies. Locks import-source resolution from a nested scope.
    {
      code: `import type { Result, AsyncResult } from "unthrown";\nfunction f(): Promise<Result<number, MyError>> { throw 0; }`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: `import type { Result, AsyncResult } from "unthrown";\nfunction f(): AsyncResult<number, MyError> { throw 0; }`,
    },
    // Inner scope — a type alias inside a function body.
    {
      code: `import type { Result } from "unthrown";\nfunction f() { type T = Promise<Result<number, MyError>>; return null as unknown as T; }`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
    // An async function's return annotation is reported but NOT auto-fixed:
    // `async function` must return a native Promise, so rewriting the annotation
    // to AsyncResult<…> would not compile.
    {
      code: `import { AsyncResult, type Result } from "unthrown";
async function f(): Promise<Result<number, string>> { return null as never; }`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
    {
      code: `import { AsyncResult, type Result } from "unthrown";
const f = async (): Promise<Result<number, string>> => null as never;`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
  ],
});
