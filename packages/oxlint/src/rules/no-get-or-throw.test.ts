import { ruleTester } from "../tester.js";
import { noGetOrThrow } from "./no-get-or-throw.js";

ruleTester.run("no-get-or-throw", noGetOrThrow, {
  valid: [
    // Effect's `Option.getOrThrow(o)` / `Either.getOrThrow(e)` are data-first
    // and take one argument. The arity check is what keeps a codebase using
    // both libraries clean — these are the load-bearing valid cases.
    { code: `const a = Option.getOrThrow(o); const b = Either.getOrThrow(e);` },
    // The rest of the extractor family keeps the error a value (or surrenders
    // it deliberately); only `getOrThrow` throws it.
    {
      code: `const a = r.get(); const b = r.getOr(0); const c = r.getOrElse(f); const d = r.getOrNull();`,
    },
    // The sanctioned replacement.
    {
      code: `const a = r.recoverErrCases((m, defect) => m.with(P.tag("X"), (e) => defect(e))).get();`,
    },
    // A bare identifier call is not a member call — some other `getOrThrow`.
    { code: `const a = getOrThrow();` },
    // A declaration is not a call.
    { code: `class C { getOrThrow() {} }` },
    // Documented miss: a computed access. Pinned as valid so the limit is
    // asserted rather than incidental — it is a deliberate evasion, and the
    // `oxlint-disable` comment is the sanctioned escape.
    { code: `const a = r["getOrThrow"]();` },
    // Documented miss: a detached reference, never called here.
    { code: `const f = r.getOrThrow;` },
  ],
  invalid: [
    { code: `const a = r.getOrThrow();`, errors: [{ messageId: "noGetOrThrow" }] },
    { code: `const a = r.map(f).getOrThrow();`, errors: [{ messageId: "noGetOrThrow" }] },
    // The async surface — same name, same arity, and it hands back a
    // *rejecting* promise.
    {
      code: `async function m() { return await r.getOrThrow(); }`,
      errors: [{ messageId: "noGetOrThrow" }],
    },
    // Optional chaining: a ChainExpression wrapping the same CallExpression.
    { code: `const a = r?.getOrThrow();`, errors: [{ messageId: "noGetOrThrow" }] },
    { code: `send(r.getOrThrow());`, errors: [{ messageId: "noGetOrThrow" }] },
  ],
});
