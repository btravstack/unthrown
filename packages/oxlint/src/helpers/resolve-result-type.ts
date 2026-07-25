import type { ESTree, Scope } from "@oxlint/plugins";

import { getImportBinding } from "./get-import-binding.js";

const MODULE = "unthrown";

const isResultName = (name: string): name is "Result" | "AsyncResult" =>
  name === "Result" || name === "AsyncResult";

/**
 * Resolve a type reference to unthrown's `Result` / `AsyncResult`, however it
 * is locally spelled: a named import (renamed or not — resolution goes through
 * the *imported* name, so `Result as R` matches and `Ok as Result` does not) or
 * a namespace import's qualified name (`U.Result` after
 * `import type * as U from "unthrown"`). Returns the canonical type name, or
 * `undefined` when the reference is not one of unthrown's.
 */
export const resolveResultType = (
  scope: Scope,
  node: ESTree.TSTypeReference,
): "Result" | "AsyncResult" | undefined => {
  const { typeName } = node;
  if (typeName.type === "Identifier") {
    const binding = getImportBinding(scope, typeName);
    if (binding?.source !== MODULE || !isResultName(binding.imported)) return undefined;
    return binding.imported;
  }
  if (typeName.type === "TSQualifiedName" && typeName.left.type === "Identifier") {
    const binding = getImportBinding(scope, typeName.left);
    if (binding?.source !== MODULE || binding.imported !== "*") return undefined;
    return isResultName(typeName.right.name) ? typeName.right.name : undefined;
  }
  return undefined;
};
