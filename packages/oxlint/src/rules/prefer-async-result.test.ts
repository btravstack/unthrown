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
    // A LOCAL `Result` that is a rename of something else is not unthrown's
    // Result — resolution goes through the *imported* name.
    {
      code: `import { Ok as Result } from "unthrown";\ntype T = Promise<Result<number, MyError>>;`,
    },
    // A user-declared type literally named `Promise` is not the global —
    // resolve by scope, not by name (same rule as the bare-`Error` check).
    {
      code: `import type { Result } from "unthrown";\ntype Promise<T> = { p: T };\ntype T2 = Promise<Result<number, MyError>>;`,
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
    // A class `async` method's return annotation — reported, fix withheld
    // (same native-Promise constraint; the method body is a FunctionExpression).
    {
      code: `import { AsyncResult, type Result } from "unthrown";
class C { async m(): Promise<Result<number, string>> { return null as never; } }`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
    // A function TYPE's return position — reported, fix withheld even though
    // `AsyncResult` is imported: the implementer may be an `async` function the
    // rule can't see (here it literally is one), so the rewrite could not
    // compile against it.
    {
      code: `import { AsyncResult, type Result } from "unthrown";
const f: () => Promise<Result<number, string>> = async () => null as never;`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
    // Same for an object-type member spelled as a function-typed property…
    {
      code: `import { AsyncResult, type Result } from "unthrown";
type Api = { load: () => Promise<Result<number, string>> };`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
    // …and as a method signature.
    {
      code: `import { AsyncResult, type Result } from "unthrown";
type Api = { load(): Promise<Result<number, string>> };`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
    // A renamed `Result` import is still unthrown's — reported, and the fix
    // applies (it rewrites to `AsyncResult`, which is imported under that name).
    {
      code: `import type { Result as R, AsyncResult } from "unthrown";\ntype T = Promise<R<number, MyError>>;`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: `import type { Result as R, AsyncResult } from "unthrown";\ntype T = AsyncResult<number, MyError>;`,
    },
    // A namespace import's qualified `Result` — reported; no fix, since a
    // bare `AsyncResult` name isn't in scope to rewrite to.
    {
      code: `import type * as U from "unthrown";\ntype T = Promise<U.Result<number, MyError>>;`,
      errors: [{ messageId: "preferAsyncResult" }],
      output: null,
    },
  ],
});
