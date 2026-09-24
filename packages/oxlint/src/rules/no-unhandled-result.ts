import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { declaredReturnType } from "../helpers/declared-return-type.js";
import { getImportBinding } from "../helpers/get-import-binding.js";
import { COMPANION_PRODUCERS, FREE_PRODUCERS } from "../helpers/producers.js";
import { resolveResultType } from "../helpers/resolve-result-type.js";

const MODULE = "unthrown";

/**
 * Whether `callee` resolves to a locally-declared function whose declared
 * return type is unthrown's `Result` / `AsyncResult` (the annotation's own
 * identifier is resolved through the import check, so a `Result` from another
 * library does not count).
 */
const isLocalResultFunction = (
  scope: Scope,
  callee: ESTree.Node,
  getScope: (node: ESTree.Node) => Scope,
): boolean => {
  const def = scope.references.find((ref) => ref.identifier === callee)?.resolved?.defs[0];
  if (!def) return false;
  const returnType = declaredReturnType(def.node);
  if (returnType?.type !== "TSTypeReference") return false;
  return resolveResultType(getScope(returnType), returnType) !== undefined;
};

/**
 * Disallow dropping a `Result` / `AsyncResult` on the floor — an expression
 * statement that is a bare call (awaited or not) to something known to produce
 * one: an unthrown-imported producer (`Ok`, `Err`, `fromPromise`, `all`, …),
 * a facade companion member (`Result.Ok(...)`, `AsyncResult.fromPromise(...)`),
 * or a locally-declared function whose return annotation is unthrown's
 * `Result` / `AsyncResult`. The Result carries the error channel; dropping it
 * silently discards failures — bind it, return it, or eliminate it with
 * `match` / a `get*` extractor. (`await tryFn();` is still a drop: awaiting an
 * `AsyncResult` yields a `Result`, which is then discarded.)
 *
 * Best-effort and purely syntactic by design, so it MISSES two common drops: a
 * call to a function **imported** from another module of your own (its return
 * annotation lives in a file this rule never sees), and a dropped *method
 * chain* (`r.map(f);`). Both need the type checker, and no off-the-shelf
 * type-aware rule covers them: typescript-eslint's `no-floating-promises`
 * ignores an `AsyncResult` even with `checkThenables` (it only counts a
 * thenable whose `then` takes a rejection callback, which `AsyncResult`'s
 * success-only `then` deliberately lacks), and a sync `Result` is no
 * thenable at all. See the Linting guide for the deliberate limits.
 */
export const noUnhandledResult = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow dropping a `Result` / `AsyncResult` returned by a bare call to an unthrown producer or an in-file function annotated `Result` / `AsyncResult`. Syntactic: misses results returned by functions imported from your own modules, and dropped method chains (`r.map(f);`) — both need type information this rule does not have",
      recommended: true,
    },
    messages: {
      noUnhandledResult:
        "The `Result` returned by `{{ callee }}` is dropped — its error channel is silently discarded. Bind it, return it, or eliminate it with `match` / a `get*` extractor.",
    },
  },
  createOnce: (context) => {
    const getScope = (node: ESTree.Node) => context.sourceCode.getScope(node);

    return {
      ExpressionStatement: (node) => {
        // An awaited bare call is still a dropped result — unwrap it.
        const expression =
          node.expression.type === "AwaitExpression" ? node.expression.argument : node.expression;
        if (expression.type !== "CallExpression") return;

        const { callee } = expression;
        const scope = getScope(node);

        if (callee.type === "Identifier") {
          const binding = getImportBinding(scope, callee);
          const dropped = binding
            ? binding.source === MODULE && FREE_PRODUCERS.has(binding.imported)
            : isLocalResultFunction(scope, callee, getScope);
          if (!dropped) return;
          context.report({
            node: expression,
            messageId: "noUnhandledResult",
            data: { callee: callee.name },
          });
          return;
        }

        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.property.type === "Identifier"
        ) {
          const binding = getImportBinding(scope, callee.object);
          if (binding?.source !== MODULE) return;
          if (!COMPANION_PRODUCERS.get(binding.imported)?.has(callee.property.name)) return;
          context.report({
            node: expression,
            messageId: "noUnhandledResult",
            data: { callee: `${callee.object.name}.${callee.property.name}` },
          });
        }
      },
    };
  },
});
