// @unthrown/oxlint — an oxlint (JS) plugin that enforces unthrown's conventions
// at lint time. Six rules:
//
//   unthrown/no-ambiguous-error-type  — keep `E` a concrete domain error
//                                        (no unknown/any/Error/{}), i.e. Thesis #1;
//                                        also covers mapErrCases' returnType<R>() pin.
//   unthrown/prefer-async-result      — use AsyncResult<T,E> over Promise<Result<T,E>>.
//   unthrown/no-unhandled-result      — don't drop a Result returned by a bare call.
//   unthrown/no-catch-all-pattern     — ban the `P._` matcher catch-all;
//                                        enumerate every error case by name.
//   unthrown/no-get-or-throw          — ban `getOrThrow()`; fold the error channel
//                                        with `recoverErrCases` + `get` instead
//                                        (opt-in; not in `recommended`).
//   unthrown/no-unused-matcher        — a `…Cases` callback must use the matcher it
//                                        was handed; a foreign builder matches the
//                                        wrong value.
//
// Enable the bundled `recommended` preset, or wire the rules by hand. See the
// package README.

import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin } from "@oxlint/plugins";
import type { OxlintConfig } from "oxlint";

import { noAmbiguousErrorType } from "./rules/no-ambiguous-error-type.js";
import { noCatchAllPattern } from "./rules/no-catch-all-pattern.js";
import { noGetOrThrow } from "./rules/no-get-or-throw.js";
import { noUnhandledResult } from "./rules/no-unhandled-result.js";
import { noUnusedMatcher } from "./rules/no-unused-matcher.js";
import { preferAsyncResult } from "./rules/prefer-async-result.js";

type UnthrownPlugin = Plugin & { recommended: OxlintConfig };

const plugin = eslintCompatPlugin({
  meta: { name: "unthrown" },
  rules: {
    "no-ambiguous-error-type": noAmbiguousErrorType,
    "no-catch-all-pattern": noCatchAllPattern,
    "no-get-or-throw": noGetOrThrow,
    "no-unhandled-result": noUnhandledResult,
    "no-unused-matcher": noUnusedMatcher,
    "prefer-async-result": preferAsyncResult,
  },
}) as UnthrownPlugin;

// One deliberate opt-out from the preset.
//
// `no-get-or-throw` is a whole-codebase commitment, and it has a property no
// preset rule has: `getOrThrow()` is the right tool in a test, so an existing
// suite does not pass until an `overrides` entry exempts the test glob. A
// preset rule that breaks every consumer's tests on upgrade is a poor default.
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
//
// `no-unused-matcher` IS in the preset. A `…Cases` callback that ignores the
// injected matcher sources its exhaustiveness from a builder bound to some
// other value — the other way through the door `no-catch-all-pattern` closes,
// and invisible to both the type checker (the `ExhaustiveMatch` constraint is
// structural) and the runtime (the wrong branch is chosen silently). Unlike the
// catch-all it has no irreducible use, so no escape hatch is documented.
// A plain literal, not `defineConfig(...)`: that helper is an identity function,
// and importing it would pull `oxlint` — a PEER dependency — into this module's
// runtime graph purely to annotate an object the `OxlintConfig` type already
// annotates.
plugin.recommended = {
  jsPlugins: [{ name: "unthrown", specifier: "@unthrown/oxlint" }],
  rules: {
    "unthrown/no-ambiguous-error-type": "error",
    "unthrown/no-catch-all-pattern": "error",
    "unthrown/no-unhandled-result": "error",
    "unthrown/no-unused-matcher": "error",
    "unthrown/prefer-async-result": "error",
  },
} satisfies OxlintConfig;

export default plugin;
