import type { Scope } from "@oxlint/plugins";

/**
 * Whether `name` is in scope as a named import from `module` (e.g. is
 * `AsyncResult` imported from `"unthrown"`). Used to decide whether an autofix
 * can safely reference it. Walks up the scope chain.
 */
export const hasNamedImport = (scope: Scope, name: string, module: string): boolean => {
  for (let current: Scope | null = scope; current; current = current.upper) {
    const variable = current.variables.find((v) => v.name === name);
    if (variable) {
      const parent = variable.defs[0]?.parent;
      return parent?.type === "ImportDeclaration" && parent.source.value === module;
    }
  }
  return false;
};
