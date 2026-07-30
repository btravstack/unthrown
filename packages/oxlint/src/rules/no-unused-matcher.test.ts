import { ruleTester } from "../tester.js";
import { noUnusedMatcher } from "./no-unused-matcher.js";

ruleTester.run("no-unused-matcher", noUnusedMatcher, {
  valid: [
    // The sanctioned shape — the callback matches through its own parameter.
    {
      code: `import { P } from "unthrown";\nresult.mapErrCases((matcher, defect) => matcher.with(P.tag("A"), (e) => defect(e)));`,
    },
    {
      code: `import { P } from "unthrown";\nresult.recoverErrCases((m) => m.with(P.tag("A"), () => "fallback"));`,
    },
    // `match`'s errCases handler is the same protocol — fine when it uses its matcher.
    {
      code: `result.match({ ok: (v) => v, errCases: (m) => m.with("a", () => 0), defect: (c) => c });`,
    },
    // A `match(...)` inside a BRANCH HANDLER is a nested function matching a
    // payload field — legitimate, not a foreign builder for the error.
    {
      code: `import { match, P } from "unthrown";\nresult.mapErrCases((m) => m.with(P.tag("A"), (e) => match(e.code).with(1, () => "x").exhaustive()));`,
    },
    // A callback passed by reference cannot be inspected — documented miss.
    {
      code: `result.mapErrCases(handler);`,
    },
    // An ignored parameter on an unrelated method is not this rule's business.
    {
      code: `values.map(() => 1);`,
    },
    // A standalone `match(...)` outside any …Cases callback is the matcher's
    // ordinary use.
    {
      code: `import { match } from "unthrown";\nconst out = match(value).with("a", () => 1).exhaustive();`,
    },
    // `match` from an unrelated module is not unthrown's builder.
    {
      code: `import { match } from "other-lib";\nresult.tapErrCases((m) => {\n  match(value);\n  return m.with("a", () => {});\n});`,
    },
    // A local `match` (not an import binding) is not matched — no false positive.
    {
      code: `const match = (x) => x;\nresult.tapErrCases((m) => {\n  match(value);\n  return m.with("a", () => {});\n});`,
    },
  ],
  invalid: [
    // The issue's repro: the callback never declares the matcher and returns a
    // builder over a decoy value. One report — the ignored matcher is the fault.
    {
      code: `import { match, P } from "unthrown";\nconst recovered = source.recoverErrCases(() => match(decoy).with(P.tag("A"), () => "recovered as A").with(P.tag("B"), () => "recovered as B"));`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    // Each of the other four …Cases methods is covered the same way.
    {
      code: `result.mapErrCases(() => prebuilt);`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    {
      code: `result.flatMapErrCases(() => prebuilt);`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    {
      code: `result.tapErrCases(() => prebuilt);`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    {
      code: `result.flatTapErrCases(() => prebuilt);`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    // Declared but never referenced is the same ignore.
    {
      code: `result.mapErrCases((matcher) => prebuilt);`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    // A write-only parameter is not a use — nothing reads the injected matcher.
    {
      code: `result.mapErrCases((m) => {\n  m = prebuilt;\n  return other;\n});`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    // `match`'s errCases handler ignoring its matcher is the same hole.
    {
      code: `result.match({ ok: (v) => v, errCases: () => prebuilt, defect: (c) => c });`,
      errors: [{ messageId: "unusedMatcher" }],
    },
    // A trivial reference (`void m`) defeats the unused check but not the
    // foreign-builder check: unthrown's `match(...)` in the callback's own body
    // builds a second matcher over a value the combinator never sees.
    {
      code: `import { match, P } from "unthrown";\nsource.recoverErrCases((m) => {\n  void m;\n  return match(decoy).with(P.tag("A"), () => "x");\n});`,
      errors: [{ messageId: "foreignMatch" }],
    },
    // Even a genuinely used matcher does not license a second builder in the
    // callback's own body.
    {
      code: `import { match } from "unthrown";\nresult.mapErrCases((m) => {\n  const x = match(other).with("a", () => 1).exhaustive();\n  return m.with("a", () => x);\n});`,
      errors: [{ messageId: "foreignMatch" }],
    },
    // ts-pattern's `match` is the same foreign builder.
    {
      code: `import { match } from "ts-pattern";\nresult.tapErrCases((m) => {\n  void m;\n  return match(decoy).with("a", () => {});\n});`,
      errors: [{ messageId: "foreignMatch" }],
    },
    // A rename still resolves by the imported name.
    {
      code: `import { match as buildMatch } from "unthrown";\nresult.mapErrCases((m) => {\n  void m;\n  return buildMatch(decoy).with("a", () => 0);\n});`,
      errors: [{ messageId: "foreignMatch" }],
    },
    // The errCases handler admits no second builder either.
    {
      code: `import { match } from "unthrown";\nresult.match({ ok: (v) => v, errCases: (m) => {\n  void m;\n  return match(decoy).with("a", () => 0);\n}, defect: (c) => c });`,
      errors: [{ messageId: "foreignMatch" }],
    },
  ],
});
