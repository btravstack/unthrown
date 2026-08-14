# Examples

Small runnable packages, each showing a different job `unthrown` does. Three of
them model one checkout between them; the fourth stands alone.

📖 **[Annotated walkthroughs →](https://btravstack.github.io/unthrown/examples/)**

| Package                                          | Shows                                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`checkout-domain`](./checkout-domain)           | The error union, `Do`/`bind` sequencing, exhaustive matching, and the defect channel.                                              |
| [`checkout-persistence`](./checkout-persistence) | `@unthrown/prisma`: why a read infers `E = never` and a write carries only the codes you branch on.                                |
| [`checkout-api`](./checkout-api)                 | The edge: oRPC's own input validation, one exhaustive `mapErrCases`, and a handler with no `try`/`catch`.                          |
| [`existing-errors`](./existing-errors)           | Adoption with **no `TaggedError`**: your own `kind`-discriminated classes, a plain `code` union, and untagged third-party classes. |

Unlike the snippets in the guide, **this code compiles and is covered by
tests**. There is no database and no server to start:

```sh
pnpm install
pnpm turbo run test --filter="@unthrown/example-*"
pnpm turbo run typecheck --filter="@unthrown/example-*"
```
