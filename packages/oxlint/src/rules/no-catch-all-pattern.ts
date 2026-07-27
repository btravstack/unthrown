import { defineRule } from "@oxlint/plugins";

import { getImportBinding } from "../helpers/get-import-binding.js";

// `P` is re-exported by core, but a codebase may also import it straight from
// ts-pattern — a `P._` from either is the same catch-all, so both count.
const SOURCES: ReadonlySet<string> = new Set(["unthrown", "ts-pattern"]);

// The two universal patterns ts-pattern exposes on `P`: `P._` and its alias
// `P.any`. Both match anything, so both defeat exhaustive enumeration. Every
// other `P.*` (`P.string`, `P.number`, `P.union(...)`, …) is a *specific*
// matcher and is left alone.
const CATCH_ALL_PROPS: ReadonlySet<string> = new Set(["_", "any"]);

/**
 * Disallow the ts-pattern catch-all `P._` (and its alias `P.any`) in an
 * unthrown matcher. The exhaustive error matcher exists so every failure is
 * *accounted for by name* — a catch-all re-opens the blanket-handling hole it
 * closes, silently absorbing any error the union grows later.
 *
 * This rule is **stricter than unthrown's own default**: the library documents
 * `P._` as the sanctioned "handle everything else" branch, so this is opt-in
 * (not in the `recommended` preset) — for teams that want *every* error
 * enumerated (`.with(tag("A"), tag("B"), …, handler)`, grouping cases that
 * share a handler) with no wildcard. A genuinely intended catch-all carries a
 * targeted `oxlint-disable` with a reason.
 *
 * Resolves `P` by its imported name via scope analysis, so a rename
 * (`import { P as Pattern }`) still fires and a decoy (`const P = …`) does not.
 * A namespace import (`import * as ns from "unthrown"; ns.P._`) is a documented
 * limit — the object is not a bare identifier binding.
 */
export const noCatchAllPattern = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow the `P._` / `P.any` catch-all in an unthrown matcher — enumerate every error case instead",
      recommended: false,
    },
    messages: {
      noCatchAll:
        'Unexpected `P.{{prop}}` catch-all. Enumerate every error case by name — `.with(tag("A"), tag("B"), …, handler)`, grouping cases that share a handler — so a new error can\'t be silently absorbed. A deliberate catch-all carries a targeted `oxlint-disable` with a reason.',
    },
  },
  createOnce: (context) => {
    return {
      MemberExpression: (node) => {
        // Only bare `P._` / `P.any`: a non-computed property on an identifier.
        if (node.computed) return;
        if (node.object.type !== "Identifier") return;
        if (node.property.type !== "Identifier") return;
        if (!CATCH_ALL_PROPS.has(node.property.name)) return;

        const scope = context.sourceCode.getScope(node);
        const binding = getImportBinding(scope, node.object);
        if (!binding || binding.imported !== "P" || !SOURCES.has(binding.source)) return;

        context.report({
          node,
          messageId: "noCatchAll",
          data: { prop: node.property.name },
        });
      },
    };
  },
});
