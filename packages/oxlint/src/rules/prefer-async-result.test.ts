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
  ],
});
