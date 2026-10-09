import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import RelayPlugin from "@pothos/plugin-relay";
import { graphql } from "graphql";
import { ErrAsync, OkAsync, TaggedError } from "unthrown";
import { describe, expect, it } from "vitest";

import UnthrownPlugin from "./index.js";
import "./relay.js";

class Closed extends TaggedError("Closed") {}

class ShelfClosedError extends Error {
  override name = "ShelfClosedError";

  constructor(_failure: Closed) {
    super("The shelf is closed");
  }
}

const SHELF = {
  edges: [{ cursor: "a", node: { title: "Dune" } }],
  pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: "a", endCursor: "a" },
};

const builder = new SchemaBuilder<{ Objects: { Book: { readonly title: string } } }>({
  plugins: [ErrorsPlugin, RelayPlugin, UnthrownPlugin],
  errors: { directResult: true },
  relay: {},
});
builder.objectType(ShelfClosedError, {
  name: "ShelfClosed",
  fields: (t) => ({ message: t.exposeString("message") }),
});
builder.objectType("Book", { fields: (t) => ({ title: t.exposeString("title") }) });
builder.queryType({
  fields: (t) => ({
    books: t.resultConnection({
      type: "Book",
      args: { open: t.arg.boolean({ required: true }) },
      refusals: { Closed: ShelfClosedError },
      resolve: (_root, { open }) => (open ? OkAsync(SHELF) : ErrAsync(new Closed())),
    }),
    counted: t.resultConnection(
      { type: "Book", refusals: {}, resolve: () => OkAsync(SHELF) },
      {
        fields: (c) => ({
          totalCount: c.int({ resolve: () => 1 }),
        }),
      },
    ),
    nothing: t.resultConnection({
      type: "Book",
      nullable: true,
      refusals: {},
      resolve: () => OkAsync(null),
    }),
  }),
});
const schema = builder.toSchema();

const booksWhen = async (open: boolean) =>
  graphql({
    schema,
    source: `{ books(open: ${String(open)}, first: 1) {
      __typename
      ... on QueryBooksConnection { edges { cursor node { title } } }
      ... on ShelfClosed { message }
    } }`,
  });

describe("resultConnection", () => {
  it("answers the connection of an Ok", async () => {
    expect(await booksWhen(true)).toEqual({
      data: {
        books: {
          __typename: "QueryBooksConnection",
          edges: [{ cursor: "a", node: { title: "Dune" } }],
        },
      },
    });
  });

  it("answers a failure as the refusal its case maps to", async () => {
    expect(await booksWhen(false)).toEqual({
      data: { books: { __typename: "ShelfClosed", message: "The shelf is closed" } },
    });
  });

  it("answers null for a nullable connection", async () => {
    const answer = await graphql({ schema, source: "{ nothing(first: 1) { __typename } }" });

    expect(answer).toEqual({ data: { nothing: null } });
  });

  it("forwards the connection's own options", async () => {
    const answer = await graphql({
      schema,
      source: "{ counted(first: 1) { __typename ... on QueryCountedConnection { totalCount } } }",
    });

    expect(answer).toEqual({
      data: { counted: { __typename: "QueryCountedConnection", totalCount: 1 } },
    });
  });
});
