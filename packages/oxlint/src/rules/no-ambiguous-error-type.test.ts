import { ruleTester } from "../tester.js";
import { noAmbiguousErrorType } from "./no-ambiguous-error-type.js";

ruleTester.run("no-ambiguous-error-type", noAmbiguousErrorType, {
  valid: [
    // A concrete domain error.
    { code: `import type { Result } from "unthrown";\ntype T = Result<number, MyError>;` },
    // `never` is an intentionally error-free result.
    { code: `import type { Result } from "unthrown";\ntype T = Result<number, never>;` },
    // A string-literal union is concrete.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, "not_found" | "denied">;`,
    },
    // A populated object type is concrete.
    { code: `import type { Result } from "unthrown";\ntype T = Result<number, { code: number }>;` },
    // A `Result` from another library is none of our business.
    { code: `import type { Result } from "neverthrow";\ntype T = Result<number, unknown>;` },
    // Same for another library's namespace.
    { code: `import type * as N from "neverthrow";\ntype T = N.Result<number, unknown>;` },
    // A qualified name that isn't Result/AsyncResult is not ours to police.
    { code: `import type * as U from "unthrown";\ntype T = U.OkView<number, unknown>;` },
    // A default import is not the named `Result` binding.
    { code: `import R from "unthrown";\ntype T = R<number, unknown>;` },
    // A user's own `type Error` is not the ambiguous global — resolve by scope,
    // not by name. (Regression guard for the bare-`Error` false positive.)
    {
      code: `import type { Result } from "unthrown";\ntype Error = { code: number };\ntype T = Result<number, Error>;`,
    },
    // A generic parameter literally named `Error` is a concrete type variable.
    {
      code: `import type { Result } from "unthrown";\nfunction f<Error>(): Result<number, Error> { throw 0; }`,
    },
    // A generic error parameter `E` is concrete — never treat it as ambiguous.
    {
      code: `import type { Result } from "unthrown";\nfunction f<E>(): Result<number, E> { throw 0; }`,
    },
    // A LOCAL name `Result` that is actually a rename of something else is not
    // unthrown's Result type — resolution goes through the *imported* name.
    // (Regression guard for the local-name false positive.)
    {
      code: `import { Ok as Result } from "unthrown";\ntype T = Result<number, unknown>;`,
    },
    // Alias indirection is a documented syntactic limit: the rule sees the
    // type *argument* as written; an alias that resolves to `unknown` is not
    // followed. Pinned valid on purpose — see the Linting guide.
    {
      code: `import type { Result } from "unthrown";\ntype E = unknown;\ntype T = Result<number, E>;`,
    },

    // --- matcher `.returnType<R>()` pins ------------------------------------
    // A pin only declares `E` in `mapErrCases`. Everywhere else the builder's
    // output is something other than the error channel, so an ambiguous pin is
    // legitimate and must NOT be reported.
    //
    // `recoverErrCases` — the output is the new SUCCESS type.
    { code: `const x = r.recoverErrCases((m) => m.returnType<unknown>().with(P._, (e) => e));` },
    // `tapErrCases` — the branch results are discarded.
    { code: `const x = r.tapErrCases((m) => m.returnType<void>().with(P._, () => undefined));` },
    // `match`'s `errCases` — the output is a folded value.
    {
      code: `const x = r.match({ ok: (v) => v, defect: () => 0, errCases: (m) => m.returnType<unknown>().with(P._, (e) => e) });`,
    },
    // A standalone `match(value)` — likewise a folded value.
    { code: `const x = match(v).returnType<unknown>().with(P._, (e) => e).exhaustive();` },
    // `flatMapErrCases` / `flatTapErrCases` — the builder output must be a
    // `Result`, so a *bare* ambiguous pin does not type-check in the first
    // place; the rule leaves it to `tsc` rather than double-reporting. An
    // ambiguous type NESTED in the pin is caught by the type-reference visitor
    // (see the invalid cases below).
    { code: `const x = r.flatMapErrCases((m) => m.returnType<unknown>().with(P._, (e) => e));` },
    { code: `const x = r.flatTapErrCases((m) => m.returnType<unknown>().with(P._, (e) => e));` },
    // A concrete pin is the whole point of `returnType`.
    { code: `const x = r.mapErrCases((m) => m.returnType<MyError>().with(P._, (e) => e));` },
    // `never` is an intentionally error-free output, as in the `E` position.
    {
      code: `const x = r.mapErrCases((m) => m.returnType<never>().with(P._, (e) => { throw e; }));`,
    },
    // The pin must be on the MATCHER — the callback's first parameter. The
    // second is the injected `defect` helper.
    { code: `const x = r.mapErrCases((m, defect) => defect.returnType<unknown>());` },
    // An unrelated `returnType` call on something that is not a matcher
    // parameter is none of the rule's business.
    { code: `const x = builder.returnType<unknown>();` },
    // …nor is a `returnType` call carrying no type argument at all.
    { code: `const x = r.mapErrCases((m) => m.returnType().with(P._, (e) => e));` },
    // A parameter of an ordinary function is not a matcher handed out by a
    // combinator, whatever it is named.
    { code: `function outer(m) { return m.returnType<unknown>(); }` },
    // A callback passed to a plain (non-method) call is not a combinator's.
    { code: `const x = wrap((m) => m.returnType<unknown>().with(P._, (e) => e));` },
    // Documented syntactic limits — pinned valid on purpose (see the Linting
    // guide): a matcher copied into another variable…
    {
      code: `const x = r.mapErrCases((m) => { const b = m; return b.returnType<unknown>().with(P._, (e) => e); });`,
    },
    // …and a callback declared elsewhere and passed by reference.
    {
      code: `const cb = (m) => m.returnType<unknown>().with(P._, (e) => e);\nconst x = r.mapErrCases(cb);`,
    },
  ],
  invalid: [
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, any>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, Error>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, {}>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // The primitive / non-domain keywords are all ambiguous, not just any/unknown.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, string>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, object>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, null>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { AsyncResult } from "unthrown";\ntype T = AsyncResult<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // An ambiguous member taints a union.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, MyError | unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, Error | MyError>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // Inner scope — a function return-type annotation. Locks that the import
    // source resolves from a nested scope (regression guard for scope analysis).
    {
      code: `import type { Result } from "unthrown";\nfunction f(): Result<number, unknown> { throw 0; }`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // Inner scope — a type alias declared inside a function body.
    {
      code: `import type { Result } from "unthrown";\nfunction f() { type T = Result<number, any>; return null as unknown as T; }`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // Inner scope — a nested block.
    {
      code: `import type { Result } from "unthrown";\n{ type T = Result<number, Error>; }`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // `void` says nothing about the domain either.
    {
      code: `import type { Result } from "unthrown";\ntype T = Result<number, void>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // A renamed import is still unthrown's Result — resolution goes through
    // the *imported* name. (Regression guard for the rename false negative.)
    {
      code: `import type { Result as R } from "unthrown";\ntype T = R<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { AsyncResult as AR } from "unthrown";\ntype T = AR<number, any>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    // A namespace import's qualified name resolves too.
    {
      code: `import type * as U from "unthrown";\ntype T = U.Result<number, unknown>;`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },

    // --- matcher `.returnType<R>()` pins ------------------------------------
    // In `mapErrCases` the builder's output IS the new error channel, so an
    // ambiguous pin re-opens Thesis #1 through a type ARGUMENT — a position the
    // annotation visitor above never sees.
    {
      code: `const x = r.mapErrCases((m) => m.returnType<unknown>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    {
      code: `const x = r.mapErrCases((m) => m.returnType<any>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    {
      code: `const x = r.mapErrCases((m) => m.returnType<Error>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    {
      code: `const x = r.mapErrCases((m) => m.returnType<{}>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    {
      code: `const x = r.mapErrCases((m) => m.returnType<string>().with(P._, (e) => e._tag));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    // An ambiguous member taints a union pin, as in the `E` position.
    {
      code: `const x = r.mapErrCases((m) => m.returnType<MyError | unknown>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    // The `defect` parameter's presence changes nothing.
    {
      code: `const x = r.mapErrCases((m, defect) => m.returnType<unknown>().with(P._, (e) => defect(e)));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    // A `function` expression callback, not just an arrow.
    {
      code: `const x = r.mapErrCases(function (m) { return m.returnType<unknown>().with(P._, (e) => e); });`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    // The matcher referenced from a nested arrow inside the same callback still
    // resolves to the `mapErrCases` parameter (scope analysis, not proximity).
    {
      code: `const x = r.mapErrCases((m) => wrap(() => m.returnType<unknown>().with(P._, (e) => e)));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    // The async surface shares the method name, so it is covered as-is.
    {
      code: `const x = ar.mapErrCases((m) => m.returnType<unknown>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousReturnTypePin" }],
    },
    // A `Result<U, E2>` pin on the flat combinators carries `E` in its own
    // second type argument — the type-reference visitor already sees it, in a
    // type argument just as in an annotation. (Locks that coverage.)
    {
      code: `import type { Result } from "unthrown";\nconst x = r.flatMapErrCases((m) => m.returnType<Result<number, unknown>>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
    {
      code: `import type { Result } from "unthrown";\nconst x = r.flatTapErrCases((m) => m.returnType<Result<never, Error>>().with(P._, (e) => e));`,
      errors: [{ messageId: "noAmbiguousErrorType" }],
    },
  ],
});
