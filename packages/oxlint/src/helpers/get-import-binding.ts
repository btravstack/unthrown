import type { ESTree, Scope } from "@oxlint/plugins";

/**
 * Where an identifier's binding was imported from: the module `source` and the
 * *imported* (exported) name — `"*"` for a namespace import, `"default"` for a
 * default import.
 */
export type ImportBinding = {
  source: string;
  imported: string;
};

/**
 * The exported name an import specifier refers to — handles the string form
 * (`import { "Result" as R }`) as well as the identifier form.
 */
export const importedName = (name: ESTree.ModuleExportName): string =>
  name.type === "Identifier" ? name.name : name.value;

/**
 * Resolve the import binding behind a given identifier, via scope analysis —
 * e.g. the `R` in `import type { Result as R } from "unthrown"` resolves to
 * `{ source: "unthrown", imported: "Result" }`. Keyed by the IMPORTED name, not
 * the local one, so a rename (`Result as R`) still resolves and a decoy
 * (`Ok as Result`) does not. Returns `undefined` if the identifier cannot be
 * resolved to an import (so callers stay conservative — no false positives).
 */
export const getImportBinding = (scope: Scope, target: ESTree.Node): ImportBinding | undefined => {
  const def = scope.references.find((ref) => ref.identifier === target)?.resolved?.defs[0];
  if (def?.parent?.type !== "ImportDeclaration") return undefined;
  const source = def.parent.source.value;
  switch (def.node.type) {
    case "ImportSpecifier":
      return { source, imported: importedName(def.node.imported) };
    case "ImportDefaultSpecifier":
      return { source, imported: "default" };
    case "ImportNamespaceSpecifier":
      return { source, imported: "*" };
    default:
      return undefined;
  }
};
