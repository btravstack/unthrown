import type { ESTree } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { hasNamedImport } from "../helpers/has-named-import.js";
import { hasTypeArguments } from "../helpers/has-type-arguments.js";
import { isIdentifierTypeName } from "../helpers/is-identifier-type-name.js";
import { isLocallyBound } from "../helpers/is-locally-bound.js";
import { resolveResultType } from "../helpers/resolve-result-type.js";

const MODULE = "unthrown";

/**
 * Whether a `Promise<Result<…>>` annotation sits in the return position of a
 * function *type* (`() => Promise<Result<…>>`, `{ load(): Promise<Result<…>> }`).
 * A report there carries no autofix: the implementer may be an `async` function
 * the rule can't see, and an `async` function must return a native `Promise` —
 * rewriting the annotation to `AsyncResult<…>` could not compile. (A
 * `TSTypeAnnotation` directly under a function type is always its return type;
 * parameter annotations hang off the parameter patterns.)
 */
const isFunctionTypeReturn = (node: ESTree.TSTypeReference): boolean => {
  const annotation = node.parent;
  return (
    annotation.type === "TSTypeAnnotation" &&
    (annotation.parent.type === "TSFunctionType" || annotation.parent.type === "TSMethodSignature")
  );
};

/**
 * Prefer unthrown's `AsyncResult<T, E>` over `Promise<Result<T, E>>`. A raw
 * `Promise<Result>` can *reject*, reintroducing the throw channel `AsyncResult`
 * is designed to eliminate — so the wrapper is both shorter and stronger.
 *
 * Autofixable — but the fix is only offered when `AsyncResult` is already
 * imported from `unthrown` (so it can't rewrite to an undefined name) and the
 * annotation is not a position an `async` implementation must satisfy (an
 * `async` function's own return annotation, or the return type of a function
 * type — see {@link isFunctionTypeReturn}).
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
    // Spans of return-type annotations on `async` functions: a report inside
    // one carries no autofix, because an `async` function must return a
    // native `Promise` — rewriting the annotation to `AsyncResult<…>` would
    // not compile. Function nodes are visited before their return-type
    // children, so the set is populated in time.
    const asyncReturnSpans = new Set<string>();
    const trackAsyncFunction = (node: ESTree.Function | ESTree.ArrowFunctionExpression) => {
      if (node.async && node.returnType) {
        const t = node.returnType.typeAnnotation;
        asyncReturnSpans.add(`${t.start}:${t.end}`);
      }
    };

    return {
      // Spans are file-relative, but `createOnce` runs once per lint *run* (not
      // per file) — without a reset, a non-async annotation in a later file at
      // the same offsets as an earlier file's async one would wrongly lose its
      // autofix, and the set would grow unbounded across a whole project lint.
      before: () => {
        asyncReturnSpans.clear();
      },
      FunctionDeclaration: trackAsyncFunction,
      FunctionExpression: trackAsyncFunction,
      ArrowFunctionExpression: trackAsyncFunction,
      TSTypeReference: (node) => {
        if (!isIdentifierTypeName(node, ["Promise"])) return;
        if (!hasTypeArguments(node, 1)) return;

        const inner = node.typeArguments.params[0];
        if (inner.type !== "TSTypeReference") return;
        if (!hasTypeArguments(inner, 2)) return;

        const scope = context.sourceCode.getScope(node);
        // A locally-declared `Promise` (a user's own type alias or a generic
        // parameter literally named `Promise`) is not the global — same
        // resolve-by-scope rule as the bare-`Error` check next door.
        if (isLocallyBound(scope, node.typeName)) return;
        if (resolveResultType(scope, inner) !== "Result") return;

        // Withhold the fix when this annotation is an `async` function's
        // return type (see the `asyncReturnSpans` comment above), a function
        // *type*'s return position (the implementer may be `async` — see
        // `isFunctionTypeReturn`), or when `AsyncResult` isn't importable
        // (the rewrite would reference an undefined name).
        const inAsyncReturn = asyncReturnSpans.has(`${node.start}:${node.end}`);
        const canFix =
          !inAsyncReturn &&
          !isFunctionTypeReturn(node) &&
          hasNamedImport(scope, "AsyncResult", MODULE);

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
