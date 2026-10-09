// The failure-to-GraphQL-error mapping every `@unthrown/pothos` field shares:
// the `Refusals` record a field declares, and the two ways a `Result` is
// handed to Pothos — `settle` for a resolver, `outcomeOf` for a DataLoader.

import { fromSafePromise, fromSafeThrowable, Ok, type AsyncResult, type Result } from "unthrown";

/**
 * The name of a failure's case: its `_tag` (a `TaggedError`), else its `code`
 * (an `ORPCError`, or any `code`-discriminated object). A failure with
 * neither has no case, so it cannot be refused — it stays a type error at the
 * field that would have to map it.
 */
export type CaseOf<Failure> = Failure extends { readonly _tag: infer Tag extends string }
  ? Tag
  : Failure extends { readonly code: infer Code extends string }
    ? // An optional string `_tag` names the case whenever it is present.
      ("_tag" extends keyof Failure ? Extract<Failure["_tag"], string> : never) | Code
    : never;

/**
 * A failure that names its case: a string `_tag`, or a string `code`. Every
 * member of a field's failure must be one — a member naming no case would leave
 * no refusal to answer it — so a field's resolver answers `Failure & Caseable`,
 * and a failure with any other member does not compile.
 */
export type Caseable = { readonly _tag: string } | { readonly code: string };

// The members of `Failure` that can name `Case` — every member whose cases
// include it, so a union-valued discriminant (`code: "A" | "B"`) keeps its type.
type FailureOf<Failure, Case> = Failure extends unknown
  ? Case extends CaseOf<Failure>
    ? Failure
    : never
  : never;

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

// The case a failure names, as `CaseOf` reads it: a string `_tag`, else a string `code`.
const caseOf = (failure: unknown): string | undefined => {
  if (typeof failure !== "object" || failure === null) {
    return undefined;
  }
  if ("_tag" in failure && typeof failure._tag === "string") {
    return failure._tag;
  }
  return "code" in failure && typeof failure.code === "string" ? failure.code : undefined;
};

/**
 * The classes `@pothos/plugin-errors` answers on a field: its refusals, and the
 * plugin's `defaultTypes`.
 */
export const handledTypes = <Failure>(
  refusals: Refusals<Failure>,
  defaultTypes: readonly (new (...args: never[]) => unknown)[] | undefined,
): readonly (new (...args: never[]) => unknown)[] => [
  ...typesOf(refusals),
  ...(defaultTypes ?? []),
];

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
    const Refusal = (
      refusals as unknown as Readonly<Record<string, new (failure: Failure) => Error>>
    )[caseOf(settled.error) ?? ""];
    if (Refusal !== undefined) {
      const { error } = settled;
      // A refusal constructor that throws is a bug: it is answered as a defect, never a rejection.
      return fromSafeThrowable(() => new Refusal(error))()
        .recoverDefect((cause) => Ok(defectOf(cause)))
        .get();
    }
  }
  return defectOf(settled.isDefect() ? settled.cause : settled);
};

const defectOf = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error("Defect", { cause });

/**
 * A defect no class of the errors plugin can claim. When even a plain `Error`
 * would be claimed (`defaultTypes: [Error]`), it travels as this signal, which
 * GraphQL turns into an error of its own and masks.
 */
class DefectSignal {
  readonly message = "Defect";

  constructor(readonly cause: unknown) {}
}

const unclaimed = (
  cause: unknown,
  handled: readonly (new (...args: never[]) => unknown)[],
): unknown => {
  const claimedBy = (value: unknown) => handled.some((Handled) => value instanceof Handled);
  if (!claimedBy(cause)) {
    return cause;
  }
  const wrapped = new Error("Defect", { cause });
  return claimedBy(wrapped) ? new DefectSignal(cause) : wrapped;
};

/**
 * A resolver called for its `Result`: a synchronous throw becomes a `Defect`,
 * so it is settled like any other and never reaches the errors plugin raw.
 */
export const attempt = <Value, Failure>(
  resolve: () => Result<Value, Failure> | AsyncResult<Value, Failure>,
): AsyncResult<Value, Failure> =>
  // Called inside a promise: a throw becomes its rejection, and an `AsyncResult`
  // settles to its `Result`; `fromSafeThrowable` refuses a thenable-returning function.
  fromSafePromise(Promise.resolve().then(resolve)).flatMap((result) => result);

/**
 * A `Result` as a resolver answers it: the value, or the refusal its failure
 * maps to — returned, not thrown, because `@pothos/plugin-errors` answers a
 * returned error of a declared type as its union member. A `Defect` is a bug:
 * its cause is rethrown, so GraphQL masks it. A cause that is an instance of
 * one of the `handled` classes (the field's error types, the errors plugin's
 * `defaultTypes`) is wrapped first, so the plugin never answers a bug as a
 * modeled refusal.
 */
export const settle = async <Value, Failure>(
  result: Result<Value, Failure> | AsyncResult<Value, Failure>,
  refusals: Refusals<Failure>,
  handled: readonly (new (...args: never[]) => unknown)[] = typesOf(refusals),
): Promise<Value | Error> => {
  const settled = await result;
  if (settled.isDefect()) {
    const { cause } = settled;
    // The elimination edge: a defect reaches GraphQL as a thrown error, which masks it.
    throw unclaimed(cause, handled);
  }
  return outcomeOf(settled, refusals);
};
