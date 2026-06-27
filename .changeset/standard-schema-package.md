---
"@unthrown/standard-schema": minor
---

New interop package: bridge any [Standard
Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType, …) to a
`Result`. `fromSchema(schema)` returns a validator
`(input) => Result<Output, readonly Issue[]>`; `fromSchemaAsync(schema)` returns
the `AsyncResult` counterpart and accepts sync or async schemas. The schema's
validation issues are the modeled error `E` (a failed validation is anticipated,
not a defect); a validator that throws becomes a `Defect`. The only dependency
is the types-only `@standard-schema/spec`.
