// Result facade — a discoverable namespace alias for the standalone entry
// points. The free functions remain the primary, tree-shakeable API; this
// object is a separate export, so `import { ok }` never pulls it in. The value
// `Result` and the type `Result<T, E>` (types.ts) share a name — the
// companion-object pattern. See design-memory §2.8.

import { err, isDefect, isErr, isOk, ok } from "./constructors.js";
import { defect } from "./defect.js";
import { all, fromNullable, fromPromise, fromSafePromise, fromThrowable } from "./interop.js";
import type { Result as ResultType } from "./types.js";

export const Result = {
  ok,
  err,
  defect,
  fromNullable,
  fromThrowable,
  fromPromise,
  fromSafePromise,
  all,
  isOk,
  isErr,
  isDefect,
} as const;

// Re-alias the Result type into this module so a single `export { Result }`
// (from index.ts) carries BOTH the companion object above and the type — value
// and type sharing one name, declaration-merged in one place.
export type Result<T, E> = ResultType<T, E>;
