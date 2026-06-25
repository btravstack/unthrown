# unthrown

> Explicit errors as values for TypeScript — with a separate defect channel for
> the unexpected, and qualification enforced at every boundary.

📖 **[Documentation](https://btravers.github.io/unthrown/)** ·
[API Reference](https://btravers.github.io/unthrown/api/core/)

```sh
pnpm add unthrown
```

```ts
import { ok, err, fromPromise, defect, type Result } from "unthrown";

const user = fromPromise(fetchUser(id), (cause) =>
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

See the [full documentation](https://btravers.github.io/unthrown/) for the guide
and complete API.

## License

[MIT](../../LICENSE) © Benoit TRAVERS
