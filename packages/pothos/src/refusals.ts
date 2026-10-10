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
 * The extra-case check is TypeScript's excess-property check, which holds for
 * an object literal: write the record inline, or declare it apart with
 * `satisfies Refusals<Failure>`, which checks it the same way.
 *
 * The classes are the field's error types for `@pothos/plugin-errors`, so each
 * must be registered as an object type (`builder.objectType(NotFoundError, …)`).
 */
export type Refusals<Failure> = [Failure] extends [never]
  ? // A resolver that cannot fail has no case to refuse: the record must stay empty.
    { readonly [name: string]: never }
  : [CaseOf<Failure>] extends [never]
    ? // No case named yet (a failure still being inferred, or one `resolve` refuses).
      { readonly [Case in CaseOf<Failure>]: never }
    : // oxlint-disable-next-line typescript/no-empty-object-type -- `{}` tests whether the cases form an index signature
      {} extends Record<CaseOf<Failure>, unknown>
      ? // A non-finite case (`code: string`, `` code: `E_${string}` ``) cannot be enumerated.
        { readonly "every failure needs a literal _tag or code": CaseOf<Failure> }
      : "__proto__" extends CaseOf<Failure>
        ? // An object literal's `__proto__` sets its prototype: it can name no refusal.
          { readonly "__proto__ cannot name a refusal": never }
        : {
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

type Handled = readonly (new (...args: never[]) => unknown)[];

type Answer<Value> =
  | { readonly kind: "value"; readonly value: Value }
  | { readonly kind: "refusal"; readonly refusal: Error }
  | { readonly kind: "defect"; readonly cause: unknown };

// The refusal class a case maps to, read as an own property only.
const refusalFor = <Failure>(
  refusals: Refusals<Failure>,
  name: string | undefined,
): (new (failure: Failure) => Error) | undefined =>
  name !== undefined && Object.hasOwn(refusals, name)
    ? (refusals as unknown as Readonly<Record<string, new (failure: Failure) => Error>>)[name]
    : undefined;

// What a settled `Result` answers: its value, its refusal, or a defect. A refusal
// constructor that throws is a bug, so it answers a defect too; and a failure no
// refusal maps, which only an unchecked cast can produce.
const answerOf = <Value, Failure>(
  settled: Result<Value, Failure>,
  refusals: Refusals<Failure>,
): Answer<Value> => {
  if (settled.isOk()) {
    return { kind: "value", value: settled.value };
  }
  if (settled.isDefect()) {
    return { kind: "defect", cause: settled.cause };
  }
  const { error } = settled;
  // Reading the case (a getter may throw) and building the refusal are both guarded.
  return fromSafeThrowable(() => refusalFor(refusals, caseOf(error)))()
    .flatMap((Refusal) =>
      Refusal === undefined
        ? Ok<Answer<Value>>({ kind: "defect", cause: settled })
        : fromSafeThrowable(() => new Refusal(error))().map((refusal): Answer<Value> => ({
            kind: "refusal",
            refusal,
          })),
    )
    .recoverDefect((cause) => Ok<Answer<Value>>({ kind: "defect", cause }))
    .get();
};

const claimedBy = (handled: Handled, value: unknown): boolean =>
  handled.some((Type) => value instanceof Type);

/**
 * A `Result` as a DataLoader answers one key: the value, or the refusal its
 * failure maps to. A `Defect` — a refusal constructor that throws included —
 * is returned as an `Error`, never thrown, so one key's bug does not reject
 * the batch. Its cause is returned as it is unless one of the `handled` classes
 * would claim it, in which case it is wrapped (`new Error("Defect", { cause })`).
 * A loader can only reject a key with an `Error`, so a base `Error` among the
 * errors plugin's `defaultTypes` claims every defect a loader reports.
 */
export const outcomeOf = async <Value, Failure>(
  result: Result<Value, Failure> | AsyncResult<Value, Failure>,
  refusals: Refusals<Failure>,
  handled: Handled = typesOf(refusals),
): Promise<Value | Error> => {
  const answer = answerOf(await result, refusals);
  if (answer.kind === "defect") {
    const { cause } = answer;
    return cause instanceof Error && !claimedBy(handled, cause)
      ? cause
      : new Error("Defect", { cause });
  }
  return answer.kind === "value" ? answer.value : answer.refusal;
};

/**
 * A defect no class of the errors plugin can claim. When even a plain `Error`
 * would be claimed (`defaultTypes: [Error]`), it travels as this signal, which
 * GraphQL turns into an error of its own.
 */
class DefectSignal {
  readonly message = "Defect";

  constructor(readonly cause: unknown) {}
}

const unclaimed = (cause: unknown, handled: Handled): unknown => {
  if (!claimedBy(handled, cause)) {
    return cause;
  }
  const wrapped = new Error("Defect", { cause });
  return claimedBy(handled, wrapped) ? new DefectSignal(cause) : wrapped;
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
 * returned error of a declared type as its union member. A `Defect` — a refusal
 * constructor that throws included — is a bug: it is thrown, never claimed by
 * one of the `handled` classes (the field's error types, the errors plugin's
 * `defaultTypes`), so it stays an error of the operation for the server to mask
 * (GraphQL Yoga masks by default; graphql-js alone does not).
 */
export const settle = async <Value, Failure>(
  result: Result<Value, Failure> | AsyncResult<Value, Failure>,
  refusals: Refusals<Failure>,
  handled: Handled = typesOf(refusals),
): Promise<Value | Error> => {
  const answer = answerOf(await result, refusals);
  if (answer.kind === "defect") {
    // The elimination edge: a defect reaches GraphQL as a thrown error.
    throw unclaimed(answer.cause, handled);
  }
  return answer.kind === "value" ? answer.value : answer.refusal;
};
