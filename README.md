<p align="center">
  <img src="docs/public/logo.svg" alt="unthrown" width="128" height="128" />
</p>

<h1 align="center">unthrown</h1>

> Explicit errors as values for TypeScript — with a separate defect channel for
> the unexpected, and qualification enforced at every boundary.

[![CI](https://github.com/btravstack/unthrown/actions/workflows/ci.yml/badge.svg)](https://github.com/btravstack/unthrown/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/unthrown.svg)](https://www.npmjs.com/package/unthrown)
[![license](https://img.shields.io/npm/l/unthrown.svg)](./LICENSE)

Ordinary errors are _unthrown_ — returned as values, not flung up the stack.
Only a true defect ever throws, and only at `unwrap`.

📖 **[Documentation](https://btravstack.github.io/unthrown/)** ·
[Why unthrown?](https://btravstack.github.io/unthrown/guide/why-unthrown) ·
[Getting Started](https://btravstack.github.io/unthrown/guide/getting-started)

## Why?

Most errors-as-values libraries model _anticipated_ failures in `Result<T, E>`
but have no channel for the _unexpected_ — a thrown `TypeError`, an un-triaged
promise rejection, a bug in a callback. Fold both into the same `E` and a bug
starts to look like a domain error.

`unthrown` keeps a third runtime state — a **`Defect`** — that is **invisible to
the type**. `E` lists only your anticipated errors; anything unexpected becomes a
defect that short-circuits to the edge, where you log it and return a 500.

- **Errors as values.** `map` / `flatMap` / `match` over a `Result<T, E>`.
- **A separate defect channel.** Unmodeled failures can't masquerade as domain
  errors, and can only be observed by `match` or `recoverDefect`.
- **Qualification at every boundary.** `fromPromise` / `fromThrowable` force you
  to triage each failure into a modeled error or a defect — no path yields
  `unknown` in `E`.
- **Small and done-able.** Zero runtime dependencies, ESM-first, dual CJS/ESM,
  fully typed.

See [Why unthrown?](https://btravstack.github.io/unthrown/guide/why-unthrown) for
the comparison with `neverthrow`, `boxed`, and `effect`.

## Install

```sh
pnpm add unthrown
```

## Example

```ts
import { fromPromise, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {}

// Cross an async boundary — every rejection MUST be triaged into E or a defect.
// `defect` is injected as qualify's second argument.
const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);

// Handle every channel once, at the edge — no surrounding try/catch.
const status = await user.match({
  ok: () => 200,
  err: () => 404, // your modeled NotFound
  defect: (cause) => {
    logger.error(cause); // everything unexpected
    return 500;
  },
});
```

A `throw` inside any combinator (`.map`, `.flatMap`, …) is caught and becomes a
defect, so the edge of your program needs a single `match` and no `try`/`catch`.

## Packages

| Package                                         | Description                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`unthrown`](./packages/core)                   | The core `Result` / `AsyncResult`, interop, `TaggedError`, `matchTags`. Zero runtime deps.     |
| [`@unthrown/vitest`](./packages/vitest)         | Vitest matchers: `toBeOk`, `toBeOkWith`, `toBeErr`, `toBeErrTagged`, `toBeDefect`.             |
| [`@unthrown/pattern`](./packages/pattern)       | Thin `ts-pattern` sugar for the natively-matchable `Result`: `P.Ok`/`P.Err`/`P.Defect`, `tag`. |
| [`@unthrown/effect`](./packages/effect)         | Effect interop: `Result ↔ Exit` (bijection), `Either`, `Effect`.                               |
| [`@unthrown/neverthrow`](./packages/neverthrow) | neverthrow interop: `Result ↔ Result`, `AsyncResult ↔ ResultAsync`.                            |
| [`@unthrown/boxed`](./packages/boxed)           | Boxed interop: `Result ↔ Result`, `AsyncResult ↔ Future<Result>`.                              |

## Contributing

This is a pnpm + turbo monorepo. Common tasks:

```sh
pnpm install
pnpm build        # build all packages (tsdown, dual CJS/ESM)
pnpm test         # run the Vitest suites
pnpm typecheck    # tsc --noEmit across packages
pnpm lint         # oxlint
pnpm format       # oxfmt
```

## License

[MIT](./LICENSE) © Benoit TRAVERS
