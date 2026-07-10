// @unthrown/orpc/extensions/result — the opt-in `.result()` builder method.
//
// Importing this module patches oRPC's builders (module augmentation + a
// prototype assignment, the packaging `@orpc/experimental-effect` uses for
// `.effect()`), so a procedure can be declared directly from a
// `Result`-returning handler:
//
//   import "@unthrown/orpc/extensions/result";
//
//   const find = os
//     .input(z.object({ id: z.string() }))
//     .errors({ NOT_FOUND: {} })
//     .result(({ input, errors }) =>
//       repo.findPlanet(input.id).mapErr(() => errors.NOT_FOUND()),
//     );
//
// This registration is a genuine import-time side effect — the one entry
// point of the package excluded from `sideEffects: false`. Prefer the plain
// `handlerResult(fn)` from `@unthrown/orpc/server` when patching a
// third-party prototype is unwelcome; the two are runtime-identical.
//
// Every builder state (`os`, after `.use`, after `.input`/`.output`) shares
// the one `Builder` class at runtime — the `BuilderWith*` interfaces are
// typed views over it — so two prototype assignments (`Builder`,
// `ProcedureImplementer`) cover the whole surface.

import {
  type AnyORPCError,
  type AnySchema,
  Builder,
  type Context,
  type DecoratedProcedure,
  type ErrorMap,
  type ImplementedProcedure,
  type InferSchemaInput,
  type InferSchemaOutput,
  type MergedContext,
  ProcedureImplementer,
  type Schema,
} from "@orpc/server";

import { handlerResult, type ResultHandler } from "../server.js";

// `Schema<void, unknown>` / `Schema<unknown>` spell out oRPC's
// `InitialInputSchema` / `InitialOutputSchema` aliases (not re-exported from
// `@orpc/server`) — the schema-less builder states.
// oxlint-disable typescript/consistent-type-definitions -- declaration merging into @orpc/server's builder declarations requires `interface`; a `type` cannot merge.
declare module "@orpc/server" {
  interface Builder<TInitialContext extends Context, TErrorMap extends ErrorMap> {
    /**
     * `.handler(handlerResult(fn))` as a builder method: declare the
     * procedure from a `Result`-returning handler. `Ok` is the output, `Err`
     * (an `ORPCError`) surfaces to the client fully typed, a `Defect` stays a
     * defect (`INTERNAL_SERVER_ERROR`).
     */
    result<TOutput, TError extends AnyORPCError>(
      handler: ResultHandler<TInitialContext, unknown, TOutput, TError, TErrorMap>,
    ): DecoratedProcedure<
      TInitialContext,
      object,
      Schema<void, unknown>,
      Schema<Exclude<TOutput, AnyORPCError>>,
      TErrorMap,
      TError | Extract<TOutput, AnyORPCError>
    >;
  }

  interface BuilderWithMiddlewares<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TErrorMap extends ErrorMap,
  > {
    /** {@inheritDoc Builder.result} */
    result<TOutput, TError extends AnyORPCError>(
      handler: ResultHandler<
        MergedContext<TInitialContext, TInjectedContext>,
        unknown,
        TOutput,
        TError,
        TErrorMap
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      Schema<void, unknown>,
      Schema<Exclude<TOutput, AnyORPCError>>,
      TErrorMap,
      TError | Extract<TOutput, AnyORPCError>
    >;
  }

  interface BuilderWithInput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    /** {@inheritDoc Builder.result} */
    result<TOutput, TError extends AnyORPCError>(
      handler: ResultHandler<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<TInputSchema>,
        TOutput,
        TError,
        TErrorMap
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      TInputSchema,
      Schema<Exclude<TOutput, AnyORPCError>>,
      TErrorMap,
      TError | Extract<TOutput, AnyORPCError>
    >;
  }

  interface BuilderWithOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    /** {@inheritDoc Builder.result} */
    result<TOutput extends InferSchemaInput<TOutputSchema>, TError extends AnyORPCError>(
      handler: ResultHandler<
        MergedContext<TInitialContext, TInjectedContext>,
        unknown,
        TOutput,
        TError,
        TErrorMap
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      Schema<void, unknown>,
      TOutputSchema,
      TErrorMap,
      TError | Extract<TOutput, AnyORPCError>
    >;
  }

  interface BuilderWithInputOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    /** {@inheritDoc Builder.result} */
    result<TOutput extends InferSchemaInput<TOutputSchema>, TError extends AnyORPCError>(
      handler: ResultHandler<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<TInputSchema>,
        TOutput,
        TError,
        TErrorMap
      >,
    ): DecoratedProcedure<
      TInitialContext,
      TInjectedContext,
      TInputSchema,
      TOutputSchema,
      TErrorMap,
      TError | Extract<TOutput, AnyORPCError>
    >;
  }

  interface ProcedureImplementer<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    /**
     * {@inheritDoc Builder.result}
     *
     * @remarks
     * Contract-first: the contract already declares the error map, so the
     * returned errors are not re-inferred onto the procedure type (same rule
     * as oRPC's own `.handler`).
     */
    result(
      handler: ResultHandler<
        MergedContext<TInitialContext, TInjectedContext>,
        InferSchemaOutput<TInputSchema>,
        InferSchemaInput<TOutputSchema>,
        AnyORPCError,
        TErrorMap
      >,
    ): ImplementedProcedure<
      TInitialContext,
      TInjectedContext,
      TInputSchema,
      TOutputSchema,
      TErrorMap
    >;
  }
}

// The runtime signatures are the widest instantiation; the `as` casts align
// them with the generic method declared above (the same one-place widening the
// blueprint adapter relies on — the generic contract is enforced at the call
// site by the augmented interfaces).
Builder.prototype.result = function (
  this: Builder<Context, ErrorMap>,
  handler: ResultHandler<Context, unknown, unknown, AnyORPCError, ErrorMap>,
) {
  return this.handler(handlerResult(handler));
} as Builder<Context, ErrorMap>["result"];

ProcedureImplementer.prototype.result = function (
  this: ProcedureImplementer<
    Context,
    Context,
    Schema<unknown, unknown>,
    Schema<unknown, unknown>,
    ErrorMap
  >,
  handler: ResultHandler<Context, unknown, unknown, AnyORPCError, ErrorMap>,
) {
  return this.handler(handlerResult(handler));
} as ProcedureImplementer<
  Context,
  Context,
  Schema<unknown, unknown>,
  Schema<unknown, unknown>,
  ErrorMap
>["result"];
