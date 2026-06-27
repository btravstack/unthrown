import { defineRule } from "@oxlint/plugins";

import { getImportSource } from "../helpers/get-import-source.js";
import { hasTypeArguments } from "../helpers/has-type-arguments.js";
import { isIdentifierTypeName } from "../helpers/is-identifier-type-name.js";

import type { ESTree } from "@oxlint/plugins";

const MODULE = "unthrown";
const RESULT_TYPES = ["Result", "AsyncResult"] as const;

// Keyword type nodes that say nothing about the domain — they make `E` a
// catch-all, which is exactly what Thesis #1 forbids.
const AMBIGUOUS_KEYWORDS: ReadonlySet<string> = new Set([
  "TSUnknownKeyword",
  "TSAnyKeyword",
  "TSStringKeyword",
  "TSNumberKeyword",
  "TSBooleanKeyword",
  "TSBigIntKeyword",
  "TSSymbolKeyword",
  "TSObjectKeyword",
  "TSNullKeyword",
  "TSUndefinedKeyword",
]);

/**
 * Disallow a non-specific error type in the `E` position of `Result<T, E>` /
 * `AsyncResult<T, E>`: `unknown`, `any`, `Error`, bare `{}` / `object`, and the
 * primitive keywords. `E` should name the *anticipated* domain failures — a
 * tagged error, a union of them, a literal — not "anything went wrong". `never`
 * (an intentionally error-free result) is allowed.
 */
export const noAmbiguousErrorType = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow non-specific error types (`unknown`, `any`, `Error`, `object`, `{}`, primitives) in the error position of `Result` / `AsyncResult`",
      recommended: true,
    },
    messages: {
      noAmbiguousErrorType:
        "Specify a concrete domain error instead of `{{ type }}` in `{{ result }}`.",
    },
  },
  createOnce: (context) => {
    return {
      TSTypeReference: (node) => {
        if (!isIdentifierTypeName(node, RESULT_TYPES)) return;
        if (!hasTypeArguments(node, 2)) return;

        const importSource = getImportSource(context.sourceCode.getScope(node), node.typeName);
        if (importSource !== MODULE) return;

        const errorNode: ESTree.TSType = node.typeArguments.params[1];
        if (!isAmbiguousType(errorNode)) return;

        context.report({
          node: errorNode,
          messageId: "noAmbiguousErrorType",
          data: {
            type: context.sourceCode.getText(errorNode),
            result: context.sourceCode.getText(node),
          },
        });
      },
    };
  },
});

/**
 * Whether an error-position type is non-specific. Recurses into unions and
 * intersections, so `MyError | unknown` and `Error | MyError` are flagged too —
 * one ambiguous member taints the whole type.
 */
function isAmbiguousType(node: ESTree.TSType): boolean {
  if (node.type === "TSUnionType" || node.type === "TSIntersectionType") {
    return node.types.some(isAmbiguousType);
  }
  // The *empty* object literal `{}` is ambiguous; `{ code: number }` is fine.
  if (node.type === "TSTypeLiteral") return node.members.length === 0;
  // The bare `Error` class is too generic; a `MyError` is fine.
  if (node.type === "TSTypeReference") {
    return node.typeName.type === "Identifier" && node.typeName.name === "Error";
  }
  return AMBIGUOUS_KEYWORDS.has(node.type);
}
