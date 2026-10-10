# Use with Pothos

> **How-to.** [`@unthrown/pothos`](/api/pothos/) resolves
> [Pothos](https://pothos-graphql.dev) GraphQL fields from a `Result`: `Ok` is the
> field's value, each modeled failure becomes a typed member of the field's
> result union, and a [`Defect`](../explanation/the-defect-channel) stays an
> error of the operation, never a refusal.

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
| `Defect`     | a thrown error, which the server must mask                 |

::: warning Mask errors at the server
A `Defect` is never answered as a typed refusal, but hiding its message is the
server's job. GraphQL Yoga masks unexpected errors by default; executing the
schema with graphql-js alone, or with a server that does not mask, returns the
defect's message to the client. A defect whose cause is a `GraphQLError` is
rethrown as it is — GraphQL's own signal for an error meant for the client, so
Yoga shows it.
:::

## Register the plugin

`@unthrown/pothos` builds on the errors plugin, which the builder lists too:

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

`resolve` answers a `Result` or an `AsyncResult`, never a `Promise`: an
`async` resolver does not compile, so async work enters through
[`fromPromise`](./qualify-a-boundary) and composes with `flatMap`, as everywhere
in unthrown.

A failure names its case by its `_tag`, or by its `code` — so an `ORPCError` from
[`@unthrown/orpc`](./use-with-orpc)'s client maps by the code its procedure
declares (`{ NOT_FOUND: BookNotFound }`).

The record is checked [like a matcher](../explanation/exhaustive-error-matching):
a case left out, a case the failure cannot be, or a class whose constructor takes
another case's failure does not compile. Adding a case to the resolver's failure
breaks every field that resolves it until the case has its refusal.

The extra-case check is TypeScript's excess-property check, so it holds for the
record written inline. A record declared apart keeps it with `satisfies`:

```ts
import type { Refusals } from "@unthrown/pothos";

const bookRefusals = { NotFound: BookNotFound } satisfies Refusals<NotFound>;
```

A resolver that cannot fail takes `refusals: {}`. On a builder without
`defaultTypes` its field stays a plain field rather than a one-member union.

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
which would fail the whole batch. `outcomeOf` gives exactly that from a `Result`:
the value, the refusal its failure maps to, or a `Defect` as an `Error`. Pass it
the builder's `defaultTypes` too, so a defect one of them would claim is wrapped
rather than answered as a refusal:

Loadable objects come from `@pothos/plugin-dataloader`, which the builder lists
too:

```sh
pnpm add @pothos/plugin-dataloader dataloader
```

```ts
import DataloaderPlugin from "@pothos/plugin-dataloader";
import { outcomeOf } from "@unthrown/pothos";

const builder = new SchemaBuilder<{ Objects: { Book: Book } }>({
  plugins: [ErrorsPlugin, DataloaderPlugin, UnthrownPlugin],
  errors: { directResult: true },
});

const BookNode = builder.loadableObject("Book", {
  load: (titles: readonly string[]) =>
    Promise.all(
      titles.map((title) =>
        outcomeOf(
          library.find(title),
          { NotFound: BookNotFound },
          builder.options.errors?.defaultTypes,
        ),
      ),
    ),
  fields: (t) => ({ title: t.exposeString("title") }),
});
```

A loader can only reject a key with an `Error`, so with a base `Error` among the
errors plugin's `defaultTypes`, every defect a loader reports is claimed as that
default type — the one case where a defect reaches the union.
