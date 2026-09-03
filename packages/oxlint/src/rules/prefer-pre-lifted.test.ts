import { ruleTester } from "../tester.js";
import { preferPreLifted } from "./prefer-pre-lifted.js";

const IMPORT = `import { Ok, Err } from "unthrown";\n`;

ruleTester.run("prefer-pre-lifted", preferPreLifted, {
  valid: [
    // The sanctioned spellings.
    { code: `${IMPORT}const a = OkAsync(1); const b = ErrAsync(e);` },
    // `.toAsync()` lifting a Result that ALREADY EXISTS is the combinator
    // doing its job — the majority use, and the whole reason the receiver is
    // the test rather than the method name.
    { code: `${IMPORT}const a = existing.toAsync();` },
    { code: `${IMPORT}const a = placeOrder(id, quantity).toAsync();` },
    { code: `${IMPORT}const a = fromNullable(row, () => e).toAsync();` },
    { code: `${IMPORT}const a = (flag ? Ok(1) : Err(e)).toAsync();` },
    // A chained Result is not a fresh literal either.
    { code: `${IMPORT}const a = Ok(1).map(f).toAsync();` },
    // A decoy: `Ok` from somewhere else entirely. Resolution goes through the
    // import, not the name.
    { code: `import { Ok } from "not-unthrown";\nconst a = Ok(1).toAsync();` },
    // An unresolved `Ok` (no import at all) stays conservative.
    { code: `const a = Ok(1).toAsync();` },
    // A rename that decoys the other way: the LOCAL name is `Ok`, but the
    // imported one is `fromNullable`, which has no pre-lifted twin.
    { code: `import { fromNullable as Ok } from "unthrown";\nconst a = Ok(x, f).toAsync();` },
    // Not `.toAsync()`.
    { code: `${IMPORT}const a = Ok(1).toString();` },
    // `.toAsync()` takes no arguments; a call with one is a different method.
    { code: `${IMPORT}const a = Ok(1).toAsync(x);` },
    // Documented miss: the namespace form, whose callee is a member expression
    // rather than the imported identifier.
    { code: `import * as u from "unthrown";\nconst a = u.Ok(1).toAsync();` },
    // Documented miss: a computed access.
    { code: `${IMPORT}const a = Ok(1)["toAsync"]();` },
  ],
  invalid: [
    {
      code: `${IMPORT}const a = Ok(value).toAsync();`,
      output: `import { Ok, Err, OkAsync } from "unthrown";\nconst a = OkAsync(value);`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    {
      code: `${IMPORT}const a = Err(error).toAsync();`,
      output: `import { Ok, Err, ErrAsync } from "unthrown";\nconst a = ErrAsync(error);`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    // `Ok()` and `Ok(undefined)` are the same value, and `OkAsync()` is how
    // unthrown spells it — the fix collapses both rather than carrying the
    // argument across.
    {
      code: `${IMPORT}const a = Ok().toAsync();`,
      output: `import { Ok, Err, OkAsync } from "unthrown";\nconst a = OkAsync();`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    {
      code: `${IMPORT}const a = Ok(undefined).toAsync();`,
      output: `import { Ok, Err, OkAsync } from "unthrown";\nconst a = OkAsync();`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    // A rename still reports, and the fix inserts the EXPORTED pre-lifted name.
    {
      code: `import { Ok as ok } from "unthrown";\nconst a = ok(1).toAsync();`,
      output: `import { Ok as ok, OkAsync } from "unthrown";\nconst a = OkAsync(1);`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    // Already imported: the rewrite alone, with no second specifier.
    {
      code: `import { Ok, OkAsync } from "unthrown";\nconst a = Ok(1).toAsync();`,
      output: `import { Ok, OkAsync } from "unthrown";\nconst a = OkAsync(1);`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    // A complex argument is carried across verbatim.
    {
      code: `${IMPORT}const a = Ok({ id, quantity }).toAsync();`,
      output: `import { Ok, Err, OkAsync } from "unthrown";\nconst a = OkAsync({ id, quantity });`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    // Inside a chain, where the fresh literal is the receiver of the lift.
    {
      code: `${IMPORT}const a = Ok(1).toAsync().map(f);`,
      output: `import { Ok, Err, OkAsync } from "unthrown";\nconst a = OkAsync(1).map(f);`,
      errors: [{ messageId: "preferPreLifted" }],
    },
    // The name is taken by something else, so the fix is withheld — a fix that
    // shadows an existing binding is worse than none. The report stands.
    {
      code: `${IMPORT}const OkAsync = 1;\nconst a = Ok(2).toAsync();`,
      errors: [{ messageId: "preferPreLifted" }],
    },
  ],
});
