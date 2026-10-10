// The failure-to-GraphQL-error mapping every `@unthrown/pothos` field shares:
// the `Refusals` record a field declares, `resultConfig`, which turns a field's
// options into what Pothos takes, and `outcomeOf`, what a DataLoader answers.

import { fromSafePromise, fromSafeThrowable, Ok, type AsyncResult, type Result } from "unthrown";

/**
 * The name of a failure's case: its `_tag` (a `TaggedError`), else its `code`
 * (an `ORPCError`, or any `code`-discriminated object). An optional string
 * `_tag` beside a `code` names the case whenever it is present, so both count;
 * a tag that may hold any string (`unknown`, `string`) makes the cases
 * non-finite, which `Refusals` refuses.
 */
export type CaseOf<Failure> = Failure extends { readonly _tag: infer Tag extends string }
  ? Tag
  : Failure extends { readonly code: infer Code extends string }
    ?
        | ("_tag" extends keyof Failure
            ? string extends Failure["_tag"]
              ? string
              : Extract<Failure["_tag"], string>
            : never)
        | Code
    : never;

/**
 * A failure that names its case: a string `_tag`, or a string `code`. A field's
 * resolver (and `outcomeOf`) answers `Failure & Caseable`, so a failure with a
 * member naming no case does not compile — no refusal could answer it.
 */
export type Caseable = { readonly _tag: string } | { readonly code: string };

// The members of `Failure` that can name `Case` — every member whose cases
// include it, so a union-valued discriminant (`code: "A" | "B"`) keeps its type.
type FailureOf<Failure, Case> = Failure extends unknown
  ? Case extends CaseOf<Failure>
    ? Failure
    : never
  : never;

// The cases that are patterns rather than literals (`string`, `` `E_${string}` ``),
// each tested on its own: a literal beside a pattern makes a record look finite.
type NonFiniteOf<Case extends PropertyKey> = Case extends unknown
  ? // oxlint-disable-next-line typescript/no-empty-object-type -- `{}` tests whether one case forms an index signature
    {} extends Record<Case, unknown>
    ? Case
    : never
  : never;

/**
 * One GraphQL error class per case of `Failure`, each constructed from the
 * failure of that case. It is exhaustive by construction: a missing case, an
 * extra one, or a class built from another case's failure does not compile —
 * the same guarantee the error combinators' matcher gives, keyed by the case
 * the failure names. A resolver that cannot fail takes an empty record, and a
 * failure whose cases cannot be enumerated takes none at all.
 *
 * The extra-case check is TypeScript's excess-property check, which holds for
 * an object literal: write the record inline, or declare it apart with
 * `satisfies Refusals<Failure>`.
 *
 * The classes are the field's error types for `@pothos/plugin-errors`, so each
 * must be registered as an object type (`builder.objectType(NotFoundError, …)`).
 */
export type Refusals<Failure> = [Failure] extends [never]
  ? { readonly [name: string]: never }
  : [CaseOf<Failure>] extends [never]
    ? // No case yet: a failure still being inferred from a context-sensitive `resolve`.
      { readonly [Case in CaseOf<Failure>]: never }
    : [NonFiniteOf<CaseOf<Failure>>] extends [never]
      ? {
          readonly [Case in CaseOf<Failure>]: new (failure: FailureOf<Failure, Case>) => Error;
        }
      : { readonly "every failure needs a literal _tag or code": never };

type ErrorClass = new (...args: never[]) => unknown;

const typesOf = <Failure>(refusals: Refusals<Failure>): ErrorClass[] =>
  Object.values(refusals as Readonly<Record<string, ErrorClass>>);

// The case a failure names, as `CaseOf` reads it: a string `_tag`, else a string
// `code`. A callable object may carry a case too.
const caseOf = (failure: unknown): string | undefined => {
  if ((typeof failure !== "object" && typeof failure !== "function") || failure === null) {
    return undefined;
  }
  // Each discriminant is read once: a getter may answer differently on a second read.
  const tag = "_tag" in failure ? failure._tag : undefined;
  if (typeof tag === "string") {
    return tag;
  }
  const code = "code" in failure ? failure.code : undefined;
  return typeof code === "string" ? code : undefined;
};

// The refusal class a case maps to, read as an own property only.
const refusalFor = <Failure>(
  refusals: Refusals<Failure>,
  name: string | undefined,
): (new (failure: Failure) => Error) | undefined =>
  name !== undefined && Object.hasOwn(refusals, name)
    ? (refusals as unknown as Readonly<Record<string, new (failure: Failure) => Error>>)[name]
    : undefined;

// `instanceof` can throw (a proxy's `getPrototypeOf`, a `Symbol.hasInstance`);
// such a value counts as the answer that keeps it a defect.
const safely = (test: () => boolean, onThrow: boolean): boolean =>
  fromSafeThrowable(test)()
    .recoverDefect(() => Ok(onThrow))
    .get();

const isError = (value: unknown): value is Error => safely(() => value instanceof Error, false);

const claimedBy = (handled: readonly ErrorClass[], value: unknown): boolean =>
  safely(() => handled.some((Type) => value instanceof Type), true);

type Answer<Value> =
  | { readonly kind: "value"; readonly value: Value }
  | { readonly kind: "refusal"; readonly refusal: Error }
  | { readonly kind: "defect"; readonly cause: unknown };

// What a settled `Result` answers. A returned `Error` is what the errors plugin
// takes for a refusal, so as a value it is a defect, whatever its static type
// let through. Reading the case (a getter may throw) and building the refusal
// are one guarded step: a throw there is a defect, and so is a failure no
// refusal maps, which only an unchecked cast can produce.
const answerOf = <Value, Failure>(
  settled: Result<Value, Failure>,
  refusals: Refusals<Failure>,
): Answer<Value> => {
  if (settled.isOk()) {
    const { value } = settled;
    return isError(value) ? { kind: "defect", cause: value } : { kind: "value", value };
  }
  if (settled.isDefect()) {
    return { kind: "defect", cause: settled.cause };
  }
  const { error } = settled;
  return fromSafeThrowable((): Answer<Value> => {
    const Refusal = refusalFor(refusals, caseOf(error));
    if (Refusal === undefined) {
      return { kind: "defect", cause: error };
    }
    const refusal = new Refusal(error);
    // A constructor that answers anything but an `Error` of its own class (a
    // structural look-alike, a base `Error`) builds nothing the plugin can place.
    return refusal instanceof Refusal && refusal instanceof Error
      ? { kind: "refusal", refusal }
      : { kind: "defect", cause: refusal };
  })()
    .recoverDefect((cause) => Ok<Answer<Value>>({ kind: "defect", cause }))
    .get();
};

/**
 * A `Result` as a DataLoader answers one key: the value, or the refusal its
 * failure maps to. A `Defect` is returned as an `Error`, never thrown, so one
 * key's bug does not reject the batch — wrapped (`new Error("Defect", { cause })`)
 * when one of the field's refusals or the builder's `defaultTypes` would claim
 * it. Pass the builder's `defaultTypes`: a loader can only reject a key with an
 * `Error`, so a base `Error` among them claims every defect a loader reports.
 */
export const outcomeOf = async <Value, Failure>(
  result: Result<Value, Failure & Caseable> | AsyncResult<Value, Failure & Caseable>,
  refusals: Refusals<Failure>,
  defaultTypes: readonly ErrorClass[] = [],
): Promise<Value | Error> => {
  const answer = answerOf(await result, refusals);
  if (answer.kind === "defect") {
    const { cause } = answer;
    // Listing the handled classes reads the record, whose getters may throw: guarded too.
    const claimed = safely(() => claimedBy([...typesOf(refusals), ...defaultTypes], cause), true);
    return isError(cause) && !claimed ? cause : new Error("Defect", { cause });
  }
  return answer.kind === "value" ? answer.value : answer.refusal;
};

// A defect thrown so no handled class claims it: as it is, else wrapped in an
// `Error`, else — when even that would be claimed (`defaultTypes: [Error]`) — as
// a plain object, which GraphQL turns into an error of its own. A `GraphQLError`
// cause is rethrown as it is: GraphQL's own signal for an error meant for the
// client, which a server shows rather than masks.
const unclaimed = (cause: unknown, handled: readonly ErrorClass[]): unknown => {
  if (!claimedBy(handled, cause)) {
    return cause;
  }
  const wrapped = new Error("Defect", { cause });
  return claimedBy(handled, wrapped) ? { message: "Defect", cause } : wrapped;
};

// A field's `Result` as a resolver answers it: the value, or the refusal —
// returned, not thrown, since the errors plugin answers a returned error of a
// declared type as its union member. The resolver is called inside a promise,
// so a synchronous throw becomes a `Defect` too, and a `Defect` is thrown
// unclaimed: an error of the operation for the server to mask.
const settle = async <Value, Failure>(
  resolve: () => Result<Value, Failure> | AsyncResult<Value, Failure>,
  refusals: Refusals<Failure>,
  handled: readonly ErrorClass[],
): Promise<Value | Error> => {
  // `fromSafeThrowable` refuses a thenable-returning function, and an `AsyncResult` is one.
  const settled = await fromSafePromise(Promise.resolve().then(resolve)).flatMap(
    (result) => result,
  );
  const answer = answerOf(settled, refusals);
  if (answer.kind === "defect") {
    // The elimination edge: a defect reaches GraphQL as a thrown error.
    throw unclaimed(answer.cause, handled);
  }
  return answer.kind === "value" ? answer.value : answer.refusal;
};

type ResultOptions = {
  readonly refusals: Refusals<Caseable>;
  readonly resolve: (
    ...args: readonly [unknown, never, never, unknown]
  ) => Result<unknown, Caseable> | AsyncResult<unknown, Caseable>;
  readonly errors?: object;
};

/**
 * A result field's options as Pothos' `field` (or relay's `connection`) takes
 * them: the errors plugin's options with the refusals as `types`, and a
 * resolver that settles the `Result`. A field that cannot fail, with no errors
 * options of its own and no `defaultTypes` on the builder, stays a plain field
 * rather than a one-member union.
 */
export const resultConfig = (
  defaultTypes: readonly ErrorClass[] | undefined,
  fieldOptions: object,
  inheritedErrors?: { readonly types?: readonly ErrorClass[] },
): object => {
  const { refusals, resolve, errors, ...options } = fieldOptions as ResultOptions;
  // Errors options a field inherits (relay's default connection field options)
  // are merged, not replaced: their types are handled too.
  const types = [...(inheritedErrors?.types ?? []), ...typesOf(refusals)];
  const handled = [...types, ...(defaultTypes ?? [])];
  const plain = handled.length === 0 && errors === undefined && inheritedErrors === undefined;
  return {
    ...options,
    ...(plain ? {} : { errors: { ...inheritedErrors, ...errors, types } }),
    resolve: async (parent: unknown, args: never, context: never, info: unknown) =>
      settle(() => resolve(parent, args, context, info), refusals, handled),
  };
};
