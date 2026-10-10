// @unthrown/pothos — Pothos fields resolved by a `Result`.
//
// Importing this module registers the `unthrown` Pothos plugin and its
// `resultField` method (a declaration merge into Pothos' global types plus a
// prototype assignment, the packaging every Pothos plugin uses), so it is the
// package's side-effectful root entry:
//
//   import SchemaBuilder from "@pothos/core";
//   import ErrorsPlugin from "@pothos/plugin-errors";
//   import UnthrownPlugin from "@unthrown/pothos";
//
//   const builder = new SchemaBuilder({ plugins: [ErrorsPlugin, UnthrownPlugin] });
//
//   builder.queryField("book", (t) =>
//     t.resultField({
//       type: Book,
//       args: { title: t.arg.string({ required: true }) },
//       refusals: { NotFound: BookNotFound },
//       resolve: (_root, { title }) => library.find(title),
//     }),
//   );
//
// The resolver answers a `Result`; `refusals` names the GraphQL error class each
// case of its failure becomes. `@pothos/plugin-errors` builds the field's result
// union from those classes and answers a returned instance as its member — no
// throw. The mapping is checked like a matcher: a case left out does not compile.

import SchemaBuilder, {
  BasePlugin,
  RootFieldBuilder,
  type FieldKind,
  type FieldNullability,
  type FieldOptionsFromKind,
  type InputFieldMap,
  type InputShapeFromFields,
  type SchemaTypes,
  type ShapeFromTypeParam,
  type TypeParam,
} from "@pothos/core";
import type { ErrorFieldOptions } from "@pothos/plugin-errors";
import type { GraphQLResolveInfo } from "graphql";
import type { AsyncResult, Result } from "unthrown";

import {
  attempt,
  handledTypes,
  settle,
  typesOf,
  type Caseable,
  type Refusals,
} from "./refusals.js";

export {
  outcomeOf,
  settle,
  typesOf,
  type Caseable,
  type CaseOf,
  type Refusals,
} from "./refusals.js";

/**
 * A resolver answering a `Result`: Pothos' four resolver arguments, the
 * field's shape as the `Ok` value and `Failure` as the error channel.
 */
export type ResultResolver<
  Types extends SchemaTypes,
  Parent,
  Args extends InputFieldMap,
  Value,
  Failure,
> = (
  parent: Parent,
  args: InputShapeFromFields<Args>,
  context: Types["Context"],
  info: GraphQLResolveInfo,
) => Result<Value, Failure & Caseable> | AsyncResult<Value, Failure & Caseable>;

/**
 * `t.field`'s options with a `Result`-answering `resolve` and the `refusals`
 * its failure maps to. `errors` keeps `@pothos/plugin-errors`' other options
 * (`directResult`, `dataField`, …); its `types` are the refusals'.
 */
export type ResultFieldOptions<
  Types extends SchemaTypes,
  ParentShape,
  Type extends TypeParam<Types>,
  Nullable extends FieldNullability<Type>,
  Args extends InputFieldMap,
  Kind extends FieldKind,
  Failure,
> = Omit<
  FieldOptionsFromKind<Types, ParentShape, Type, Nullable, Args, Kind, ParentShape, unknown>,
  "resolve" | "errors"
> & {
  readonly errors?: Omit<
    ErrorFieldOptions<Types, Type, ShapeFromTypeParam<Types, Type, Nullable>, Nullable>,
    "types"
  >;
  readonly refusals: NoInfer<Refusals<Failure>>;
  readonly resolve: ResultResolver<
    Types,
    ParentShape,
    Args,
    ShapeFromTypeParam<Types, Type, Nullable>,
    Failure
  >;
};

class PothosUnthrownPlugin<Types extends SchemaTypes> extends BasePlugin<Types> {}

// oxlint-disable typescript/consistent-type-definitions, typescript/no-namespace -- declaration merging into Pothos' global types requires a namespace of interfaces; a `type` cannot merge.
declare global {
  export namespace PothosSchemaTypes {
    export interface Plugins<Types extends SchemaTypes> {
      unthrown: PothosUnthrownPlugin<Types>;
    }

    export interface RootFieldBuilder<
      Types extends SchemaTypes,
      ParentShape,
      Kind extends FieldKind = FieldKind,
    > {
      /**
       * A field resolved by a `Result`: `Ok` is the field's value; an `Err`
       * is answered as the refusal its case maps to, a member of the field's
       * result union (`@pothos/plugin-errors`); a `Defect` is thrown, an error
       * of the operation the server must mask (GraphQL Yoga does by default;
       * graphql-js alone does not).
       */
      resultField: <
        Type extends TypeParam<Types>,
        Failure,
        Nullable extends FieldNullability<Type> = Types["DefaultFieldNullability"],
        // oxlint-disable-next-line typescript/no-empty-object-type -- Pothos' own default for a field without arguments
        Args extends InputFieldMap = {},
      >(
        options: ResultFieldOptions<Types, ParentShape, Type, Nullable, Args, Kind, Failure>,
      ) => FieldRef<Types, ShapeFromTypeParam<Types, Type, Nullable>, Kind>;
    }
  }
}
// oxlint-enable typescript/consistent-type-definitions, typescript/no-namespace

const pluginName = "unthrown";

SchemaBuilder.registerPlugin(pluginName, PothosUnthrownPlugin);

const fieldBuilder = RootFieldBuilder.prototype as PothosSchemaTypes.RootFieldBuilder<
  SchemaTypes,
  unknown
>;

fieldBuilder.resultField = function resultField({ refusals, resolve, errors, ...options }) {
  return this.field({
    ...options,
    errors: { ...errors, types: typesOf(refusals) },
    resolve: async (parent: unknown, args: object, context: object, info: GraphQLResolveInfo) =>
      settle(
        attempt(() => resolve(parent, args as never, context, info)),
        refusals,
        handledTypes(refusals, this.builder.options.errors?.defaultTypes),
      ),
  } as never);
};

/** The plugin's name, as `SchemaBuilder`'s `plugins` option takes it. */
export default pluginName;
