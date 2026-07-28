import { ruleTester } from "../tester.js";
import { noCatchAllPattern } from "./no-catch-all-pattern.js";

ruleTester.run("no-catch-all-pattern", noCatchAllPattern, {
  valid: [
    // Explicit enumeration — every case named, no wildcard.
    {
      code: `import { P } from "unthrown";\nresult.mapErrCases((m) => m.with(P.tag("A"), P.tag("B"), (e) => e));`,
    },
    // Specific `P.*` matchers are fine — only the catch-alls are banned.
    {
      code: `import { P } from "unthrown";\nm.with(P.string, (s) => s);`,
    },
    {
      code: `import { P } from "unthrown";\nm.with(P.union(P.string, P.number), (v) => v);`,
    },
    // `P` from an unrelated module is not unthrown's / ts-pattern's `P`.
    {
      code: `import { P } from "other-lib";\nm.with(P._, (e) => e);`,
    },
    // A local `P` (not an import binding) is not matched — no false positive.
    {
      code: `const P = { _: 1 };\nconst x = P._;`,
    },
    // A bare `_` identifier elsewhere is unrelated.
    {
      code: `import { P } from "unthrown";\nconst _ = 1;\nconsole.log(_);`,
    },
    // Computed access with a DYNAMIC key can't be resolved statically — left alone.
    {
      code: `import { P } from "unthrown";\nconst k = "_";\nm.with(P[k], (e) => e);`,
    },
  ],
  invalid: [
    // `P._` from unthrown — the catch-all.
    {
      code: `import { P } from "unthrown";\nresult.mapErrCases((m) => m.with(P._, (e) => e));`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // `P.any` is the same catch-all under a different name.
    {
      code: `import { P } from "unthrown";\nm.with(P.any, (e) => e);`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // `P._` imported straight from ts-pattern counts too.
    {
      code: `import { P } from "ts-pattern";\nm.with(P._, (e) => e);`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // A rename still resolves by the imported name.
    {
      code: `import { P as Pattern } from "unthrown";\nm.with(Pattern._, (e) => e);`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // In `match`'s errCases handler.
    {
      code: `import { P } from "unthrown";\nresult.match({ ok: (v) => v, errCases: (m) => m.with(P._, (e) => e), defect: (c) => c });`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // Matching a whole Result with the wildcard is caught as well.
    {
      code: `import { match, P } from "unthrown";\nmatch(result).with(P._, () => 0).exhaustive();`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // Computed access with a string literal is the same catch-all — no bypass.
    {
      code: `import { P } from "unthrown";\nm.with(P["_"], (e) => e);`,
      errors: [{ messageId: "noCatchAll" }],
    },
    {
      code: `import { P } from "unthrown";\nm.with(P["any"], (e) => e);`,
      errors: [{ messageId: "noCatchAll" }],
    },
  ],
});
