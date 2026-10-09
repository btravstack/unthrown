# @unthrown/pothos

> A [Pothos](https://pothos-graphql.dev) integration for
> [unthrown](https://github.com/btravstack/unthrown)'s `Result`: GraphQL fields
> resolved by a `Result`, each failure answered as a typed member of the field's
> result union — without a throw.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/use-with-pothos)** ·
[API Reference](https://btravstack.github.io/unthrown/api/pothos/)

```sh
pnpm add @unthrown/pothos unthrown @pothos/core @pothos/plugin-errors graphql
```

`@pothos/plugin-errors` turns a field's error classes into a result union, but
it learns of an error by catching it, and nothing ties the classes a field lists
to the failures its resolver can raise. `@unthrown/pothos` closes that gap: the
resolver answers a `Result`, and `refusals` names the GraphQL error class each
case of its failure becomes — checked like a matcher, so a case left out does not
compile.

| unthrown     | GraphQL                                                    |
| ------------ | ---------------------------------------------------------- |
| `Ok(value)`  | the field's value                                          |
| `Err(error)` | the refusal its case maps to, a member of the result union |
| `Defect`     | a thrown error, which GraphQL masks                        |

```ts
import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import UnthrownPlugin from "@unthrown/pothos";

class BookNotFound extends Error {
  constructor(failure: NotFound) {
    super(`No book titled ${failure.title}`);
  }
}

const builder = new SchemaBuilder({
  plugins: [ErrorsPlugin, UnthrownPlugin],
  errors: { directResult: true },
});
builder.objectType(BookNotFound, {
  name: "BookNotFound",
  fields: (t) => ({ message: t.exposeString("message") }),
});

builder.queryField("book", (t) =>
  t.resultField({
    type: Book,
    args: { title: t.arg.string({ required: true }) },
    refusals: { NotFound: BookNotFound }, // one class per case of the failure
    resolve: (_root, { title }) => library.find(title), // AsyncResult<Book, NotFound>
  }),
);
```

A failure names its case by its `_tag` (a `TaggedError`) or its `code` (an
`ORPCError` from `@unthrown/orpc`'s client, or any `code`-discriminated value).

- **`resultField`** — `t.field` with a `Result`-answering `resolve` and its `refusals`.
- **`resultConnection`** (`@unthrown/pothos/relay`) — the same for
  `@pothos/plugin-relay`'s `t.connection`.
- **`outcomeOf`** — a `Result` as a DataLoader answers one key: the value or the
  refusal, a `Defect` as an `Error` rather than a rejected batch.
- **`settle`**, **`typesOf`** — the two halves `resultField` is built from, for a
  field type the package does not wrap.

Peers: `@pothos/core` `^4.15.0`, `@pothos/plugin-errors` `^4.9.0`, `graphql`
`^16.10.0 || ^17.0.0`, and `@pothos/plugin-relay` `^4.8.0` (optional, for
`/relay`).

## License

MIT
