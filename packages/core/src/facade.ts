// Result facade — a discoverable namespace alias for the standalone entry
// points. The free functions remain the primary, tree-shakeable API; this
// object is a separate export, so `import { Ok }` never pulls it in. The value
// `Result` and the type `Result<T, E>` (types.ts) share a name — the
// companion-object pattern. See CLAUDE.md → "Internal design".

import { Err, isDefect, isErr, isOk, Ok } from "./constructors.js";
import { isResult } from "./core.js";
import { Defect } from "./defect.js";
import { Do } from "./do.js";
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
 * discoverable namespace: {@link Result.Ok}, {@link Result.Err},
 * {@link Result.Defect}, {@link Result.fromNullable}, {@link Result.fromThrowable},
 * {@link Result.fromPromise}, {@link Result.fromSafePromise}, {@link Result.all},
 * {@link Result.allAsync}, {@link Result.allFromDict},
 * {@link Result.allFromDictAsync}, {@link Result.isOk}, {@link Result.isErr},
 * {@link Result.isDefect}, {@link Result.isResult}.
 *
 * @remarks
 * Purely additive sugar — each member **is** the corresponding free function.
 * The free functions remain the primary, tree-shakeable API; importing only
 * `{ Ok }` never pulls this object in. The value `Result` and the type
 * {@link Result} share one name (the companion-object pattern).
 *
 * @example
 * ```ts
 * import { Result } from "unthrown";
 * Result.Ok(1).flatMap((n) => Result.Ok(n + 1)).unwrap(); // 2
 * ```
 */
export const Result = {
  Ok,
  Err,
  Defect,
  Do,
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
  isResult,
} as const;

// Re-alias the Result type into this module so a single `export { Result }`
// (from index.ts) carries BOTH the companion object above and the type — value
// and type sharing one name, declaration-merged in one place.
export type Result<T, E> = ResultType<T, E>;
