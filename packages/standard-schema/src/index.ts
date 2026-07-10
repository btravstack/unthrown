// @unthrown/standard-schema — bridge any Standard Schema validator (Zod,
// Valibot, ArkType, …) to a `Result` / `AsyncResult`.
//
// A Standard Schema's `validate` returns `{ value }` on success or `{ issues }`
// on failure. `fromSchema` turns that into a validator returning
// `Result<Output, readonly Issue[]>`; `fromSchemaAsync` is the async counterpart
// (and also accepts synchronous schemas). The `issues` array is the modeled `E`
// — a failed validation is an anticipated outcome, never a Defect.
//
//   import { fromSchema } from "@unthrown/standard-schema";
//   import { z } from "zod";
//
//   const parseUser = fromSchema(z.object({ id: z.string() }));
//   parseUser(input); // Result<{ id: string }, readonly StandardSchemaV1.Issue[]>

import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Err, fromSafePromise, fromThrowable, Ok } from "unthrown";
import type { AsyncResult, Result } from "unthrown";

/** The error channel both entry points produce: a schema's validation issues. */
export type SchemaIssues = readonly StandardSchemaV1.Issue[];

// A Standard Schema signals async validation by returning a thenable. Detect it
// structurally rather than with `instanceof Promise`, which misses a promise
// created in another realm (a `vm` context, a worker) even though it is a
// genuine `PromiseLike`.
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Turn a **synchronous** Standard Schema into a validator returning a
 * `Result`.
 *
 * @remarks
 * Validation issues are the modeled error `E` — `Result<Output, SchemaIssues>` —
 * because a failed validation is an *anticipated* outcome, not a Defect. Works
 * with any Standard Schema implementation (Zod, Valibot, ArkType, …).
 *
 * A validator that **throws** (rather than returning issues) becomes a `Defect`
 * — the same boundary behaviour as `fromThrowable`, so an unexpected crash never
 * escapes as a raw exception. If the schema validates **asynchronously**
 * (its `validate` returns a `Promise`), a synchronous `Result` cannot represent
 * the pending work, so this throws a `TypeError` — a deliberate usage error; use
 * {@link fromSchemaAsync} instead.
 *
 * @typeParam S - the schema type.
 * @param schema - a Standard Schema validator.
 * @returns a function mapping an input to `Result<Output, SchemaIssues>`.
 *
 * @example
 * ```ts
 * import { fromSchema } from "@unthrown/standard-schema";
 * const parse = fromSchema(z.string());
 * parse("hi").get(); // "hi"
 * parse(42).getErr(); // the issues array
 * ```
 */
export function fromSchema<S extends StandardSchemaV1>(
  schema: S,
): (input: unknown) => Result<StandardSchemaV1.InferOutput<S>, SchemaIssues> {
  type Output = StandardSchemaV1.InferOutput<S>;
  // Run `validate` at a boundary so a *throwing* validator lands in the Defect
  // channel instead of escaping; `qualify` only ever mints a Defect, so E = never.
  const validate = fromThrowable(
    (input: unknown) => schema["~standard"].validate(input),
    (cause, defect) => defect(cause),
  );
  return (input) => {
    const settled = validate(input);
    // An async schema can't be represented synchronously — fail loud and early.
    if (settled.isOk() && isThenable(settled.value)) {
      throw new TypeError(
        "@unthrown/standard-schema: this schema validates asynchronously — use fromSchemaAsync instead.",
      );
    }
    return settled.flatMap((result) => {
      const sync = result as StandardSchemaV1.Result<Output>;
      return sync.issues ? Err(sync.issues) : Ok(sync.value);
    });
  };
}

/**
 * Turn a Standard Schema (sync **or** async) into a validator returning an
 * `AsyncResult`.
 *
 * @remarks
 * The async counterpart of {@link fromSchema}: it awaits the schema's
 * `validate`, so it accepts both synchronous and asynchronous schemas. As with
 * every `AsyncResult`, the returned value never rejects — a validator that
 * *throws* (rather than returning issues) becomes a `Defect`.
 *
 * @typeParam S - the schema type.
 * @param schema - a Standard Schema validator.
 * @returns a function mapping an input to `AsyncResult<Output, SchemaIssues>`.
 *
 * @example
 * ```ts
 * import { fromSchemaAsync } from "@unthrown/standard-schema";
 * const parse = fromSchemaAsync(asyncSchema);
 * (await parse(input)).match({ ok, err, defect });
 * ```
 */
export function fromSchemaAsync<S extends StandardSchemaV1>(
  schema: S,
): (input: unknown) => AsyncResult<StandardSchemaV1.InferOutput<S>, SchemaIssues> {
  return (input) =>
    fromSafePromise(async () => schema["~standard"].validate(input)).flatMap((result) =>
      result.issues ? Err(result.issues) : Ok(result.value),
    );
}
