// Result facade — a discoverable namespace alias for the standalone entry
// points. The free functions remain the primary, tree-shakeable API; this
// object is a separate export, so `import { ok }` never pulls it in. The value
// `Result` and the type `Result<T, E>` (types.ts) share a name — the
// companion-object pattern. See CLAUDE.md → "Internal design".

import { err, isDefect, isErr, isOk, ok } from "./constructors.js";
import { defect } from "./defect.js";
import {
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  fromNullable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
} from "./interop.js";
import type { Result as ResultType } from "./types.js";

/**
 * Companion object grouping the standalone entry points under a single,
 * discoverable namespace: {@link Result.ok}, {@link Result.err},
 * {@link Result.defect}, {@link Result.fromNullable}, {@link Result.fromThrowable},
 * {@link Result.fromPromise}, {@link Result.fromSafePromise}, {@link Result.all},
 * {@link Result.allAsync}, {@link Result.allFromDict},
 * {@link Result.allFromDictAsync}, {@link Result.isOk}, {@link Result.isErr},
 * {@link Result.isDefect}.
 *
 * @remarks
 * Purely additive sugar — each member **is** the corresponding free function.
 * The free functions remain the primary, tree-shakeable API; importing only
 * `{ ok }` never pulls this object in. The value `Result` and the type
 * {@link Result} share one name (the companion-object pattern).
 *
 * @example
 * ```ts
 * import { Result } from "unthrown";
 * Result.ok(1).flatMap((n) => Result.ok(n + 1)).unwrap(); // 2
 * ```
 */
export const Result = {
  ok,
  err,
  defect,
  fromNullable,
  fromThrowable,
  fromPromise,
  fromSafePromise,
  all,
  allAsync,
  allFromDict,
  allFromDictAsync,
  isOk,
  isErr,
  isDefect,
} as const;

// Re-alias the Result type into this module so a single `export { Result }`
// (from index.ts) carries BOTH the companion object above and the type — value
// and type sharing one name, declaration-merged in one place.
export type Result<T, E> = ResultType<T, E>;
