# unthrown

> Explicit errors as values for TypeScript — with a separate defect channel for
> the unexpected, and qualification enforced at every boundary.

📖 **[Documentation](https://btravstack.github.io/unthrown/)** ·
[API Reference](https://btravstack.github.io/unthrown/api/core/)

```sh
pnpm add unthrown
```

No peer dependencies — the exhaustive error matcher is built-in and exported as
`match` / `P` / `tag`.

```ts
import { fromPromise, tag, TaggedError } from "unthrown";

class NotFound extends TaggedError("NotFound") {} // our modeled domain failure
class NotFoundError extends Error {} // what `fetchUser` rejects with on a 404

const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);

const status = await user.match({
  ok: () => 200,
  // `errCases` takes the exhaustive matcher — every case of E named:
  errCases: (matcher) => matcher.with(tag("NotFound"), () => 404),
  defect: () => 500,
});
```

- **Errors as values** via `Result<T, E>` / `AsyncResult<T, E>`.
- **A separate defect channel** for the unexpected — invisible to the type,
  observable only via `match` / `recoverDefect`.
- **Qualification at every boundary** — `fromPromise` / `fromThrowable` force you
  to triage each failure into a modeled error or a defect.
- **Tagged errors** — `TaggedError(tag)` + `tag(t)`, folded exhaustively through
  `match`'s built-in error matcher.
- **Zero runtime dependencies** (the matcher is built-in), ESM-first, dual
  CJS/ESM.

See the [full documentation](https://btravstack.github.io/unthrown/) for the guide
and complete API.

**Upgrading from 4.x?** See
[Upgrade from 4.x to 5.0](https://btravstack.github.io/unthrown/how-to/upgrade-to-v5).

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
