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
no case (`CaseOf` is `never`) and cannot be refused. So a field's resolver
answers `Result<Shape, Failure & Caseable>`: a failure with any member that is
neither a string `_tag` nor a string `code` — a primitive, an untagged object —
fails right at `resolve`, rather than vanishing from `CaseOf` and reaching the
runtime as a defect. The constraint lives where `Failure` is inferred: an
intersection into the options, or a constraint on the type parameter, is
evaluated before a context-sensitive `resolve` is inferred, and rejects every
field. At runtime `caseOf` reads a string `_tag`, else a string `code`, and
answers no case for anything else, a primitive included, without throwing. An
optional string `_tag` beside a `code` (`{ _tag?: "Draft"; code: "LOCKED" }`)
contributes its values to `CaseOf` — the tag names the case whenever it is
present — so the record must refuse both. `FailureOf` takes every member whose
cases include the case, so a union-valued discriminant (`code: "A" | "B"`)
keeps its type in each constructor slot rather than collapsing to `never`.
`Refusals<Failure>` is a
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
edge), an error of the operation like any resolver error; hiding its message
is the server's job (Yoga masks by default, graphql-js alone does not), and the
docs say so rather than promise masking. A cause that is an
instance of a class the errors plugin answers on the field — one of its
refusals, or one of the plugin's `defaultTypes` — is wrapped first
(`new Error("Defect", { cause })`): thrown raw, the plugin would answer the bug
as a modeled refusal. When even that wrapper would be claimed
(`defaultTypes: [Error]`), the defect travels as a non-`Error` signal, which
GraphQL turns into an error of its own. Any other cause, a
`GraphQLError` included, is rethrown as it is. The resolver itself is called
through `attempt`, inside a promise, so a synchronous throw becomes a `Defect`
and takes the same path; and a refusal constructor that throws is answered as a
defect by `outcomeOf`, never a rejection. Both paths share `answerOf` (value,
refusal or defect) and differ only in how they surface a defect: `settle`
throws it unclaimed; `outcomeOf` returns it as an `Error`, wrapped when a
handled class would claim its cause — a loader can only reject a key with an
`Error`, so a base `Error` among `defaultTypes` claims every loader defect,
which the TSDoc states. Refusal classes are read as own properties
(`Object.hasOwn`); `Refusals` refuses a widened discriminant (`code: string`,
no cases to enumerate) and a `__proto__` case (an object literal's
`__proto__` sets its prototype). A non-finite case (`code: string`, or a template
literal such as `` `E_${string}` ``) is refused the same way — `{}` extends
`Record<Case, unknown>` exactly when the cases form an index signature — and
a resolver that cannot fail (`Failure` is `never`) takes an exactly empty
record, so an impossible refusal cannot add a member to the union. The
`never` test is on `Failure` itself, not on `CaseOf<Failure>`: while a
context-sensitive `resolve` is still being inferred, `Failure` is a
placeholder whose `CaseOf` is `never` too, and an exact empty record there
would reject every field. Neither method resolves subscription fields — the
errors plugin wraps a subscription's `subscribe` before any `Result` is
settled — so on a subscription builder their options do not compile.
`resultConnection` infers the resolved connection (`ConnectionResult`) from
`resolve` and hands it to relay's connection and edge options, so a
`totalCount` the resolver returns is typed where those options read it. Its nullability defaults to the builder's
`DefaultFieldNullability`, as `resultField`'s does. Reading a failure's case is
guarded like constructing its refusal: a `_tag` or `code` getter that throws is
a defect. The extra-case check is TypeScript's excess-property check, so it
holds for an inline record or one declared with `satisfies Refusals<Failure>`;
capturing a predeclared map's type as a generic and refusing its extra keys was
tried and rejected — evaluated before a context-sensitive `resolve` is
inferred, it refuses valid fields. A nullable `resultConnection` may
answer `Ok(null)`, and it forwards relay's connection and edge options (its
second and third arguments) to `connection`. `outcomeOf` is the
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
