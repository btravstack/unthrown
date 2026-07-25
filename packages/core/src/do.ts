// Do-notation entry point. The `bind` / `let` steps live on the `Result` /
// `AsyncResult` method surface (core.ts); `Do()` just seeds an empty object
// scope to grow.

import { Ok } from "./constructors.js";
import type { AsyncResult, Result } from "./types.js";

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
 * import { Do, Ok } from "unthrown";
 *
 * const result = Do()
 *   .bind("user", () => findUser(id)) // Result<User, NotFound>
 *   .bind("org", ({ user }) => findOrg(user.orgId)) // Result<Org, NotFound>
 *   .let("label", ({ user, org }) => `${user.name} @ ${org.name}`)
 *   .map(({ user, org, label }) => render(user, org, label));
 * // Result<View, NotFound>
 * ```
 *
 * @example
 * ```ts
 * import { Do, Ok, Err } from "unthrown";
 *
 * // Ok path — the scope accumulates:
 * Do()
 *   .bind("a", () => Ok(2))
 *   .let("b", ({ a }) => a * 10)
 *   .map(({ a, b }) => a + b); // => Ok(22)
 *
 * // Err path — the first Err short-circuits the rest:
 * Do()
 *   .bind("a", () => Err("boom"))
 *   .let("b", ({ a }) => a); // => Err("boom")
 * ```
 *
 * @category Do-notation
 */
export function Do(): Result<{}, never> {
  return Ok({});
}

/**
 * Start an **asynchronous** do-notation chain with an empty object scope — the
 * pre-lifted form of {@link Do}, sparing you `Do().toAsync()`.
 *
 * @remarks
 * From here a `bind` may return a `Result` **or** an `AsyncResult`; the scope
 * accumulates exactly as in a sync {@link Do} chain, and a throw in any step
 * becomes a `Defect`. Named with the `Async` suffix the async free functions
 * carry (`OkAsync`, `allAsync`); the {@link AsyncResult} companion aliases it as
 * `AsyncResult.Do` (the namespace already says "async", so the suffix drops).
 *
 * @example
 * ```ts
 * import { DoAsync, Ok } from "unthrown";
 *
 * const result = await DoAsync()
 *   .bind("user", () => findUser(id)) // AsyncResult<User, NotFound>
 *   .bind("plan", ({ user }) => Ok(user.plan)) // a sync Result is accepted too
 *   .let("label", ({ user, plan }) => `${user.name} on ${plan}`);
 * // Result<{ user: User; plan: Plan; label: string }, NotFound>
 * ```
 *
 * @category Do-notation
 */
export function DoAsync(): AsyncResult<{}, never> {
  return Do().toAsync();
}
