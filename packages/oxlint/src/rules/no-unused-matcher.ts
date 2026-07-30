import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { getImportBinding } from "../helpers/get-import-binding.js";

// The five error combinators plus `match`'s `errCases` handler — every site
// where unthrown injects a matcher bound to the actual error. The names are
// unthrown's own coinage, so matching on them alone (no receiver type) is safe.
const CASES_METHODS: ReadonlySet<string> = new Set([
  "mapErrCases",
  "flatMapErrCases",
  "recoverErrCases",
  "tapErrCases",
  "flatTapErrCases",
]);

// `match` is re-exported by core, but a codebase may also import it straight
// from ts-pattern — a foreign builder from either satisfies the structural
// `ExhaustiveMatch` constraint, so both count (same set as
// `no-catch-all-pattern`'s sources).
const SOURCES: ReadonlySet<string> = new Set(["unthrown", "ts-pattern"]);

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

const isFunction = (node: ESTree.Node): boolean =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

/** The AST children of a node — every nested node value, minus the `parent` back-edge. */
const childNodes = (node: ESTree.Node): ESTree.Node[] => {
  const children: ESTree.Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) children.push(item);
    } else if (isNode(value)) children.push(value);
  }
  return children;
};

type Callback = ESTree.ArrowFunctionExpression | ESTree.Function;

/**
 * Disallow a `…Cases` callback that ignores the matcher it was handed — the
 * other way through the door `no-catch-all-pattern` guards, and the one the
 * type checker cannot see.
 *
 * The error combinators (`mapErrCases`, `flatMapErrCases`, `recoverErrCases`,
 * `tapErrCases`, `flatTapErrCases`) and `match`'s `errCases` handler constrain
 * the callback's return on its *shape* (`ExhaustiveMatch`), not its
 * provenance — any exhaustive builder satisfies it, including one built over a
 * completely unrelated value. At runtime only the **injected** matcher is bound
 * to the actual error; a borrowed builder gets `.run()` called against whatever
 * value *it* closed over. Two outcomes, neither diagnosable from the call site:
 * the wrong branch is chosen silently (a plausible wrong value, with the Err
 * channel typing as fully handled), or nothing matches and the modeled error
 * becomes a Defect. `noUnusedParameters` does not cover it — the parameter is
 * not unused, it is simply never declared.
 *
 * Two checks, one report per fault:
 *
 * - **`unusedMatcher`** — the callback's matcher parameter is absent
 *   (`() => …`), or declared but never read. There is no escape hatch: a
 *   `…Cases` callback that does not use its matcher is never what you meant.
 * - **`foreignMatch`** — a call to unthrown's (or ts-pattern's) `match(...)`
 *   in the callback's own body. Within a `…Cases` body there is no legitimate
 *   reason to build a second matcher, and this catches a trivially-referenced
 *   parameter (`void matcher`) fronting for a foreign builder. Nested
 *   functions are skipped — a *branch handler* matching a payload field
 *   (`.with(P.tag("A"), (e) => match(e.code)…)`) is that inner value's
 *   ordinary match, not a builder for the error. Reported only when the
 *   parameter is otherwise used, so one fault yields one report.
 *
 * Purely syntactic, like the rest of the plugin: the `…Cases` receivers are
 * not type-checked (the method names are unthrown's own coinage), `match` is
 * resolved to its import via scope analysis (a rename fires, a local decoy
 * does not), and a callback passed by reference is a documented miss.
 */
export const noUnusedMatcher = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a `…Cases` callback that ignores the injected matcher — the only builder bound to the actual error; a builder sourced elsewhere picks branches from whatever value it closed over",
      recommended: true,
    },
    messages: {
      unusedMatcher:
        "This `{{method}}` callback ignores the matcher it was handed. The injected matcher is the only builder bound to the actual error — a builder sourced elsewhere picks its branch from whatever value *it* closed over, recovering the wrong case silently or turning the modeled error into a Defect. Match through the callback's matcher parameter.",
      foreignMatch:
        "Unexpected `match(...)` inside a `{{method}}` callback. The injected matcher parameter is the only builder bound to the actual error — a second matcher built here is run against whatever value it closed over. Match through the callback's matcher parameter.",
    },
  },
  createOnce: (context) => {
    /** Whether the callback's first parameter is read anywhere in its body. */
    const usesMatcher = (callback: Callback): boolean => {
      const [parameter] = callback.params;
      if (parameter === undefined) return false;
      // Only a plain identifier can be traced through scope analysis; a
      // destructured or defaulted parameter is left alone (conservative).
      if (parameter.type !== "Identifier") return true;
      const variable = context.sourceCode
        .getDeclaredVariables(callback)
        .find((v) => v.defs.some((def) => def.name === parameter));
      return variable === undefined || variable.references.some((ref) => ref.isRead());
    };

    /**
     * The `match(...)` calls in the callback's own body — nested functions
     * skipped (a branch handler's inner match belongs to another value).
     */
    const foreignMatchCalls = (callback: Callback): ESTree.CallExpression[] => {
      const calls: ESTree.CallExpression[] = [];
      if (callback.body === null) return calls;
      const visit = (node: ESTree.Node): void => {
        if (node !== callback.body && isFunction(node)) return;
        if (node.type === "CallExpression" && node.callee.type === "Identifier") {
          const binding = getImportBinding(context.sourceCode.getScope(node), node.callee);
          if (binding?.imported === "match" && SOURCES.has(binding.source)) calls.push(node);
        }
        for (const child of childNodes(node)) visit(child);
      };
      visit(callback.body);
      return calls;
    };

    const check = (callback: ESTree.Node, method: string): void => {
      if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression")
        return;

      if (!usesMatcher(callback)) {
        context.report({ node: callback, messageId: "unusedMatcher", data: { method } });
        return;
      }

      for (const call of foreignMatchCalls(callback))
        context.report({ node: call, messageId: "foreignMatch", data: { method } });
    };

    return {
      CallExpression: (node) => {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier"
        )
          return;

        const [argument] = node.arguments;
        if (argument === undefined) return;

        if (CASES_METHODS.has(callee.property.name)) {
          check(argument, callee.property.name);
          return;
        }

        // `match`'s `errCases` handler is the same protocol — same injection,
        // same structural constraint, same hole.
        if (callee.property.name !== "match" || argument.type !== "ObjectExpression") return;
        for (const property of argument.properties) {
          if (
            property.type === "Property" &&
            !property.computed &&
            ((property.key.type === "Identifier" && property.key.name === "errCases") ||
              (property.key.type === "Literal" && property.key.value === "errCases"))
          )
            check(property.value, "errCases");
        }
      },
    };
  },
});
