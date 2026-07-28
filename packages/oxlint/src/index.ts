// @unthrown/oxlint — an oxlint (JS) plugin that enforces unthrown's conventions
// at lint time. Five rules:
//
//   unthrown/no-ambiguous-error-type  — keep `E` a concrete domain error
//                                        (no unknown/any/Error/{}), i.e. Thesis #1;
//                                        also covers mapErrCases' returnType<R>() pin.
//   unthrown/prefer-async-result      — use AsyncResult<T,E> over Promise<Result<T,E>>.
//   unthrown/no-unhandled-result      — don't drop a Result returned by a bare call.
//   unthrown/no-catch-all-pattern     — ban the `P._` / `P.any` matcher catch-all;
//                                        enumerate every error case by name.
//   unthrown/no-throw                 — ban raw `throw` (opt-in; not in `recommended`) —
//                                        errors are returned, only a defect ever throws.
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

// `no-throw` is the ONE deliberate opt-out from the preset: it bans a core
// language statement, which is a whole-codebase commitment rather than an
// unthrown convention.
//
// `no-catch-all-pattern` IS in the preset. Enumerating every error case by name
// is unthrown's default position — the exhaustive matcher exists so a failure
// mode cannot be absorbed unnamed, and `P._` re-opens exactly the
// blanket-handling hole it closes. `P._` remains an escape hatch, not the
// sanctioned default: its two irreducible uses are a helper generic in `E`,
// where no list of arms can prove exhaustiveness and only the catch-all's state
// transition can, and an `E` that is a single type rather than a union of
// cases, where one arm IS the enumeration. Such a site silences the rule with a
// targeted `oxlint-disable-next-line unthrown/no-catch-all-pattern` and a
// reason.
plugin.recommended = defineConfig({
  jsPlugins: [{ name: "unthrown", specifier: "@unthrown/oxlint" }],
  rules: {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-catch-all-pattern": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/prefer-async-result": "error",
  },
});

export default plugin;
