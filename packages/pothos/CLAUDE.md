# @unthrown/pothos

Package-specific spec for `packages/pothos`. The cross-cutting rules — the five
theses, the load-bearing runtime invariants, the public surface and the
internal design — live in the root [`CLAUDE.md`](../../CLAUDE.md) and apply
here too.

PeerDeps `@pothos/core` `^4.15.0`, `@pothos/plugin-errors` `^4.9.0`, `graphql`
`^16.10.0 || ^17.0.0`, and `@pothos/plugin-relay` `^4.8.0` as an **optional**
peer — **peers, not deps**: Pothos plugins extend one `SchemaBuilder` class and
one `RootFieldBuilder` prototype, and graphql checks a schema's realm, so a
second copy of any of them breaks at runtime.

A Pothos plugin (`unthrown`) whose fields are resolved by a `Result`. The
resolver's failure is mapped to GraphQL error classes by a `refusals` record
keyed by **case** — the failure's `_tag` (a `TaggedError`), else its `code` (an
`ORPCError`, or any `code`-discriminated value); a failure naming neither has
no case (`CaseOf` is `never`) and cannot be refused. `Refusals<Failure>` is a
mapped type over the cases, so it is exhaustive the way the error combinators'
matcher is (Thesis #5): a missing case, an extra one, or a class whose
constructor takes another case's failure does not compile. The record — not a
matcher callback — because the field's error **types** must be known as values:
`@pothos/plugin-errors` builds the result union from `errors.types`, which
`typesOf(refusals)` derives (each class once), so the union and the mapping
cannot drift. `Failure` is inferred from `resolve` alone (`refusals` is
`NoInfer`), so the record is checked against the resolver, never the reverse.

Variants map as: `Ok` → the field's value; `Err` → `new Refusal(error)`,
**returned**, not thrown — `@pothos/plugin-errors` answers a returned `Error`
of a declared type as its union member (its `wrapResolve` checks
`result instanceof Error` before its `catch`), so no throw is needed to reach
the union; `Defect` → the cause is **thrown** by `settle` (the elimination
edge), so GraphQL masks it like any resolver error. `outcomeOf` is the
DataLoader twin: the same mapping, but a `Defect` — or a failure no refusal
maps, which only an unchecked cast can produce — is **returned** as an `Error`
(the cause itself when it is one, else `new Error("Defect", { cause })`), so
one key's bug does not reject the whole batch.

Two entry points, both side-effectful (listed in `sideEffects`): `.` registers
the plugin and `resultField` (declaration merge into `PothosSchemaTypes` plus a
`RootFieldBuilder.prototype` assignment, the packaging every Pothos plugin
uses) and exports `settle` / `outcomeOf` / `typesOf` and the types;
`./relay` adds `resultConnection` on top of `@pothos/plugin-relay`'s
`connection`, kept apart so relay's types are needed only by its importers.
Both methods delegate to `t.field` / `t.connection`, keeping every other option
— including the errors plugin's own (`directResult`, `dataField`), whose
`types` alone the refusals replace.

Tests run against a real Pothos schema executed with `graphql`. Vitest inlines
`@pothos/*` (`server.deps.inline`): left external, Pothos would build its
schema with Node's copy of graphql while a spec's own `import { graphql }`
resolves Vite's, and graphql's realm check refuses the schema. **Outside the
fixed version group** — its majors track Pothos', not the family's.
