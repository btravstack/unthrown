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
    // Same for another library's namespace.
    { code: `import type * as N from "neverthrow";\ntype T = N.Result<number, unknown>;` },
    // A qualified name that isn't Result/AsyncResult is not ours to police.
    { code: `import type * as U from "unthrown";\ntype T = U.OkView<number, unknown>;` },
    // A default import is not the named `Result` binding.
    { code: `import R from "unthrown";\ntype T = R<number, unknown>;` },
    // A user's own `type Error` is not the ambiguous global — resolve by scope,
    // not by name. (Regression guard for the bare-`Error` false positive.)
    {
      code: `import type { Result } from "unthrown";\ntype Error = { code: number };\ntype T = Result<number, Error>;`,
    },
    // A generic parameter literally named `Error` is a concrete type variable.
    {
      code: `import type { Result } from "unthrown";\nfunction f<Error>(): Result<number, Error> { throw 0; }`,
    },
    // A generic error parameter `E` is concrete — never treat it as ambiguous.
    {
      code: `import type { Result } from "unthrown";\nfunction f<E>(): Result<number, E> { throw 0; }`,
    },
    // A LOCAL name `Result` that is actually a rename of something else is not
    // unthrown's Result type — resolution goes through the *imported* name.
    // (Regression guard for the local-name false positive.)
    {
      code: `import { Ok as Result } from "unthrown";\ntype T = Result<number, unknown>;`,
    },
    // Alias indirection is a documented syntactic limit: the rule sees the
    // type *argument* as written; an alias that resolves to `unknown` is not
    // followed. Pinned valid on purpose — see the Linting guide.
    {
      code: `import type { Result } from "unthrown";\ntype E = unknown;\ntype T = Result<number, E>;`,
    },
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
    // The primitive / non-domain keywords are all ambiguous, not just any/unknown.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, string>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, object>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, null>;`,
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
    // Inner scope — a function return-type annotation. Locks that the import
    // source resolves from a nested scope (regression guard for scope analysis).
    {
      code: `import type { Result } from "unthrown";\nfunction f(): Result<number, unknown> { throw 0; }`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // Inner scope — a type alias declared inside a function body.
    {
      code: `import type { Result } from "unthrown";\nfunction f() { type T = Result<number, any>; return null as unknown as T; }`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // Inner scope — a nested block.
    {
      code: `import type { Result } from "unthrown";\n{ type T = Result<number, Error>; }`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // `void` says nothing about the domain either.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, void>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // A renamed import is still unthrown's Result — resolution goes through
    // the *imported* name. (Regression guard for the rename false negative.)
    {
      code: `import type { Result as R } from "unthrown";\ntype T = R<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { AsyncResult as AR } from "unthrown";\ntype T = AR<number, any>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // A namespace import's qualified name resolves too.
    {
      code: `import type * as U from "unthrown";\ntype T = U.Result<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
  ],
});
