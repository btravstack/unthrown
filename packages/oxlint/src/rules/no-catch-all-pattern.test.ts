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
      code: `import { P } from "unthrown";\nm.with(P.tag("A"), (a) => a);`,
    },
    {
      code: `import { P } from "unthrown";\nm.with(P.instanceOf(Boom), (b) => b);`,
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
    // ---- Provable single non-union `E` (issue #230): the catch-all is the
    // ---- legitimate single arm, no disable needed.
    // Annotated variable, `E` a single imported type reference.
    {
      code: `import { P, type Result } from "unthrown";\nimport type { SchemaIssues } from "@unthrown/standard-schema";\ndeclare const r: Result<number, SchemaIssues>;\nr.mapErrCases((m) => m.with(P._, (e) => e));`,
    },
    // Helper generic in `E` — the docstring's own example shape.
    {
      code: `import { P, type Result } from "unthrown";\nconst toApiError = <T, E>(result: Result<T, E>) =>\n  result.mapErrCases((m) => m.with(P._, (e) => e));`,
    },
    // Receiver is a call to an in-file function with an annotated return type;
    // `E` is an in-file alias resolving to a non-union (an array type).
    {
      code: `import { P, type Result } from "unthrown";\ntype Issues = readonly { message: string }[];\ndeclare function readEnv(): Result<number, Issues>;\nreadEnv().match({ ok: (v) => v, errCases: (m) => m.with(P._, (e) => e), defect: (c) => c });`,
    },
    // AsyncResult annotation, and a chain with a `returnType` pin before the arm.
    {
      code: `import { P, type AsyncResult } from "unthrown";\nimport type { Issues } from "./issues.js";\ndeclare const r: AsyncResult<number, Issues>;\nr.recoverErrCases((m) => m.returnType<number>().with(P._, () => 0));`,
    },
    // The string-literal key spelling of `errCases` proves the same way.
    {
      code: `import { P, type Result } from "unthrown";\ntype Issues = readonly { message: string }[];\ndeclare function readEnv(): Result<number, Issues>;\nreadEnv().match({ ok: (v) => v, "errCases": (m) => m.with(P._, (e) => e), defect: (c) => c });`,
    },
    // An awaited AsyncResult receiver traces through the `await`.
    {
      code: `import { P, type AsyncResult } from "unthrown";\nimport type { Issues } from "./issues.js";\ndeclare const r: AsyncResult<number, Issues>;\nasync () => (await r).mapErrCases((m) => m.with(P._, (e) => e));`,
    },
  ],
  invalid: [
    // `P._` from unthrown — the catch-all.
    {
      code: `import { P } from "unthrown";\nresult.mapErrCases((m) => m.with(P._, (e) => e));`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // ts-pattern's `P.any` is the same catch-all under a different name.
    {
      code: `import { P } from "ts-pattern";\nm.with(P.any, (e) => e);`,
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
    // A union `E` in the annotation is enumerable — the catch-all still hides cases.
    {
      code: `import { P, type Result } from "unthrown";\ndeclare const r: Result<number, "a" | "b">;\nr.mapErrCases((m) => m.with(P._, (e) => e));`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // An in-file alias that resolves to a union is seen through.
    {
      code: `import { P, type Result } from "unthrown";\ntype E = "a" | "b";\ndeclare const r: Result<number, E>;\nr.mapErrCases((m) => m.with(P._, () => 0));`,
      errors: [{ messageId: "noCatchAll" }],
    },
    // An unannotated receiver proves nothing — flagged, keep the targeted disable.
    {
      code: `import { P, type Result } from "unthrown";\nimport { readEnv } from "./env.js";\nreadEnv().match({ ok: (v) => v, errCases: (m) => m.with(P._, (e) => e), defect: (c) => c });`,
      errors: [{ messageId: "noCatchAll" }],
    },
  ],
});
