import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import DataLoader from "dataloader";
import { GraphQLError } from "graphql";
import { createYoga } from "graphql-yoga";
import { Err, fromSafePromise, Ok, TaggedError } from "unthrown";
import { describe, expect, it } from "vitest";

import UnthrownPlugin, { outcomeOf } from "./index.js";

class Missing extends TaggedError("Missing") {}
class MissingError extends Error {
  constructor(_failure: Missing) {
    super("not found");
  }
}
const secret = new GraphQLError("secret credentials", {
  extensions: { code: "SECRET", credentials: "private" },
});
const broken = () => fromSafePromise(Promise.reject(secret));

const maskedServer = (defaultTypes: readonly (typeof Error)[] = []) => {
  const builder = new SchemaBuilder({
    plugins: [ErrorsPlugin, UnthrownPlugin],
    errors: { defaultTypes: [...defaultTypes] },
  });
  builder.objectType(MissingError, {
    name: "Missing",
    fields: (t) => ({ message: t.exposeString("message") }),
  });
  if (defaultTypes.length > 0) {
    builder.objectType(Error, {
      name: "Error",
      fields: (t) => ({ message: t.exposeString("message") }),
    });
  }
  const loader = new DataLoader<string, string>(async (keys) =>
    Promise.all(keys.map(async () => outcomeOf(broken(), {}, defaultTypes))),
  );
  builder.queryType({
    fields: (t) => ({
      defect: t.resultField({ type: "String", refusals: {}, resolve: broken }),
      thrown: t.resultField({
        type: "String",
        refusals: {},
        resolve: () => {
          throw secret;
        },
      }),
      loaded: t.string({ nullable: true, resolve: () => loader.load("key") }),
      missing: t.resultField({
        type: "String",
        refusals: { Missing: MissingError },
        resolve: () => Err(new Missing()),
      }),
      found: t.resultField({ type: "String", refusals: {}, resolve: () => Ok("found") }),
    }),
  });
  return createYoga({ schema: builder.toSchema(), logging: false });
};

const query = async (yoga: ReturnType<typeof maskedServer>, source: string) => {
  const response = await yoga.fetch("http://localhost/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: source }),
  });
  return response.json() as Promise<unknown>;
};

describe("default Yoga masking", () => {
  it.each(["defect", "thrown", "loaded"])("masks a GraphQLError defect from %s", async (field) => {
    expect(await query(maskedServer(), `{ ${field} }`)).toEqual({
      data: { [field]: null },
      errors: [
        {
          message: "Unexpected error.",
          locations: [{ line: 1, column: 3 }],
          path: [field],
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        },
      ],
    });
  });

  it("keeps a GraphQLError defect out of a base Error default union", async () => {
    expect(await query(maskedServer([Error]), "{ defect { __typename } }")).toEqual({
      data: { defect: null },
      errors: [
        {
          message: "Unexpected error.",
          locations: [{ line: 1, column: 3 }],
          path: ["defect"],
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        },
      ],
    });
  });

  it("preserves mapped refusals and successful values", async () => {
    expect(await query(maskedServer(), "{ missing { ... on Missing { message } } found }")).toEqual(
      {
        data: { missing: { message: "not found" }, found: "found" },
      },
    );
  });

  it("returns an opaque per-key Error carrying the original GraphQLError", async () => {
    const outcome = await outcomeOf(broken(), {});

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).not.toBeInstanceOf(GraphQLError);
    expect((outcome as Error).cause).toBe(secret);
  });
});
