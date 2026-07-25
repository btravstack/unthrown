import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { getImportBinding } from "../helpers/get-import-binding.js";
import { resolveResultType } from "../helpers/resolve-result-type.js";

const MODULE = "unthrown";

// The `Result` / `AsyncResult`-producing free functions core exports. Dropping
// any of their return values discards an error channel.
const FREE_PRODUCERS: ReadonlySet<string> = new Set([
  "Ok",
  "Err",
  "OkAsync",
  "ErrAsync",
  "Do",
  "DoAsync",
  "fromNullable",
  "fromThrowable",
  "fromSafeThrowable",
  "fromPromise",
  "fromSafePromise",
  "all",
  "allAsync",
  "allFromDict",
  "allFromDictAsync",
]);

// The producing members of the facade companions (`Result.Ok(...)`,
// `AsyncResult.fromPromise(...)`). The guards (`Result.isOk` …) return
// booleans, not Results, so they are deliberately absent.
const COMPANION_PRODUCERS: Readonly<Record<string, ReadonlySet<string>>> = {
  Result: new Set([
    "Ok",
    "Err",
    "Do",
    "fromNullable",
    "fromThrowable",
    "fromSafeThrowable",
    "all",
    "allFromDict",
  ]),
  AsyncResult: new Set(["Ok", "Err", "Do", "fromPromise", "fromSafePromise", "all", "allFromDict"]),
};

/**
 * The declared return-type annotation of a locally-defined function binding,
 * for the two syntactic forms the rule recognises: a (possibly `declare`d)
 * `function` declaration, and a `const f = () => …` / `const f = function …`
 * initialiser carrying its own return annotation.
 */
const declaredReturnType = (node: ESTree.Node): ESTree.TSType | undefined => {
  if (node.type === "FunctionDeclaration" || node.type === "TSDeclareFunction") {
    return node.returnType?.typeAnnotation;
  }
  if (node.type === "VariableDeclarator" && node.init) {
    const { init } = node;
    if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
      return init.returnType?.typeAnnotation;
    }
  }
  return undefined;
};

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
 * Best-effort and purely syntactic by design: a dropped *method chain*
 * (`r.map(f);`) or a call whose Result-ness only the type system knows is out
 * of scope — see the Linting guide for the deliberate limits.
 */
export const noUnhandledResult = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow dropping a `Result` / `AsyncResult` returned by a bare call",
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
          if (!COMPANION_PRODUCERS[binding.imported]?.has(callee.property.name)) return;
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
