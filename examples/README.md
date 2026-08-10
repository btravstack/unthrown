# Examples

Three small packages modelling one checkout between them, each showing a
different job `unthrown` does.

📖 **[Annotated walkthroughs →](https://btravstack.github.io/unthrown/examples/)**

| Package                                          | Shows                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [`checkout-domain`](./checkout-domain)           | The error union, `Do`/`bind` sequencing, exhaustive matching, and the defect channel.                     |
| [`checkout-persistence`](./checkout-persistence) | `@unthrown/prisma`: why a read infers `E = never` and a write carries only the codes you branch on.       |
| [`checkout-api`](./checkout-api)                 | The edge: oRPC's own input validation, one exhaustive `mapErrCases`, and a handler with no `try`/`catch`. |

Unlike the snippets in the guide, **this code compiles and is covered by
tests**. There is no database and no server to start:

```sh
pnpm install
pnpm test
pnpm typecheck
```
