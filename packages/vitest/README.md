# @unthrown/vitest

> [Vitest](https://vitest.dev) matchers for [unthrown](https://github.com/btravers/unthrown)'s
> `Result` and `AsyncResult`.

📖 **[Documentation](https://btravers.github.io/unthrown/guide/testing)** ·
[API Reference](https://btravers.github.io/unthrown/api/vitest/)

```sh
pnpm add -D @unthrown/vitest
```

Register the matchers once (e.g. in a Vitest setup file):

```ts
import "@unthrown/vitest";
```

```ts
expect(ok(1)).toBeOk();
expect(ok(1)).toBeOkWith(1);
expect(err(new NotFound())).toBeErrTagged("NotFound");
expect(aDefect).toBeDefect();

// AsyncResult — `await` is required
await expect(fromPromise(load(), qualify)).toBeOk();
```

Matchers: `toBeOk`, `toBeOkWith`, `toBeErr`, `toBeErrTagged`, `toBeDefect`.

> [!WARNING]
> For an `AsyncResult` the matcher is asynchronous — you **must** `await` the
> assertion, or it passes silently.

`vitest` is a peer dependency.

## License

[MIT](../../LICENSE) © Benoit TRAVERS
