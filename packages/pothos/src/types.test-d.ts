// Type-level tests, checked by the package's regular `tsc --noEmit` (the file
// has no runtime — nothing imports it). They guard the claim the package is
// built on: a field's refusals are exhaustive over its resolver's failure —
// one class per case, keyed by `_tag` or `code`, each built from that case's
// failure. Assertions accumulate in the exported `_Assertions` tuple (so
// nothing is an unused local); `@ts-expect-error` guards the cases that must
// NOT compile.

import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import RelayPlugin from "@pothos/plugin-relay";
import { ErrAsync, OkAsync, TaggedError, type AsyncResult } from "unthrown";

import UnthrownPlugin, { type CaseOf, type Refusals } from "./index.js";
import "./relay.js";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

class Missing extends TaggedError("Missing") {}

type Locked = { readonly code: "LOCKED"; readonly until: string };

class NotFoundError extends Error {
  constructor(_failure: Missing) {
    super("Not found");
  }
}

class ClosedError extends Error {
  constructor(failure: Locked) {
    super(failure.until);
  }
}

declare const find: () => AsyncResult<{ readonly title: string }, Missing | Locked>;

class LockedError extends Error {
  constructor(failure: { readonly code: "LOCKED" }) {
    super(failure.code);
  }
}

declare const findOptionalTag: () => AsyncResult<
  { readonly title: string },
  { readonly _tag?: "Draft"; readonly code: "LOCKED" }
>;

type Split = { readonly code: "LOST" | "BURNT"; readonly shelf: string };

class SplitError extends Error {
  constructor(failure: Split) {
    super(failure.shelf);
  }
}

declare const findSplit: () => AsyncResult<{ readonly title: string }, Split>;

declare const findWidened: () => AsyncResult<{ readonly title: string }, { readonly code: string }>;

declare const findProto: () => AsyncResult<
  { readonly title: string },
  { readonly code: "__proto__" }
>;

class AnyError extends Error {
  constructor(_failure: { readonly code: string }) {
    super("any");
  }
}

declare const findTemplated: () => AsyncResult<
  { readonly title: string },
  { readonly code: `E_${string}` }
>;

declare const findAlways: () => AsyncResult<{ readonly title: string }, never>;

declare const findBroadTag: () => AsyncResult<
  { readonly title: string },
  { readonly _tag: unknown; readonly code: "LOCKED" }
>;

class RejectionError extends Error {}

declare const pairGenerator: Generator<number>;

declare const findMixed: () => AsyncResult<
  { readonly title: string },
  Missing | { readonly code: `E_${string}` }
>;

declare const findOrUnnamed: () => AsyncResult<
  { readonly title: string },
  Missing | { readonly reason: string }
>;

// --- a failure names its case by `_tag`, else by `code` ------------------------

type OptionalTagAddsItsCase = Expect<
  Equal<CaseOf<{ readonly _tag?: "Draft"; readonly code: "LOCKED" }>, "Draft" | "LOCKED">
>;
type NumericTagFallsBackToCode = Expect<
  Equal<CaseOf<{ readonly _tag: 7; readonly code: "LOCKED" }>, "LOCKED">
>;
type CaseIsTagOrCode = Expect<Equal<CaseOf<Missing | Locked>, "Missing" | "LOCKED">>;
type UnnamedHasNoCase = Expect<Equal<CaseOf<{ readonly reason: string }>, never>>;
type RefusalsAreKeyedByCase = Expect<Equal<keyof Refusals<Missing | Locked>, "Missing" | "LOCKED">>;

// --- a field's refusals are exhaustive over its resolver's failure -------------

type Pair = readonly [number, number];

const builder = new SchemaBuilder<{
  Objects: { Book: { readonly title: string } };
  Scalars: { Pair: { Input: Pair; Output: Pair } };
}>({
  plugins: [ErrorsPlugin, RelayPlugin, UnthrownPlugin],
  relay: {},
});

const Rejection = builder.objectRef<RejectionError>("Rejection");

builder.scalarType("Pair", { serialize: (pair) => pair, parseValue: () => [0, 0] });

builder.queryFields((t) => ({
  every: t.resultField({
    type: "Book",
    refusals: { Missing: NotFoundError, LOCKED: ClosedError },
    resolve: find,
  }),
  missingCase: t.resultField({
    type: "Book",
    // @ts-expect-error -- LOCKED has no refusal
    refusals: { Missing: NotFoundError },
    resolve: find,
  }),
  extraCase: t.resultField({
    type: "Book",
    // @ts-expect-error -- no failure is a Torn
    refusals: { Missing: NotFoundError, LOCKED: ClosedError, Torn: ClosedError },
    resolve: find,
  }),
  otherCase: t.resultField({
    type: "Book",
    // @ts-expect-error -- ClosedError is built from a Locked, not a Missing
    refusals: { Missing: ClosedError, LOCKED: ClosedError },
    resolve: find,
  }),
  wrongValue: t.resultField({
    type: "Book",
    refusals: {},
    // @ts-expect-error -- the Ok value is the field's shape
    resolve: () => OkAsync({ pages: 3 }),
  }),
  primitive: t.resultField({
    type: "Book",
    refusals: {},
    // @ts-expect-error -- a string failure names no case
    resolve: () => ErrAsync("not_found"),
  }),
  unnamedMember: t.resultField({
    type: "Book",
    refusals: { Missing: NotFoundError },
    // @ts-expect-error -- one member of the failure names no case
    resolve: findOrUnnamed,
  }),
  optionalTag: t.resultField({
    type: "Book",
    refusals: { Draft: LockedError, LOCKED: LockedError },
    resolve: findOptionalTag,
  }),
  optionalTagCodeOnly: t.resultField({
    type: "Book",
    // @ts-expect-error -- the optional _tag names the Draft case whenever it is present
    refusals: { LOCKED: LockedError },
    resolve: findOptionalTag,
  }),
  split: t.resultField({
    type: "Book",
    refusals: { LOST: SplitError, BURNT: SplitError },
    resolve: findSplit,
  }),
  splitMismatch: t.resultField({
    type: "Book",
    // @ts-expect-error -- NotFoundError is built from a Missing, not a Split
    refusals: { LOST: NotFoundError, BURNT: SplitError },
    resolve: findSplit,
  }),
  widened: t.resultField({
    type: "Book",
    // @ts-expect-error -- a widened code has no cases to enumerate
    refusals: {},
    resolve: findWidened,
  }),
  proto: t.resultField({
    type: "Book",
    // @ts-expect-error -- __proto__ sets an object literal's prototype, so it can name no refusal
    refusals: { ["__proto__"]: AnyError },
    resolve: findProto,
  }),
  templated: t.resultField({
    type: "Book",
    // @ts-expect-error -- a template-literal code has no finite cases to enumerate
    refusals: {},
    resolve: findTemplated,
  }),
  neverFails: t.resultField({
    type: "Book",
    refusals: {},
    resolve: findAlways,
  }),
  neverFailsExtra: t.resultField({
    type: "Book",
    // @ts-expect-error -- a resolver that cannot fail has no case to refuse
    refusals: { Missing: NotFoundError },
    resolve: findAlways,
  }),
  counted: t.resultConnection(
    {
      type: "Book",
      refusals: {},
      resolve: () =>
        OkAsync({
          edges: [],
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: null,
            endCursor: null,
          },
          totalCount: 0,
        }),
    },
    { fields: (c) => ({ totalCount: c.int({ resolve: (connection) => connection.totalCount }) }) },
  ),
  broadTag: t.resultField({
    type: "Book",
    // @ts-expect-error -- a tag that may hold any string makes the cases non-finite
    refusals: { LOCKED: LockedError },
    resolve: findBroadTag,
  }),
  mixed: t.resultField({
    type: "Book",
    // @ts-expect-error -- a pattern case beside a literal one still cannot be enumerated
    refusals: { Missing: NotFoundError },
    resolve: findMixed,
  }),
  pair: t.resultField({
    type: "Pair",
    refusals: {},
    resolve: () => OkAsync([1, 2] as const),
  }),
  pairFromGenerator: t.resultField({
    type: "Pair",
    refusals: {},
    // @ts-expect-error -- an array-shaped scalar is no GraphQL list: it takes its array
    resolve: () => OkAsync(pairGenerator),
  }),
  errorValued: t.resultField({
    type: Rejection,
    refusals: {},
    // @ts-expect-error -- an Error cannot be a field's value: the errors plugin would take it for a refusal
    resolve: () => OkAsync(new RejectionError()),
  }),
  nullableWithResultFields: t.resultField({
    type: "Book",
    nullable: true,
    errors: { dataField: { description: "The book" } },
    refusals: {},
    resolve: findAlways,
  }),
  nullableConnection: t.resultConnection({
    type: "Book",
    nullable: true,
    refusals: {},
    resolve: () => OkAsync(null),
  }),
  connection: t.resultConnection({
    type: "Book",
    // @ts-expect-error -- the connection's refusals are exhaustive too
    refusals: {},
    resolve: () => ErrAsync(new Missing()),
  }),
}));

// A connection's nullability defaults to the builder's: non-null here, so no `Ok(null)`.
const strictBuilder = new SchemaBuilder<{
  DefaultFieldNullability: false;
  Objects: { Book: { readonly title: string } };
}>({
  plugins: [ErrorsPlugin, RelayPlugin, UnthrownPlugin],
  relay: {},
  defaultFieldNullability: false,
});

strictBuilder.queryField("books", (t) =>
  t.resultConnection({
    type: "Book",
    refusals: {},
    // @ts-expect-error -- the builder's fields are non-null by default
    resolve: () => OkAsync(null),
  }),
);

// A record declared apart keeps the extra-case check with `satisfies`.
const declaredRefusals = {
  Missing: NotFoundError,
  LOCKED: ClosedError,
} satisfies Refusals<Missing | Locked>;
const declaredWithExtra = {
  Missing: NotFoundError,
  LOCKED: ClosedError,
  // @ts-expect-error -- no failure is a Torn
  Torn: ClosedError,
} satisfies Refusals<Missing | Locked>;

builder.queryField("declared", (t) =>
  t.resultField({ type: "Book", refusals: declaredRefusals, resolve: find }),
);

builder.subscriptionFields((t) => ({
  // @ts-expect-error -- resultField does not resolve subscription fields
  feed: t.resultField({ type: "Book", refusals: {}, resolve: findAlways }),
}));

export const _declared = [declaredWithExtra];

export type _Assertions = [
  OptionalTagAddsItsCase,
  NumericTagFallsBackToCode,
  CaseIsTagOrCode,
  UnnamedHasNoCase,
  RefusalsAreKeyedByCase,
];
