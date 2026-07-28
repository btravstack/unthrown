// @unthrown/oxlint — an oxlint (JS) plugin that enforces unthrown's conventions
// at lint time. Five rules:
//
//   unthrown/no-ambiguous-error-type  — keep `E` a concrete domain error
//                                        (no unknown/any/Error/{}), i.e. Thesis #1;
//                                        also covers mapErrCases' returnType<R>() pin.
//   unthrown/prefer-async-result      — use AsyncResult<T,E> over Promise<Result<T,E>>.
//   unthrown/no-unhandled-result      — don't drop a Result returned by a bare call.
//   unthrown/no-throw                 — ban raw `throw` (opt-in; not in `recommended`) —
//                                        errors are returned, only a defect ever throws.
//   unthrown/no-catch-all-pattern     — ban the `P._` / `P.any` matcher catch-all
//                                        (opt-in; not in `recommended`) — enumerate
//                                        every error case instead.
//
// Enable the bundled `recommended` preset, or wire the rules by hand. See the
// package README.

import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin } from "@oxlint/plugins";
import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

import { noAmbiguousErrorType } from "./rules/no-ambiguous-error-type.js";
import { noCatchAllPattern } from "./rules/no-catch-all-pattern.js";
import { noThrow } from "./rules/no-throw.js";
import { noUnhandledResult } from "./rules/no-unhandled-result.js";
import { preferAsyncResult } from "./rules/prefer-async-result.js";

type UnthrownPlugin = Plugin & { recommended: OxlintConfig };

const plugin = eslintCompatPlugin({
  meta: { name: "unthrown" },
  rules: {
    "no-ambiguous-error-type": noAmbiguousErrorType,
    "no-catch-all-pattern": noCatchAllPattern,
    "no-throw": noThrow,
    "no-unhandled-result": noUnhandledResult,
    "prefer-async-result": preferAsyncResult,
  },
}) as UnthrownPlugin;

// `no-throw` and `no-catch-all-pattern` are deliberately NOT in the preset:
// `no-throw` bans a core language statement, and `no-catch-all-pattern` is
// stricter than unthrown's own default (the library documents `P._` as the
// sanctioned catch-all). Both stay explicit opt-ins for codebases committed to
// the convention end-to-end.
plugin.recommended = defineConfig({
  jsPlugins: [{ name: "unthrown", specifier: "@unthrown/oxlint" }],
  rules: {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/prefer-async-result": "error",
  },
});

export default plugin;
