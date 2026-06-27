// Do-notation entry point. The `bind` / `let` steps live on the `Result` /
// `AsyncResult` method surface (core.ts); `Do()` just seeds an empty object
// scope to grow.

import { ok } from "./constructors.js";
import type { Result } from "./types.js";

/**
 * Start a do-notation chain with an empty object scope, grown step by step with
 * `bind` (for `Result`-returning steps) and `let` (for pure values).
 *
 * @remarks
 * Capitalised because `do` is a reserved word. Each step receives the scope
 * accumulated so far; the error types union across `bind`s, and a throw in any
 * step becomes a `Defect`. To go asynchronous, lift the chain with `toAsync()`
 * (then a `bind` may return an `AsyncResult`).
 *
 * @example
 * ```ts
 * import { Do, ok } from "unthrown";
 *
 * const result = Do()
 *   .bind("user", () => findUser(id)) // Result<User, NotFound>
 *   .bind("org", ({ user }) => findOrg(user.orgId)) // Result<Org, NotFound>
 *   .let("label", ({ user, org }) => `${user.name} @ ${org.name}`)
 *   .map(({ user, org, label }) => render(user, org, label));
 * // Result<View, NotFound>
 * ```
 */
export function Do(): Result<{}, never> {
  return ok({});
}
