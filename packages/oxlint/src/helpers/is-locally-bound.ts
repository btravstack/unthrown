import type { ESTree, Scope } from "@oxlint/plugins";

/**
 * Whether a type-name identifier resolves to a *local* binding — a type alias,
 * interface, import, or type parameter — in `scope`, as opposed to an ambient
 * global like the built-in `Error`.
 *
 * Used to keep the bare-`Error` check false-positive-free: a user-declared
 * `type Error = { … }` or a generic `<Error>` parameter is not the global
 * `Error`, so it must not be treated as the ambiguous built-in. Mirrors how
 * {@link getImportSource} resolves `Result` / `AsyncResult` through scope rather
 * than by name alone.
 */
export const isLocallyBound = (scope: Scope, target: ESTree.Node): boolean =>
  scope.references.find((ref) => ref.identifier === target)?.resolved != null;
