import type { Scope } from "@oxlint/plugins";

import { importedName } from "./get-import-binding.js";

/**
 * Whether `name` is in scope as a named import from `module` under that same
 * local name (e.g. is `AsyncResult` imported from `"unthrown"` and spelled
 * `AsyncResult` locally). Used to decide whether an autofix can safely
 * reference it — both names must line up, so a rename (`AsyncResult as AR`) or
 * a decoy (`Ok as AsyncResult`) withholds the fix. Walks up the scope chain.
 */
export const hasNamedImport = (scope: Scope, name: string, module: string): boolean => {
  for (let current: Scope | null = scope; current; current = current.upper) {
    const variable = current.variables.find((v) => v.name === name);
    if (variable) {
      const def = variable.defs[0];
      return (
        def?.parent?.type === "ImportDeclaration" &&
        def.parent.source.value === module &&
        def.node.type === "ImportSpecifier" &&
        importedName(def.node.imported) === name
      );
    }
  }
  return false;
};
