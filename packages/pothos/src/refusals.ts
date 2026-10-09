// The failure-to-GraphQL-error mapping every `@unthrown/pothos` field shares:
// the `Refusals` record a field declares, and the two ways a `Result` is
// handed to Pothos — `settle` for a resolver, `outcomeOf` for a DataLoader.

import type { AsyncResult, Result } from "unthrown";

/**
 * The name of a failure's case: its `_tag` (a `TaggedError`), else its `code`
 * (an `ORPCError`, or any `code`-discriminated object). A failure with
 * neither has no case, so it cannot be refused — it stays a type error at the
 * field that would have to map it.
 */
export type CaseOf<Failure> = Failure extends { readonly _tag: infer Tag extends string }
  ? Tag
  : Failure extends { readonly code: infer Code extends string }
    ? Code
    : never;

type FailureOf<Failure, Case> = Extract<Failure, { readonly _tag: Case } | { readonly code: Case }>;

/**
 * One GraphQL error class per case of `Failure`, each constructed from the
 * failure of that case. It is exhaustive by construction: a missing case, an
 * extra one, or a class built from another case's failure does not compile —
 * the same guarantee the error combinators' matcher gives, keyed by the case
 * the failure names.
 *
 * The classes are the field's error types for `@pothos/plugin-errors`, so each
 * must be registered as an object type (`builder.objectType(NotFoundError, …)`).
 */
export type Refusals<Failure> = {
  readonly [Case in CaseOf<Failure>]: new (failure: FailureOf<Failure, Case>) => Error;
};

type ErrorClass = new (...args: never[]) => Error;

/**
 * The GraphQL error types a field answers — one per refusal, each once — as
 * `@pothos/plugin-errors`' `errors.types` takes them.
 */
export const typesOf = <Failure>(refusals: Refusals<Failure>): ErrorClass[] => [
  ...new Set(Object.values(refusals as Readonly<Record<string, ErrorClass>>)),
];

const caseOf = (failure: object): string | undefined => {
  if ("_tag" in failure) {
    return String(failure._tag);
  }
  return "code" in failure ? String(failure.code) : undefined;
};

/**
 * A `Result` as a DataLoader answers one key: the value, or the refusal its
 * failure maps to. A `Defect` — and a failure no refusal maps, which only an
 * unchecked cast can produce — stays an `Error`, which GraphQL masks; it is
 * returned rather than thrown, so one key's bug does not reject the batch.
 */
export const outcomeOf = async <Value, Failure>(
  result: Result<Value, Failure> | AsyncResult<Value, Failure>,
  refusals: Refusals<Failure>,
): Promise<Value | Error> => {
  const settled = await result;
  if (settled.isOk()) {
    return settled.value;
  }
  if (settled.isErr()) {
    const Refusal = (refusals as Readonly<Record<string, new (failure: Failure) => Error>>)[
      caseOf(settled.error as object) ?? ""
    ];
    if (Refusal !== undefined) {
      return new Refusal(settled.error);
    }
  }
  const cause = settled.isDefect() ? settled.cause : settled;
  return cause instanceof Error ? cause : new Error("Defect", { cause });
};

/**
 * A `Result` as a resolver answers it: the value, or the refusal its failure
 * maps to — returned, not thrown, because `@pothos/plugin-errors` answers a
 * returned error of a declared type as its union member. A `Defect` is a bug:
 * its cause is rethrown, so GraphQL masks it.
 */
export const settle = async <Value, Failure>(
  result: Result<Value, Failure> | AsyncResult<Value, Failure>,
  refusals: Refusals<Failure>,
): Promise<Value | Error> => {
  const settled = await result;
  if (settled.isDefect()) {
    // The elimination edge: a defect reaches GraphQL as a thrown error, which masks it.
    throw settled.cause;
  }
  return outcomeOf(settled, refusals);
};
