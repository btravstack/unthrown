import { ruleTester } from "../tester.js";
import { noAmbiguousErrorType } from "./no-ambiguous-error-type.js";

ruleTester.run("no-ambiguous-error-type", noAmbiguousErrorType, {
  valid: [
    // A concrete domain error.
    { code: `import type { Result } from "unthrown";\ntype T = Result<number, MyError>;` },
    // `never` is an intentionally error-free result.
    { code: `import type { Result } from "unthrown";\ntype T = Result<number, never>;` },
    // A string-literal union is concrete.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, "not_found" | "denied">;`,
    },
    // A populated object type is concrete.
    { code: `import type { Result } from "unthrown";\ntype T = Result<number, { code: number }>;` },
    // A `Result` from another library is none of our business.
    { code: `import type { Result } from "neverthrow";\ntype T = Result<number, unknown>;` },
  ],
  invalid: [
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, any>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, Error>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, {}>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { AsyncResult } from "unthrown";\ntype T = AsyncResult<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // An ambiguous member taints a union.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, MyError | unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, Error | MyError>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
  ],
});
