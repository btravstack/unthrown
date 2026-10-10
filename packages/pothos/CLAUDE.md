# @unthrown/pothos

Package-specific spec for `packages/pothos`. The cross-cutting rules — the five
theses, the load-bearing runtime invariants, the public surface and the
internal design — live in the root [`CLAUDE.md`](../../CLAUDE.md) and apply
here too.

## Peers

`@pothos/core` `^4.15.0`, `@pothos/plugin-errors` `^4.9.0`, `graphql`
`^16.10.0 || ^17.0.0`, and `@pothos/plugin-relay` `^4.8.0` as an **optional**
peer — **peers, not deps**: Pothos plugins extend one `SchemaBuilder` class and
one `RootFieldBuilder` prototype, and graphql checks a schema's realm, so a
second copy of any of them breaks at runtime. **Outside the fixed version
group** — its majors track Pothos', not the family's.

## Cases and `Refusals`

A Pothos plugin (`unthrown`) whose fields are resolved by a `Result`. Each case
of the resolver's failure maps to a GraphQL error class through a `refusals`
record. A failure names its case by its `_tag` (a `TaggedError`), else its
`code` (an `ORPCError`, or any `code`-discriminated value); an optional string
`_tag` beside a `code` names the case whenever present, so both count.

- `Refusals<Failure>` is a mapped type over `CaseOf<Failure>`, exhaustive the
  way the error combinators' matcher is (Thesis #5): a missing case, an extra
  one, or a class whose constructor takes another case's failure does not
  compile. `FailureOf` keeps every member whose cases include the case, so a
  union-valued discriminant (`code: "A" | "B"`) keeps its type.
- A record, not a matcher callback: `@pothos/plugin-errors` builds the result
  union from `errors.types`, so the classes must be known as values.
- A resolver that cannot fail (`Failure` is `never`) takes an exactly empty
  record. Cases that cannot be enumerated — a pattern (`string`,
  `` `E_${string}` ``), alone or beside literals, or a `_tag` that may hold any
  string — make the record unsatisfiable. The `never` test is on `Failure`
  itself: while a context-sensitive `resolve` is still being inferred,
  `CaseOf` is `never` too, and an empty record there would reject every field.
- Every failure member must name a case: a field's resolver, and `outcomeOf`,
  answer `Failure & Caseable`. The constraint sits where `Failure` is inferred;
  intersecting a check into the options, or constraining the type parameter,
  is evaluated before a context-sensitive `resolve` is inferred and rejects
  valid fields. For the same reason a refusals map declared apart is not
  checked for extra keys by the type; the extra-case check is TypeScript's
  excess-property check, which `satisfies Refusals<Failure>` keeps.
- `Failure` is inferred from `resolve` alone (`refusals` is `NoInfer`).

At runtime `caseOf` reads a string `_tag`, else a string `code`, from an
object or a callable, and answers no case for anything else without throwing;
the refusal class is read as an own property of the record. Like core's matcher,
it reads `_tag` the plain way: no guard against a tag polluted onto
`Object.prototype` (a compromised process, which one lookup cannot defend), and
no reserved `__proto__` case (nobody names a failure that).

## How each variant surfaces

`answerOf` decides once, for both paths:

- `Ok` → the field's value. An `Ok` holding an `Error` (a loose static type let
  it through) is a defect: the errors plugin takes a returned `Error` for a
  refusal.
- `Err` → `new Refusal(error)`, **returned**, not thrown — the errors plugin
  answers a returned `Error` of a declared type as its union member (its
  `wrapResolve` checks `result instanceof Error` before its `catch`). Reading
  the case and building the refusal are one guarded step: a throwing getter or
  constructor is a defect, and so is a failure no refusal maps (only an
  unchecked cast can produce one), whose defect carries the failure. A
  constructor that answers anything but an `Error` of its own class is a
  defect too: the plugin could not place it.
- `Defect` → see below.

A resolver (`settle`, internal) is called inside a promise, so a synchronous
throw is a defect too. A defect is **thrown unclaimed**: as it is, unless one
of the classes the plugin answers on the field (its refusals, the builder's
`defaultTypes`) would claim it — then wrapped (`new Error("Defect", { cause })`),
or, when even that would be claimed (`defaultTypes: [Error]`), thrown as a
plain object GraphQL turns into an error of its own. Hiding a defect's message
is the server's job (Yoga masks by default; graphql-js alone does not), and the
docs say so. A `GraphQLError` cause is rethrown as it is — GraphQL's own signal
for an error meant for the client, which an integration (an oRPC bridge
answering "access refused") relies on — unless a handled class would claim it:
with a base `Error` in `defaultTypes` it is wrapped like any other defect, and
the client loses its message.

`outcomeOf` is the DataLoader twin: the same answer, but a defect is
**returned** as an `Error` (wrapped when a handled class would claim it), so
one key's bug does not reject the batch. It takes the builder's `defaultTypes`
as its third argument. A loader can only reject a key with an `Error`, so a
base `Error` among `defaultTypes` claims every loader defect — stated in its
TSDoc and the guide. The `instanceof` checks that classify a defect are guarded
(a proxy's `getPrototypeOf`, a `Symbol.hasInstance` may throw): an
unclassifiable cause counts as claimed.

## Field values

A field's `Ok` takes its output shape (`ResolvedShape`), which for a loadable
object already includes its key. A GraphQL list (`[Type]`, a `ListRef`) takes
any synchronous iterable of its items, each possibly a promise; list-ness comes
from the GraphQL type, not the TypeScript shape, so an array-shaped scalar
takes its array. Async iterables are left out: graphql 16 does not execute them
as lists. `resultConnection` infers the resolved connection (`ConnectionResult`)
from `resolve` and hands it to relay's connection, edge and errors options, so a
`totalCount` the resolver returns is typed where they read it; its nullability
defaults to the builder's, as `resultField`'s does.

## Entry points

Two, both side-effectful (listed in `sideEffects`): `.` registers the plugin
and `resultField` (declaration merge into `PothosSchemaTypes` plus a
`RootFieldBuilder.prototype` assignment, the packaging every Pothos plugin
uses) and exports `outcomeOf` and the types; `./relay` adds `resultConnection`
on top of `@pothos/plugin-relay`'s `connection`, kept apart so relay's types
are needed only by its importers. Both delegate through one `resultConfig` to
`t.field` / `t.connection`, keeping every other option — including the errors
plugin's own (`directResult`, `dataField`), whose `types` alone the refusals
replace. Errors options a connection inherits from relay's
`defaultConnectionFieldOptions` are merged, their types handled like the
refusals'. A field with no refusals, no errors options and no `defaultTypes` on
the builder stays a plain field rather than a one-member union. The errors
options' success shape is the non-null `ResolvedShape`, so a list's custom
success fields see the iterable the resolver answered. Neither method
resolves subscription fields — the errors plugin wraps `subscribe` before any
`Result` is settled — so on a subscription builder their options do not
compile.

## Tests

Specs run against a real Pothos schema executed with `graphql`; type tests
(`types.test-d.ts`) pin each compile-time guarantee with `@ts-expect-error`.
Vitest inlines `@pothos/*` (`server.deps.inline`): left external, Pothos would
build its schema with Node's copy of graphql while a spec's own
`import { graphql }` resolves Vite's, and graphql's realm check refuses it.
