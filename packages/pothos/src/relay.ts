// @unthrown/pothos/relay — `resultConnection`, a Relay connection resolved by
// a `Result`. Importing this module adds the method to Pothos' field builder,
// next to `@pothos/plugin-relay`'s `connection`, which it builds on; it needs
// the root plugin (`@unthrown/pothos`) and `@pothos/plugin-relay` registered.

import {
  RootFieldBuilder,
  type FieldKind,
  type FieldNullability,
  type FieldOptionsFromKind,
  type InferredFieldOptionKeys,
  type InputFieldMap,
  type InputFieldsFromShape,
  type InputShapeFromFields,
  type InterfaceParam,
  type OutputType,
  type SchemaTypes,
  type ShapeFromTypeParam,
} from "@pothos/core";
import type { ErrorFieldOptions } from "@pothos/plugin-errors";
import type { ConnectionShapeForType, DefaultConnectionArguments } from "@pothos/plugin-relay";
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

type ConnectionArgs<Types extends SchemaTypes, Args extends InputFieldMap> = InputFieldsFromShape<
  Types,
  DefaultConnectionArguments,
  "Arg"
> &
  // oxlint-disable-next-line typescript/no-empty-object-type -- mirrors `@pothos/plugin-relay`'s own connection arguments
  (InputFieldMap extends Args ? {} : Args);

type ConnectionOf<
  Types extends SchemaTypes,
  Type extends OutputType<Types>,
  EdgeNullability extends FieldNullability<[unknown]>,
  NodeNullability extends boolean,
> = ConnectionShapeForType<Types, Type, false, EdgeNullability, NodeNullability>;

type FieldOptions<
  Types extends SchemaTypes,
  ParentShape,
  Type extends OutputType<Types>,
  Nullable extends boolean,
  Args extends InputFieldMap,
  Kind extends FieldKind,
> = FieldOptionsFromKind<
  Types,
  ParentShape,
  Type,
  Nullable,
  ConnectionArgs<Types, Args>,
  Kind,
  ParentShape,
  unknown
>;

/**
 * `t.connection`'s options with a `Result`-answering `resolve` (its `Ok` is the
 * connection) and the `refusals` its failure maps to.
 */
export type ResultConnectionOptions<
  Types extends SchemaTypes,
  ParentShape,
  Type extends OutputType<Types>,
  Nullable extends boolean,
  EdgeNullability extends FieldNullability<[unknown]>,
  NodeNullability extends boolean,
  Args extends InputFieldMap,
  Kind extends FieldKind,
  Failure,
  ConnectionResult extends ConnectionOf<Types, Type, EdgeNullability, NodeNullability> =
    ConnectionOf<Types, Type, EdgeNullability, NodeNullability>,
> = Omit<
  FieldOptions<Types, ParentShape, Type, Nullable, Args, Kind>,
  "args" | "type" | "errors" | InferredFieldOptionKeys
> & {
  readonly type: Type;
  readonly args?: Args;
  readonly edgesNullable?: EdgeNullability;
  readonly nodeNullable?: NodeNullability;
  readonly errors?: Omit<
    ErrorFieldOptions<
      Types,
      Type,
      ConnectionOf<Types, Type, EdgeNullability, NodeNullability>,
      Nullable
    >,
    "types"
  >;
  readonly refusals: NoInfer<Refusals<Failure>>;
  readonly resolve: (
    parent: ParentShape,
    args: DefaultConnectionArguments & InputShapeFromFields<Args>,
    context: Types["Context"],
    info: GraphQLResolveInfo,
  ) =>
    | Result<
        Nullable extends true ? ConnectionResult | null | undefined : ConnectionResult,
        Failure & Caseable
      >
    | AsyncResult<
        Nullable extends true ? ConnectionResult | null | undefined : ConnectionResult,
        Failure & Caseable
      >;
};

// oxlint-disable typescript/consistent-type-definitions, typescript/no-namespace -- declaration merging into Pothos' global types requires a namespace of interfaces; a `type` cannot merge.
declare global {
  export namespace PothosSchemaTypes {
    export interface RootFieldBuilder<
      Types extends SchemaTypes,
      ParentShape,
      Kind extends FieldKind = FieldKind,
    > {
      /**
       * A Relay connection resolved by a `Result`: `Ok` is the connection; an
       * `Err` is answered as the refusal its case maps to; a `Defect` is
       * thrown, an error of the operation the server must mask.
       */
      resultConnection: <
        Type extends OutputType<Types>,
        Failure,
        Nullable extends boolean,
        // oxlint-disable-next-line typescript/no-empty-object-type -- Pothos' own default for a field without arguments
        Args extends InputFieldMap = {},
        EdgeNullability extends FieldNullability<[unknown]> = Types["DefaultEdgesNullability"],
        NodeNullability extends boolean = Types["DefaultNodeNullability"],
        ConnectionResult extends ConnectionOf<Types, Type, EdgeNullability, NodeNullability> =
          ConnectionOf<Types, Type, EdgeNullability, NodeNullability>,
        const ConnectionInterfaces extends InterfaceParam<Types>[] = [],
        const EdgeInterfaces extends InterfaceParam<Types>[] = [],
      >(
        options: Kind extends "Subscription"
          ? { readonly "resultConnection does not resolve subscription fields": never }
          : ResultConnectionOptions<
              Types,
              ParentShape,
              Type,
              Nullable,
              EdgeNullability,
              NodeNullability,
              Args,
              Kind,
              Failure,
              ConnectionResult
            >,
        connectionOptions?:
          | ObjectRef<
              Types,
              ConnectionShapeForType<Types, Type, false, EdgeNullability, NodeNullability>
            >
          | Omit<
              ConnectionObjectOptions<
                Types,
                Type,
                EdgeNullability,
                NodeNullability,
                ConnectionResult,
                ConnectionInterfaces
              >,
              "edgesNullable"
            >,
        edgeOptions?:
          | ConnectionEdgeObjectOptions<
              Types,
              Type,
              NodeNullability,
              ConnectionResult,
              EdgeInterfaces
            >
          | ObjectRef<
              Types,
              { cursor: string; node?: ShapeFromTypeParam<Types, Type, NodeNullability> }
            >,
      ) => FieldRef<
        Types,
        ConnectionShapeForType<Types, Type, Nullable, EdgeNullability, NodeNullability>
      >;
    }
  }
}
// oxlint-enable typescript/consistent-type-definitions, typescript/no-namespace

const fieldBuilder = RootFieldBuilder.prototype as PothosSchemaTypes.RootFieldBuilder<
  SchemaTypes,
  unknown
>;

fieldBuilder.resultConnection = function resultConnection(
  fieldOptions,
  connectionOptions,
  edgeOptions,
) {
  // A subscription builder's options never reach here: they do not compile.
  const { refusals, resolve, errors, ...options } = fieldOptions as Extract<
    typeof fieldOptions,
    { readonly refusals: unknown }
  >;
  return this.connection(
    {
      ...options,
      errors: { ...errors, types: typesOf(refusals) },
      resolve: async (parent: unknown, args: object, context: object, info: GraphQLResolveInfo) =>
        settle(
          attempt(() => resolve(parent, args as never, context, info)),
          refusals,
          handledTypes(refusals, this.builder.options.errors?.defaultTypes),
        ),
    } as never,
    connectionOptions as never,
    edgeOptions as never,
  );
};
