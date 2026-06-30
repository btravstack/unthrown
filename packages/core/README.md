# unthrown

> Explicit errors as values for TypeScript — with a separate defect channel for
> the unexpected, and qualification enforced at every boundary.

📖 **[Documentation](https://btravstack.github.io/unthrown/)** ·
[API Reference](https://btravstack.github.io/unthrown/api/core/)

```sh
pnpm add unthrown
```

```ts
import { Ok, Err, fromPromise, type Result } from "unthrown";

const user = fromPromise(fetchUser(id), (cause, defect) =>
  cause instanceof NotFoundError ? new NotFound() : defect(cause),
);

const status = await user.match({
  ok: () => 200,
  err: () => 404,
  defect: () => 500,
});
```

- **Errors as values** via `Result<T, E>` / `AsyncResult<T, E>`.
- **A separate defect channel** for the unexpected — invisible to the type,
  observable only via `match` / `recoverDefect`.
- **Qualification at every boundary** — `fromPromise` / `fromThrowable` force you
  to triage each failure into a modeled error or a defect.
- **Tagged errors** — `TaggedError(tag)` + the exhaustive `matchTags` fold.
- Zero runtime dependencies, ESM-first, dual CJS/ESM.

See the [full documentation](https://btravstack.github.io/unthrown/) for the guide
and complete API.

## License

[MIT](../../LICENSE) © Benoit TRAVERS
