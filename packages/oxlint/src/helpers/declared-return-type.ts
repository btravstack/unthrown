import type { ESTree } from "@oxlint/plugins";

/**
 * The declared return-type annotation of a locally-defined function binding,
 * for the two syntactic forms the rules recognise: a (possibly `declare`d)
 * `function` declaration, and a `const f = () => …` / `const f = function …`
 * initialiser carrying its own return annotation.
 */
export const declaredReturnType = (node: ESTree.Node): ESTree.TSType | undefined => {
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
