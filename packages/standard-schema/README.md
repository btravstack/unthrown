# @unthrown/standard-schema

> [Standard Schema](https://standardschema.dev) interop for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/interop)** ·
[API Reference](https://btravstack.github.io/unthrown/api/standard-schema/)

```sh
pnpm add @unthrown/standard-schema
```

Bridge any [Standard Schema](https://standardschema.dev) validator — **Zod**,
**Valibot**, **ArkType**, and others — to a `Result`. A schema's validation
issues become the modeled error `E`, because a failed validation is an
_anticipated_ outcome, not a defect.

```ts
import { fromSchema, fromSchemaAsync } from "@unthrown/standard-schema";
import { z } from "zod";

const parseUser = fromSchema(z.object({ id: z.string() }));

parseUser({ id: "u_1" }).unwrap(); // { id: "u_1" }
parseUser({ id: 1 }).unwrapErr(); // readonly StandardSchemaV1.Issue[]
```

- `fromSchema(schema)` — returns a validator `(input) => Result<Output, Issues>`
  for a **synchronous** schema. If the schema validates asynchronously it throws
  a `TypeError` (use `fromSchemaAsync`).
- `fromSchemaAsync(schema)` — returns a validator
  `(input) => AsyncResult<Output, Issues>` that accepts **sync or async**
  schemas. A validator that _throws_ (rather than returning issues) becomes a
  `Defect`; the `AsyncResult` never rejects.

`@standard-schema/spec` is a tiny, types-only dependency — your validator
library (Zod, Valibot, …) provides the runtime.

## License

[MIT](../../LICENSE) © Benoit TRAVERS
