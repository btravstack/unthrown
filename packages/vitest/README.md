# @unthrown/vitest

> [Vitest](https://vitest.dev) matchers for [unthrown](https://github.com/btravstack/unthrown)'s
> `Result` and `AsyncResult`.

📖 **[Documentation](https://btravstack.github.io/unthrown/how-to/test-with-vitest)** ·
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

Matchers: `toBeOk`, `toBeOkWith`, `toBeErr`, `toBeErrWith`, `toBeErrTagged(tag, expected?)`, `toBeDefect`, `toBeDefectWith(cause)`.

> [!WARNING]
> For an `AsyncResult` the matcher is asynchronous — you **must** `await` the
> assertion. A forgotten `await` does not pass silently: importing the package
> also registers an `afterEach` hook (`failOnForgottenAwait`) that **fails** the
> test, naming the pending matchers and the line that created them.

The registration is automatic, but the pieces are exported for wiring them
elsewhere (a custom `expect` instance, your own `afterEach`): the seven raw
matcher functions (`toBeOk`, `toBeOkWith`, `toBeErr`, `toBeErrWith`,
`toBeErrTagged`, `toBeDefect`, `toBeDefectWith`) for `expect.extend`,
`failOnForgottenAwait` for the hook, and the `UnthrownMatchers<R>` type for
augmenting an assertion interface.

`vitest` is a peer dependency.

## License

[MIT](https://github.com/btravstack/unthrown/blob/main/LICENSE) © Benoit TRAVERS
