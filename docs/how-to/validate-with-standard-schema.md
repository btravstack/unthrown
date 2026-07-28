# Validate with Standard Schema

> **How-to.** Turn any [Standard Schema](https://standardschema.dev) validator
> (Zod, Valibot, ArkType, …) into a function that returns a `Result` whose error
> is the validator's own **issues array** — a failed validation is an anticipated
> outcome, not a defect.

```sh
pnpm add @unthrown/standard-schema
```

The only dependency is the tiny, types-only `@standard-schema/spec` — your
validator library provides the runtime.

## Turn a schema into a `Result`-returning validator

```ts
import { fromSchema } from "@unthrown/standard-schema";
import { z } from "zod";

const parseUser = fromSchema(z.object({ id: z.string() }));

const ok = parseUser({ id: "u_1" });
if (ok.isOk()) ok.value; // { id: "u_1" }

const bad = parseUser({ id: 1 });
if (bad.isErr()) bad.error; // readonly StandardSchemaV1.Issue[]
```

- `fromSchema(schema)` → `(input) => Result<Output, Issues>` for a **synchronous**
  schema (it throws a `TypeError` if the schema is async — use the next one).
- `fromSchemaAsync(schema)` → `(input) => AsyncResult<Output, Issues>`, accepting
  sync **or** async schemas. A validator that _throws_ (rather than returning
  issues) becomes a `Defect`; the `AsyncResult` never rejects.

## Reduce issues to per-field messages

The error channel is the issues array — map it in the `errCases` arm. `E` here is
a **single** type (`SchemaIssues`), not a union of tags, so there are no cases to
enumerate: `P._` _is_ the enumeration, and one branch takes the whole array and
reduces it to per-field messages. (Everywhere `E` is a real union, name the cases
instead — see [Exhaustive error matching](../explanation/exhaustive-error-matching).)

```ts
import { P } from "unthrown";
import { z } from "zod";
import { fromSchema, type SchemaIssues } from "@unthrown/standard-schema";

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const parseSignup = fromSchema(signupSchema);

const fieldOf = (issue: SchemaIssues[number]) => {
  const segment = issue.path?.[0];
  const key = typeof segment === "object" ? segment.key : segment;
  return key === undefined ? "_form" : String(key);
};

type ValidationResult =
  | { ok: true; data: { email: string; password: string } }
  | { ok: false; fieldErrors: Record<string, string[]> };

function validateSignup(input: unknown): ValidationResult {
  return parseSignup(input).match({
    ok: (data) => ({ ok: true, data }),
    errCases: (matcher) =>
      // oxlint-disable-next-line unthrown/no-catch-all-pattern -- E is a single issues array, not a union
      matcher.with(P._, (issues) => ({
        ok: false as const,
        fieldErrors: issues.reduce<Record<string, string[]>>((byField, issue) => {
          const field = fieldOf(issue);
          (byField[field] ??= []).push(issue.message);
          return byField;
        }, {}),
      })),
    defect: (cause) => {
      logger.error(cause); // the validator itself threw — a real bug, not a bad form
      return { ok: false, fieldErrors: { _form: ["Something went wrong."] } };
    },
  });
}

validateSignup({ email: "not-an-email", password: "short" });
// { ok: false, fieldErrors: { email: [...], password: [...] } }
```

The `defect` arm only fires if the schema itself throws instead of returning
issues — a bug in the validator, not a bad submission.

## Where to go next

- Feed the parsed value into a pipeline: [Handle results at the edge](./handle-results-at-the-edge).
- Other library bridges: [Interoperate with other libraries](./interoperate-with-libraries).
