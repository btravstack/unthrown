import { ruleTester } from "../tester.js";
import { noThrow } from "./no-throw.js";

ruleTester.run("no-throw", noThrow, {
  valid: [
    // Errors as values: nothing thrown, nothing to report.
    {
      code: `import { Err, Ok } from "unthrown";\nfunction f(n) { return n > 0 ? Ok(n) : Err("negative"); }`,
    },
    // `getOrThrow()` is a call, not a `throw` statement, so this rule is
    // silent on it — `no-get-or-throw` is what reports it.
    { code: `const value = result.getOrThrow();` },
    // A try/catch with no throw is fine — catching is not throwing.
    { code: `try { risky(); } catch (e) { report(e); }` },
  ],
  invalid: [
    // A throw in a plain function.
    {
      code: `function f() { throw new Error("boom"); }`,
      errors: [{ messageId: "noThrow" }],
    },
    // A throw in an arrow body.
    {
      code: `const f = () => { throw new Error("boom"); };`,
      errors: [{ messageId: "noThrow" }],
    },
    // A throw in a class method.
    {
      code: `class C { m() { throw new Error("boom"); } }`,
      errors: [{ messageId: "noThrow" }],
    },
    // A throw inside try — still a throw.
    {
      code: `try { throw new Error("boom"); } catch {}`,
      errors: [{ messageId: "noThrow" }],
    },
    // A rethrow in a catch clause too — the deliberate form carries a
    // targeted oxlint-disable instead.
    {
      code: `try { risky(); } catch (e) { throw e; }`,
      errors: [{ messageId: "noThrow" }],
    },
    // A top-level throw.
    {
      code: `throw new Error("boom");`,
      errors: [{ messageId: "noThrow" }],
    },
    // Non-Error values are throws all the same.
    {
      code: `function f() { throw "boom"; }`,
      errors: [{ messageId: "noThrow" }],
    },
  ],
});
