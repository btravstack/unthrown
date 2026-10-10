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

// A refusal whose constructor is a bug: it throws an error the errors plugin claims.
class ClaimedByDefaultError extends Error {
  constructor(_failure: Missing) {
    super("unreachable");
    throw new ClosedError({ code: "LOCKED", until: "2027-01-01" });
  }
}

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
  errors: { directResult: true, defaultTypes: [ClosedError] },
});
const Failure = builder.interfaceRef<Error>("Failure").implement({
  fields: (t) => ({ message: t.exposeString("message") }),
});
builder.objectType(NotFoundError, { name: "NotFound", interfaces: [Failure] });
builder.objectType(ClosedError, { name: "Closed", interfaces: [Failure] });
builder.objectType(ClaimedByDefaultError, { name: "ClaimedByDefault", interfaces: [Failure] });
builder.objectType("Book", { fields: (t) => ({ title: t.exposeString("title") }) });
builder.queryType({
  fields: (t) => ({
    book: t.resultField({
      type: "Book",
      args: { title: t.arg.string({ required: true }) },
      refusals: { Missing: NotFoundError, LOCKED: ClosedError },
      resolve: (_root, { title }) => find(title),
    }),
    // Defects whose cause the errors plugin would answer as a refusal: one of the
    // field's refusal classes, and one of the plugin's default types.
    misfiled: t.resultField({
      type: "Book",
      refusals: { Missing: NotFoundError },
      resolve: (): AsyncResult<Book, Missing> =>
        fromSafePromise(Promise.reject(new NotFoundError(new Missing({ title: "lost" })))),
    }),
    jammed: t.resultField({
      type: "Book",
      refusals: {},
      resolve: (): AsyncResult<Book, never> =>
        fromSafePromise(Promise.reject(new ClosedError({ code: "LOCKED", until: "2027-01-01" }))),
    }),
    thrown: t.resultField({
      type: "Book",
      refusals: { Missing: NotFoundError },
      resolve: (): AsyncResult<Book, Missing> => {
        throw new NotFoundError(new Missing({ title: "lost" }));
      },
    }),
    brokenRefusal: t.resultField({
      type: "Book",
      refusals: { Missing: ClaimedByDefaultError },
      resolve: () => find("ghost") as AsyncResult<Book, Missing>,
    }),
    catalogue: t.resultField({
      type: ["Book"],
      errors: { directResult: false },
      refusals: {},
      resolve: () =>
        Ok(
          (function* catalogue() {
            yield { title: "Dune" };
            yield { title: "Emma" };
          })(),
        ),
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

  it("keeps a Defect whose cause is one of its refusal classes out of the union", async () => {
    const answer = await graphql({ schema, source: "{ misfiled { __typename } }" });

    expect(answer).toEqual({
      data: { misfiled: null },
      errors: [expect.objectContaining({ message: "Defect" })],
    });
  });

  it("keeps a Defect whose cause is a default error type out of the union", async () => {
    const answer = await graphql({ schema, source: "{ jammed { __typename } }" });

    expect(answer).toEqual({
      data: { jammed: null },
      errors: [expect.objectContaining({ message: "Defect" })],
    });
  });

  it("keeps a resolver's throw out of the union", async () => {
    const answer = await graphql({ schema, source: "{ thrown { __typename } }" });

    expect(answer).toEqual({
      data: { thrown: null },
      errors: [expect.objectContaining({ message: "Defect" })],
    });
  });

  it("keeps a Defect out of the union when every Error is a default type", async () => {
    const claimingBuilder = new SchemaBuilder<{ Objects: { Book: Book } }>({
      plugins: [ErrorsPlugin, UnthrownPlugin],
      errors: { directResult: true, defaultTypes: [Error] },
    });
    claimingBuilder.objectType(Error, {
      name: "Error",
      fields: (t) => ({ message: t.exposeString("message") }),
    });
    claimingBuilder.objectType("Book", { fields: (t) => ({ title: t.exposeString("title") }) });
    claimingBuilder.queryType({
      fields: (t) => ({
        torn: t.resultField({
          type: "Book",
          refusals: {},
          resolve: () => find("torn") as AsyncResult<Book, never>,
        }),
      }),
    });

    const answer = await graphql({
      schema: claimingBuilder.toSchema(),
      source: "{ torn { __typename } }",
    });

    expect(answer).toEqual({
      data: { torn: null },
      errors: [expect.objectContaining({ message: expect.stringContaining("Defect") })],
    });
  });

  it("keeps a refusal constructor's claimed throw out of the union", async () => {
    const answer = await graphql({ schema, source: "{ brokenRefusal { __typename } }" });

    expect(answer).toEqual({
      data: { brokenRefusal: null },
      errors: [expect.objectContaining({ message: "Defect" })],
    });
  });

  it("takes any iterable for a list", async () => {
    const answer = await graphql({
      schema,
      source: "{ catalogue { ... on QueryCatalogueSuccess { data { title } } } }",
    });

    expect(answer).toEqual({
      data: { catalogue: { data: [{ title: "Dune" }, { title: "Emma" }] } },
    });
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
    const outcome = await outcomeOf(Err({ reason: "unnamed" }) as never, {} as never);

    expect(outcome).toBeInstanceOf(Error);
  });

  it("answers a primitive failure as a defect, without rejecting", async () => {
    const outcome = await outcomeOf(Err("not_found") as never, {} as never);

    expect(outcome).toBeInstanceOf(Error);
  });

  it("reads the code of a failure whose tag is no string", async () => {
    const failure = { _tag: 7, code: "LOCKED", until: "2027-01-01" } as const;

    const outcome = await outcomeOf(Err(failure), { LOCKED: ClosedError });

    expect(outcome).toEqual(new ClosedError(failure));
  });

  it("answers a refusal whose constructor throws as a defect, without rejecting", async () => {
    class BrokenError extends Error {
      constructor(_failure: Missing) {
        super("unreachable");
        throw new Error("Broken refusal");
      }
    }

    const outcome = await outcomeOf(Err(new Missing({ title: "ghost" })), { Missing: BrokenError });

    expect(outcome).toEqual(new Error("Broken refusal"));
  });

  it("wraps a Defect whose cause a handled class would claim", async () => {
    const claimed = new NotFoundError(new Missing({ title: "lost" }));

    const outcome = await outcomeOf(fromSafePromise(Promise.reject(claimed)), {}, [NotFoundError]);

    expect(outcome).toEqual(new Error("Defect", { cause: claimed }));
  });

  it("never reads a refusal from the record's prototype", async () => {
    const outcome = await outcomeOf(Err({ code: "toString" }) as never, {} as never);

    expect(outcome).toBeInstanceOf(Error);
  });

  it("answers a failure whose case cannot be read as a defect, without rejecting", async () => {
    const unreadable = {
      get code(): "LOCKED" {
        throw new Error("Unreadable code");
      },
      until: "2027-01-01",
    };

    const outcome = await outcomeOf(Err(unreadable), { LOCKED: ClosedError });

    expect(outcome).toEqual(new Error("Unreadable code"));
  });

  it("wraps a Defect whose cause cannot even be classified", async () => {
    const opaque = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("Opaque");
        },
      },
    );

    const outcome = await outcomeOf(fromSafePromise(Promise.reject(opaque)), {});

    // Compared by identity: equality would inspect the proxy, whose prototype throws.
    expect(
      outcome instanceof Error && { message: outcome.message, cause: outcome.cause === opaque },
    ).toEqual({ message: "Defect", cause: true });
  });

  it("wraps a Defect a handled class cannot classify", async () => {
    class UnclassifiableError extends Error {
      static override [Symbol.hasInstance](): boolean {
        throw new Error("Unclassifiable");
      }
    }
    const cause = new Error("Disk failure");

    const outcome = await outcomeOf(fromSafePromise(Promise.reject(cause)), {}, [
      UnclassifiableError,
    ]);

    expect(outcome).toEqual(new Error("Defect", { cause }));
  });
});
