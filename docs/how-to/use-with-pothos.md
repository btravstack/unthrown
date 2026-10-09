# Use with Pothos

> **How-to.** [`@unthrown/pothos`](/api/pothos/) resolves
> [Pothos](https://pothos-graphql.dev) GraphQL fields from a `Result`: `Ok` is the
> field's value, each modeled failure becomes a typed member of the field's
> result union, and a [`Defect`](../explanation/the-defect-channel) stays an
> error GraphQL masks.

```sh
pnpm add @unthrown/pothos unthrown @pothos/core @pothos/plugin-errors graphql
```

`@pothos/plugin-errors` already models expected failures the GraphQL way — a
field's error classes become members of its result union — but it learns of a
failure by catching a throw, and nothing checks that the classes a field lists
are the failures its resolver can raise. With a `Result` resolver both are
settled by the types:

| unthrown     | GraphQL                                                    |
| ------------ | ---------------------------------------------------------- |
| `Ok(value)`  | the field's value                                          |
| `Err(error)` | the refusal its case maps to, a member of the result union |
| `Defect`     | a thrown error, which GraphQL masks                        |

## Register the plugin

`@unthrown/pothos` builds on the errors plugin, which the builder lists before it:

```ts
import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import UnthrownPlugin from "@unthrown/pothos";

const builder = new SchemaBuilder<{ Objects: { Book: Book } }>({
  plugins: [ErrorsPlugin, UnthrownPlugin],
  errors: { directResult: true },
});
```

## Map each failure to a GraphQL error

A refusal is a GraphQL error class built from the failure it answers. Register it
as an object type, as the errors plugin expects:

```ts
class NotFound extends TaggedError("NotFound")<{ readonly title: string }> {}

class BookNotFound extends Error {
  constructor(failure: NotFound) {
    super(`No book titled ${failure.title}`);
  }
}

builder.objectType(BookNotFound, {
  name: "BookNotFound",
  fields: (t) => ({ message: t.exposeString("message") }),
});
```

## Resolve a field from a `Result`

`t.resultField` is `t.field` whose `resolve` answers a `Result`, with one refusal
per case of its failure:

```ts
builder.queryField("book", (t) =>
  t.resultField({
    type: "Book",
    args: { title: t.arg.string({ required: true }) },
    refusals: { NotFound: BookNotFound },
    resolve: (_root, { title }) => library.find(title), // AsyncResult<Book, NotFound>
  }),
);
```

A failure names its case by its `_tag`, or by its `code` — so an `ORPCError` from
[`@unthrown/orpc`](./use-with-orpc)'s client maps by the code its procedure
declares (`{ NOT_FOUND: BookNotFound }`).

The record is checked [like a matcher](../explanation/exhaustive-error-matching):
a case left out, a case the failure cannot be, or a class whose constructor takes
another case's failure does not compile. Adding a case to the resolver's failure
breaks every field that resolves it until the case has its refusal.

## Connections

`@unthrown/pothos/relay` adds `t.resultConnection`, the same for
`@pothos/plugin-relay`'s connections — the `Ok` value is the connection. The
relay plugin is an optional peer: install it and list it in the builder's
plugins, then import the entry:

```sh
pnpm add @pothos/plugin-relay
```

```ts
import RelayPlugin from "@pothos/plugin-relay";
import "@unthrown/pothos/relay";

const builder = new SchemaBuilder<{ Objects: { Book: Book } }>({
  plugins: [ErrorsPlugin, RelayPlugin, UnthrownPlugin],
  errors: { directResult: true },
  relay: {},
});

builder.queryField("books", (t) =>
  t.resultConnection({
    type: "Book",
    refusals: { ShelfClosed: ShelfClosedError },
    resolve: (_root, args) => library.page(args), // AsyncResult<Connection, ShelfClosed>
  }),
);
```

## DataLoaders

A loader answers each key with its value or an `Error` — never a rejection,
which would fail the whole batch. `outcomeOf` gives exactly that from a `Result`,
a `Defect` included:

```ts
load: (titles) => Promise.all(titles.map((title) => outcomeOf(library.find(title), refusals))),
```
