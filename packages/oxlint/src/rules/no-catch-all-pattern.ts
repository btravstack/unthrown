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
 * Disallow the matcher catch-all `P._` (and its alias `P.any`) in an
 * unthrown matcher. The exhaustive error matcher exists so every failure is
 * *accounted for by name* — a catch-all re-opens the blanket-handling hole it
 * closes, silently absorbing any error the union grows later.
 *
 * This rule states unthrown's own default: every error case is enumerated by
 * name (`.with(tag("A"), tag("B"), …, handler)`, grouping cases that share a
 * handler), and `P._` is an **escape hatch**, not the sanctioned way to handle
 * the error channel. Hence its place in the `recommended` preset.
 *
 * The one irreducible use of the catch-all is a helper **generic in `E`**: no
 * list of arms can prove exhaustiveness against an unresolved type parameter,
 * and only `P._`'s state transition can. Silence the rule there — and at any
 * other deliberate wildcard — with a targeted disable and a reason:
 *
 * ```ts
 * const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
 *   result.mapErrCases((matcher) =>
 *     // oxlint-disable-next-line unthrown/no-catch-all-pattern -- generic in `E`:
 *     // no arm list can prove exhaustiveness here.
 *     matcher.returnType<ApiError>().with(P._, (error) => new ApiError({ error })),
 *   );
 * ```
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
        "Disallow the `P._` / `P.any` catch-all in an unthrown matcher — enumerate every error case by name; the catch-all is an escape hatch (a helper generic in `E`), carried by a targeted `oxlint-disable`",
      recommended: true,
    },
    messages: {
      noCatchAll:
        'Unexpected `P.{{prop}}` catch-all. Enumerate every error case by name — `.with(tag("A"), tag("B"), …, handler)`, grouping cases that share a handler — so a new error can\'t be silently absorbed. The catch-all is an escape hatch: in a helper generic in `E` it is the only arm that can prove exhaustiveness, so keep it there behind a targeted `oxlint-disable` with a reason.',
    },
  },
  createOnce: (context) => {
    return {
      MemberExpression: (node) => {
        if (node.object.type !== "Identifier") return;

        // The catch-all is written `P._` / `P.any` (dot access) or `P["_"]` /
        // `P["any"]` (computed access with a string literal) — both are the same
        // pattern, so both are flagged. A computed access with a dynamic key
        // (`P[k]`) is left alone: it can't be resolved statically.
        const prop =
          !node.computed && node.property.type === "Identifier"
            ? node.property.name
            : node.computed &&
                node.property.type === "Literal" &&
                typeof node.property.value === "string"
              ? node.property.value
              : undefined;
        if (prop === undefined || !CATCH_ALL_PROPS.has(prop)) return;

        const scope = context.sourceCode.getScope(node);
        const binding = getImportBinding(scope, node.object);
        if (!binding || binding.imported !== "P" || !SOURCES.has(binding.source)) return;

        context.report({
          node,
          messageId: "noCatchAll",
          data: { prop },
        });
      },
    };
  },
});
