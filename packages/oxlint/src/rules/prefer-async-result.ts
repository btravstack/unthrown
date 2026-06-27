import { defineRule } from "@oxlint/plugins";

import { getImportSource } from "../helpers/get-import-source.js";
import { hasNamedImport } from "../helpers/has-named-import.js";
import { hasTypeArguments } from "../helpers/has-type-arguments.js";
import { isIdentifierTypeName } from "../helpers/is-identifier-type-name.js";

const MODULE = "unthrown";

/**
 * Prefer unthrown's `AsyncResult<T, E>` over `Promise<Result<T, E>>`. A raw
 * `Promise<Result>` can *reject*, reintroducing the throw channel `AsyncResult`
 * is designed to eliminate — so the wrapper is both shorter and stronger.
 *
 * Autofixable — but the fix is only offered when `AsyncResult` is already
 * imported from `unthrown`, so it can't rewrite to an undefined name.
 */
export const preferAsyncResult = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer `AsyncResult<T, E>` over `Promise<Result<T, E>>`",
      recommended: true,
    },
    messages: {
      preferAsyncResult: "Use `AsyncResult<T, E>` instead of `Promise<Result<T, E>>`.",
    },
    fixable: "code",
  },
  createOnce: (context) => {
    return {
      TSTypeReference: (node) => {
        if (!isIdentifierTypeName(node, ["Promise"])) return;
        if (!hasTypeArguments(node, 1)) return;

        const inner = node.typeArguments.params[0];
        if (inner.type !== "TSTypeReference") return;
        if (!isIdentifierTypeName(inner, ["Result"])) return;
        if (!hasTypeArguments(inner, 2)) return;

        const scope = context.sourceCode.getScope(node);
        if (getImportSource(scope, inner.typeName) !== MODULE) return;

        // Only autofix when `AsyncResult` is already importable — otherwise the
        // rewrite would reference an undefined name. Report without a fix instead.
        const canFix = hasNamedImport(scope, "AsyncResult", MODULE);

        context.report({
          node,
          messageId: "preferAsyncResult",
          ...(canFix && {
            fix: (fixer) => {
              const value = context.sourceCode.getText(inner.typeArguments.params[0]);
              const error = context.sourceCode.getText(inner.typeArguments.params[1]);
              return fixer.replaceText(node, `AsyncResult<${value}, ${error}>`);
            },
          }),
        });
      },
    };
  },
});
