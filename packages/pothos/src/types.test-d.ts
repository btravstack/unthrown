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

const builder = new SchemaBuilder<{ Objects: { Book: { readonly title: string } } }>({
  plugins: [ErrorsPlugin, RelayPlugin, UnthrownPlugin],
  relay: {},
});

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

export type _Assertions = [
  OptionalTagAddsItsCase,
  NumericTagFallsBackToCode,
  CaseIsTagOrCode,
  UnnamedHasNoCase,
  RefusalsAreKeyedByCase,
];
