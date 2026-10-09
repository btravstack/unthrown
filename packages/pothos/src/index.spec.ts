import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import { graphql } from "graphql";
import {
  Err,
  ErrAsync,
  Ok,
  OkAsync,
  TaggedError,
  fromSafePromise,
  type AsyncResult,
} from "unthrown";
import { describe, expect, it } from "vitest";

import UnthrownPlugin, { outcomeOf } from "./index.js";

class Missing extends TaggedError("Missing")<{ readonly title: string }> {}

// A `code`-discriminated failure, as an oRPC client answers a declared error.
type Locked = { readonly code: "LOCKED"; readonly until: string };

class NotFoundError extends Error {
  override name = "NotFoundError";

  constructor(failure: Missing) {
    super(`No book titled ${failure.title}`);
  }
}

class ClosedError extends Error {
  override name = "ClosedError";

  constructor(failure: Locked) {
    super(`Closed until ${failure.until}`);
  }
}

type Book = { readonly title: string };

const find = (title: string): AsyncResult<Book, Missing | Locked> => {
  if (title === "draft") {
    return ErrAsync({ code: "LOCKED", until: "2027-01-01" });
  }
  if (title === "torn") {
    return fromSafePromise(Promise.reject(new Error("Disk failure")));
  }
  return title === "ghost" ? ErrAsync(new Missing({ title })) : OkAsync({ title });
};

const builder = new SchemaBuilder<{ Objects: { Book: Book } }>({
  plugins: [ErrorsPlugin, UnthrownPlugin],
  errors: { directResult: true },
});
const Failure = builder.interfaceRef<Error>("Failure").implement({
  fields: (t) => ({ message: t.exposeString("message") }),
});
builder.objectType(NotFoundError, { name: "NotFound", interfaces: [Failure] });
builder.objectType(ClosedError, { name: "Closed", interfaces: [Failure] });
builder.objectType("Book", { fields: (t) => ({ title: t.exposeString("title") }) });
builder.queryType({
  fields: (t) => ({
    book: t.resultField({
      type: "Book",
      args: { title: t.arg.string({ required: true }) },
      refusals: { Missing: NotFoundError, LOCKED: ClosedError },
      resolve: (_root, { title }) => find(title),
    }),
    shelf: t.resultField({
      type: "Book",
      refusals: {},
      resolve: () => Ok({ title: "Shelf" }),
    }),
  }),
});
const schema = builder.toSchema();

const bookTitled = async (title: string) =>
  graphql({
    schema,
    source: `{ book(title: "${title}") { __typename ... on Book { title } ... on Failure { message } } }`,
  });

describe("resultField", () => {
  it("answers the value of an Ok", async () => {
    expect(await bookTitled("Dune")).toEqual({
      data: { book: { __typename: "Book", title: "Dune" } },
    });
  });

  it("answers a TaggedError as the refusal its tag maps to", async () => {
    expect(await bookTitled("ghost")).toEqual({
      data: { book: { __typename: "NotFound", message: "No book titled ghost" } },
    });
  });

  it("answers a code-discriminated failure as the refusal its code maps to", async () => {
    expect(await bookTitled("draft")).toEqual({
      data: { book: { __typename: "Closed", message: "Closed until 2027-01-01" } },
    });
  });

  it("leaves a Defect to GraphQL as an error", async () => {
    const answer = await bookTitled("torn");

    expect(answer.errors?.map(({ message }) => message)).toEqual(["Disk failure"]);
  });

  it("takes a synchronous Result", async () => {
    expect(await graphql({ schema, source: "{ shelf { ... on Book { title } } }" })).toEqual({
      data: { shelf: { title: "Shelf" } },
    });
  });
});

describe("outcomeOf", () => {
  it("answers the value of an Ok", async () => {
    expect(await outcomeOf(Ok("found"), {})).toBe("found");
  });

  it("answers the refusal a failure maps to", async () => {
    expect(
      await outcomeOf(Err(new Missing({ title: "ghost" })), { Missing: NotFoundError }),
    ).toEqual(new NotFoundError(new Missing({ title: "ghost" })));
  });

  it("answers a Defect as its Error, without rejecting", async () => {
    const torn = fromSafePromise(Promise.reject(new Error("Disk failure")));

    expect(await outcomeOf(torn, {})).toEqual(new Error("Disk failure"));
  });

  it("wraps a Defect whose cause is no Error", async () => {
    const torn = fromSafePromise(Promise.reject("disk failure"));

    expect(await outcomeOf(torn, {})).toEqual(new Error("Defect", { cause: "disk failure" }));
  });

  it("answers a failure no refusal maps as a defect", async () => {
    // Only an unchecked cast can leave a case unmapped; the refusals record is exhaustive otherwise.
    const outcome = await outcomeOf(Err(new Missing({ title: "ghost" })), {} as never);

    expect(outcome).toBeInstanceOf(Error);
  });

  it("answers a failure naming no case as a defect", async () => {
    const outcome = await outcomeOf(Err({ reason: "unnamed" }), {} as never);

    expect(outcome).toBeInstanceOf(Error);
  });
});
