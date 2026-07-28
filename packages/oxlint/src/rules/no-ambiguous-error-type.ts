import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { hasTypeArguments } from "../helpers/has-type-arguments.js";
import { isLocallyBound } from "../helpers/is-locally-bound.js";
import { resolveResultType } from "../helpers/resolve-result-type.js";

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
  "TSVoidKeyword",
]);

// The error-matcher combinator whose *whole* builder output becomes the
// outgoing error channel, so a `.returnType<R>()` pin inside its callback IS a
// declaration of `E`. Deliberately alone:
//
//   - `recoverErrCases` — the output is the new SUCCESS type (`E` is `never`).
//   - `tapErrCases`     — the branch results are discarded entirely.
//   - `match`'s `errCases` (and a standalone `match`) — the output is a folded
//                         value, where `unknown` is a legitimate pin.
//   - `flatMapErrCases` / `flatTapErrCases` — the output must be a `Result`, so
//                         a *bare* ambiguous pin does not type-check at all; an
//                         ambiguous type nested in a `Result<U, E2>` pin is
//                         already caught by the `TSTypeReference` visitor, which
//                         sees type arguments wherever they occur.
//
// Flagging any of those would fire on valid code — see the Linting guide.
const ERROR_CHANNEL_PIN_METHODS: ReadonlySet<string> = new Set(["mapErrCases"]);

/**
 * Disallow a non-specific error type in the `E` position of `Result<T, E>` /
 * `AsyncResult<T, E>`: `unknown`, `any`, `Error`, bare `{}` / `object`, and the
 * primitive keywords. `E` should name the *anticipated* domain failures — a
 * tagged error, a union of them, a literal — not "anything went wrong". `never`
 * (an intentionally error-free result) is allowed.
 *
 * The same table applies to the matcher's `.returnType<R>()` pin *where the pin
 * declares the error channel* — inside a `mapErrCases` callback, whose builder
 * output becomes the new `E`. A pin is a type argument on a call, not a type
 * annotation, so it needs its own check; every other matcher surface pins
 * something that is not `E` and is deliberately left alone (see
 * {@link ERROR_CHANNEL_PIN_METHODS}).
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
      noAmbiguousReturnTypePin:
        "This `returnType<{{ type }}>()` pin becomes the error channel of `{{ method }}` — declare a concrete domain error instead.",
    },
  },
  createOnce: (context) => {
    return {
      CallExpression: (node) => {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "returnType" ||
          callee.object.type !== "Identifier"
        ) {
          return;
        }
        if (!hasTypeArguments(node, 1)) return;

        const pinned: ESTree.TSType = node.typeArguments.params[0];
        const scope = context.sourceCode.getScope(node);
        if (!isAmbiguousType(pinned, scope)) return;

        const method = errorChannelPinMethod(scope, callee.object);
        if (method === undefined) return;

        context.report({
          node: pinned,
          messageId: "noAmbiguousReturnTypePin",
          data: { type: context.sourceCode.getText(pinned), method },
        });
      },

      TSTypeReference: (node) => {
        if (!hasTypeArguments(node, 2)) return;

        const scope = context.sourceCode.getScope(node);
        if (resolveResultType(scope, node) === undefined) return;

        const errorNode: ESTree.TSType = node.typeArguments.params[1];
        if (!isAmbiguousType(errorNode, scope)) return;

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
 * The combinator whose matcher `target` is — i.e. `target` is the *first*
 * parameter (the matcher; the second is `defect`) of a callback passed directly
 * to one of {@link ERROR_CHANNEL_PIN_METHODS} — or `undefined` when it is
 * anything else. Resolved through scope analysis, so a matcher referenced from
 * a nested arrow inside the same callback still counts, while an unrelated
 * `x.returnType<unknown>()` (or a matcher first copied into another variable —
 * a documented syntactic limit) does not.
 */
function errorChannelPinMethod(scope: Scope, target: ESTree.Node): string | undefined {
  const def = scope.references.find((ref) => ref.identifier === target)?.resolved?.defs[0];
  if (def?.type !== "Parameter") return undefined;

  const fn = def.node;
  if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") return undefined;

  const first = fn.params[0];
  if (first?.type !== "Identifier" || first.name !== def.name.name) return undefined;

  const call = fn.parent;
  if (call.type !== "CallExpression" || call.arguments[0] !== fn) return undefined;
  const { callee } = call;
  if (callee.type !== "MemberExpression" || callee.computed) return undefined;
  if (callee.property.type !== "Identifier") return undefined;
  return ERROR_CHANNEL_PIN_METHODS.has(callee.property.name) ? callee.property.name : undefined;
}

/**
 * Whether an error-position type is non-specific. Recurses into unions and
 * intersections, so `MyError | unknown` and `Error | MyError` are flagged too —
 * one ambiguous member taints the whole type. `scope` is threaded through so the
 * bare-`Error` check can resolve the identifier: only the ambient global `Error`
 * is flagged, never a locally-declared `type Error` or a generic `<Error>`.
 */
function isAmbiguousType(node: ESTree.TSType, scope: Scope): boolean {
  if (node.type === "TSUnionType" || node.type === "TSIntersectionType") {
    return node.types.some((member) => isAmbiguousType(member, scope));
  }
  // The *empty* object literal `{}` is ambiguous; `{ code: number }` is fine.
  if (node.type === "TSTypeLiteral") return node.members.length === 0;
  // The bare global `Error` class is too generic; a `MyError` — or a user's own
  // `type Error` / generic `<Error>` — is fine, so resolve it through scope.
  if (node.type === "TSTypeReference") {
    return (
      node.typeName.type === "Identifier" &&
      node.typeName.name === "Error" &&
      !isLocallyBound(scope, node.typeName)
    );
  }
  return AMBIGUOUS_KEYWORDS.has(node.type);
}
