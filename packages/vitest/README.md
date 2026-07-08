# @unthrown/vitest

> [Vitest](https://vitest.dev) matchers for [unthrown](https://github.com/btravstack/unthrown)'s
> `Result` and `AsyncResult`.

📖 **[Documentation](https://btravstack.github.io/unthrown/guide/testing)** ·
[API Reference](https://btravstack.github.io/unthrown/api/vitest/)

```sh
pnpm add -D @unthrown/vitest
```

Register the matchers once (e.g. in a Vitest setup file):

```ts
import "@unthrown/vitest";
```

```ts
expect(Ok(1)).toBeOk();
expect(Ok(1)).toBeOkWith(1);
expect(Err(new NotFound())).toBeErrTagged("NotFound");
expect(aDefect).toBeDefect();

// toBeErrTagged also takes an optional payload: a plain object matches exactly,
// an asymmetric matcher matches partially.
expect(Err(new NotFound({ id: 1 }))).toBeErrTagged("NotFound", { id: 1 });
expect(Err(new NotFound({ id: 1, msg: "x" }))).toBeErrTagged(
  "NotFound",
  expect.objectContaining({ id: 1 }),
);

// AsyncResult — `await` is required
await expect(fromPromise(load(), qualify)).toBeOk();
```

Matchers: `toBeOk`, `toBeOkWith`, `toBeErr`, `toBeErrTagged(tag, expected?)`, `toBeDefect`.

> [!WARNING]
> For an `AsyncResult` the matcher is asynchronous — you **must** `await` the
> assertion, or it passes silently.

`vitest` is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
