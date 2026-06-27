// @unthrown/standard-schema — bridge any Standard Schema validator (Zod,
// Valibot, ArkType, …) to a `Result` / `AsyncResult`.
//
// A Standard Schema's `validate` returns `{ value }` on success or `{ issues }`
// on failure. `fromSchema` turns that into a validator returning
// `Result<Output, readonly Issue[]>`; `fromSchemaAsync` is the async counterpart
// (and also accepts synchronous schemas). The `issues` array is the modeled `E`
// — a failed validation is an anticipated outcome, never a defect.
//
//   import { fromSchema } from "@unthrown/standard-schema";
//   import { z } from "zod";
//
//   const parseUser = fromSchema(z.object({ id: z.string() }));
//   parseUser(input); // Result<{ id: string }, readonly StandardSchemaV1.Issue[]>

import type { StandardSchemaV1 } from "@standard-schema/spec";
import { err, fromSafePromise, ok } from "unthrown";
import type { AsyncResult, Result } from "unthrown";

/** The error channel both entry points produce: a schema's validation issues. */
export type SchemaIssues = readonly StandardSchemaV1.Issue[];

/**
 * Turn a **synchronous** Standard Schema into a validator returning a
 * `Result`.
 *
 * @remarks
 * Validation issues are the modeled error `E` — `Result<Output, SchemaIssues>` —
 * because a failed validation is an *anticipated* outcome, not a defect. Works
 * with any Standard Schema implementation (Zod, Valibot, ArkType, …).
 *
 * If the schema validates **asynchronously** (its `validate` returns a
 * `Promise`), a synchronous `Result` cannot represent the pending work, so this
 * throws a `TypeError` — use {@link fromSchemaAsync} instead.
 *
 * @typeParam S - the schema type.
 * @param schema - a Standard Schema validator.
 * @returns a function mapping an input to `Result<Output, SchemaIssues>`.
 *
 * @example
 * ```ts
 * import { fromSchema } from "@unthrown/standard-schema";
 * const parse = fromSchema(z.string());
 * parse("hi").unwrap(); // "hi"
 * parse(42).unwrapErr(); // the issues array
 * ```
 */
export function fromSchema<S extends StandardSchemaV1>(
  schema: S,
): (input: unknown) => Result<StandardSchemaV1.InferOutput<S>, SchemaIssues> {
  return (input) => {
    const result = schema["~standard"].validate(input);
    if (result instanceof Promise) {
      throw new TypeError(
        "@unthrown/standard-schema: this schema validates asynchronously — use fromSchemaAsync instead.",
      );
    }
    return result.issues ? err(result.issues) : ok(result.value);
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
      result.issues ? err(result.issues) : ok(result.value),
    );
}
