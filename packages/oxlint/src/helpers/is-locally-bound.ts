import type { ESTree, Scope } from "@oxlint/plugins";

/**
 * Whether a type-name identifier resolves to a *local* binding — a type alias,
 * interface, import, or type parameter — in `scope`, as opposed to an ambient
 * global like the built-in `Error` or `Promise`.
 *
 * A configured global (the CLI's default env defines `Error`, `Promise`, …)
 * still *resolves*, but to a variable with no definitions — so the check
 * requires an actual `defs` entry, not mere resolution. Used to keep the
 * bare-`Error` and global-`Promise` checks false-positive-free: a user-declared
 * `type Error = { … }` or a generic `<Error>` parameter is not the global, so
 * it must not be treated as the ambiguous built-in. Mirrors how the import
 * helpers resolve `Result` / `AsyncResult` through scope rather than by name
 * alone.
 */
export const isLocallyBound = (scope: Scope, target: ESTree.Node): boolean => {
  const resolved = scope.references.find((ref) => ref.identifier === target)?.resolved;
  return resolved != null && resolved.defs.length > 0;
};
