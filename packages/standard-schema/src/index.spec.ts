import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";

import { fromSchema, fromSchemaAsync } from "./index.js";

// A tiny hand-rolled Standard Schema validator (no validator lib needed): a
// string schema that returns `{ value }` on a string and `{ issues }` otherwise.
function stringSchema(opts?: {
  async?: boolean;
  throws?: boolean;
}): StandardSchemaV1<unknown, string> {
  const check = (input: unknown): StandardSchemaV1.Result<string> =>
    typeof input === "string" ? { value: input } : { issues: [{ message: "expected a string" }] };
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (input) => {
        if (opts?.throws) throw new Error("validator blew up");
        return opts?.async ? Promise.resolve(check(input)) : check(input);
      },
    },
  };
}

describe("fromSchema (sync)", () => {
  it("returns Ok with the parsed value on valid input", () => {
    expect(fromSchema(stringSchema())("hi").unwrap()).toBe("hi");
  });

  it("returns Err carrying the issues on invalid input", () => {
    const r = fromSchema(stringSchema())(42);
    expect(r.unwrapErr()).toEqual([{ message: "expected a string" }]);
  });

  it("throws a TypeError when the schema validates asynchronously", () => {
    expect(() => fromSchema(stringSchema({ async: true }))("hi")).toThrow(TypeError);
  });
});

describe("fromSchemaAsync", () => {
  it("returns Ok on valid input for a synchronous schema", async () => {
    expect((await fromSchemaAsync(stringSchema())("hi")).unwrap()).toBe("hi");
  });

  it("returns Ok on valid input for an asynchronous schema", async () => {
    expect((await fromSchemaAsync(stringSchema({ async: true }))("hi")).unwrap()).toBe("hi");
  });

  it("returns Err carrying the issues on invalid input", async () => {
    const r = await fromSchemaAsync(stringSchema({ async: true }))(42);
    expect(r.unwrapErr()).toEqual([{ message: "expected a string" }]);
  });

  it("turns a throwing validator into a Defect (never rejects)", async () => {
    const r = await fromSchemaAsync(stringSchema({ throws: true }))("hi");
    expect(r.isDefect()).toBe(true);
  });
});
