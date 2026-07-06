---
"unthrown": minor
---

Make the fluent combinator surface (`map`, `flatMap`, `bind`, `match`, `unwrap`,
…) show up in the generated API reference. The methods were authored on an
internal `ResultMethods` type that TypeDoc dropped, so a discriminated-union
alias like `Result`/`AsyncResult` carried no method list anywhere in the docs.

`ResultMethods<T, E>` and the new parallel `AsyncResultMethods<T, E>` are now
**exported** and documented under the `Types` category (they are the single home
a union alias can hang its method list on); the `Result`/`AsyncResult` type docs
`{@link}` them. The core API reference also gets an explicit `categoryOrder`
(`Facade` → `Types` → `Constructors` → … then `Aggregate`, `Errors`) so the core
surface leads instead of the default alphabetical order, which had buried it
under `Aggregate`.
