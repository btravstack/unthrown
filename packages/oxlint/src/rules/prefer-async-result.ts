import type { ESTree, Scope } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

import { hasNamedImport } from "../helpers/has-named-import.js";
import { hasTypeArguments } from "../helpers/has-type-arguments.js";
import { isIdentifierTypeName } from "../helpers/is-identifier-type-name.js";
import { isLocallyBound } from "../helpers/is-locally-bound.js";
import { resolveResultType } from "../helpers/resolve-result-type.js";

const MODULE = "unthrown";

/**
 * Whether a `Promise<Result<…>>` annotation sits in the return position of a
 * function *type* (`() => Promise<Result<…>>`, `{ load(): Promise<Result<…>> }`).
 * A report there carries no autofix: the implementer may be an `async` function
 * the rule can't see, and an `async` function must return a native `Promise` —
 * rewriting the annotation to `AsyncResult<…>` could not compile. (A
 * `TSTypeAnnotation` directly under a function type is always its return type;
 * parameter annotations hang off the parameter patterns.)
 */
const isFunctionTypeReturn = (node: ESTree.TSTypeReference): boolean => {
  const annotation = node.parent;
  return (
    annotation.type === "TSTypeAnnotation" &&
    (annotation.parent.type === "TSFunctionType" || annotation.parent.type === "TSMethodSignature")
  );
};

/**
 * The `unthrown` import declaration whose specifier list the fix can extend,
 * or `undefined` when there is none to extend.
 *
 * Requires at least one `ImportSpecifier`: the insertion is anchored after the
 * last one, so a bare `import "unthrown"` or a namespace/default-only import
 * offers nothing to insert after. A namespace import is deliberately not
 * handled — `U.AsyncResult` is reachable, but rewriting the annotation to a
 * qualified name is a different edit from the one this rule makes.
 *
 * Only the *program body* is scanned: an import declaration is only legal at
 * the top level, so there is nowhere else for one to be.
 */
const unthrownImport = (program: ESTree.Program): ESTree.ImportDeclaration | undefined =>
  program.body.find(
    (statement): statement is ESTree.ImportDeclaration =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === MODULE &&
      statement.specifiers.some((specifier) => specifier.type === "ImportSpecifier"),
  );

/**
 * Whether the NAME `AsyncResult` already resolves to a declaration in scope —
 * a type alias, an interface, a type parameter, or an import of something else
 * under that local name.
 *
 * Distinct from {@link isLocallyBound}, which matches a specific identifier
 * node by reference identity: here there is no node to match, because the name
 * is one the fix would *introduce*. A hit means adding an `AsyncResult`
 * specifier would collide with an existing binding rather than resolve it, so
 * the fix must stay withheld.
 */
const nameIsTaken = (scope: Scope): boolean => {
  for (let current: Scope | null = scope; current; current = current.upper) {
    const variable = current.variables.find((v) => v.name === "AsyncResult");
    if (variable) return variable.defs.length > 0;
  }
  return false;
};

/**
 * Prefer unthrown's `AsyncResult<T, E>` over `Promise<Result<T, E>>`. A raw
 * `Promise<Result>` can *reject*, reintroducing the throw channel `AsyncResult`
 * is designed to eliminate — so the wrapper is both shorter and stronger.
 *
 * Autofixable. When `AsyncResult` is not already in scope the fix **adds the
 * specifier** to an existing `unthrown` import as well as rewriting the
 * annotation — the common case, since a file that imports `Result` trips the
 * rule without ever having needed `AsyncResult`. The added specifier carries a
 * `type` qualifier unless the declaration is already `import type { … }`, so
 * the fix never turns a types-only import into a value one (which under
 * `verbatimModuleSyntax` would emit a runtime import the file never had).
 *
 * The fix is withheld in four situations, each because applying it would
 * produce code that does not compile or does not mean what it says:
 *
 * - an `async` function's own return annotation, and the return type of a
 *   function *type* (the implementer may be `async`) — both must stay a native
 *   `Promise`; see {@link isFunctionTypeReturn};
 * - the name `AsyncResult` is already bound to something else, so adding a
 *   specifier would collide rather than resolve — see {@link nameIsTaken};
 * - there is no `unthrown` import with a specifier list to extend, which in
 *   practice means a namespace import (`import * as U from "unthrown"`) —
 *   `U.AsyncResult` is reachable, but rewriting to a qualified name is a
 *   different edit; see {@link unthrownImport}.
 */
export const preferAsyncResult = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer `AsyncResult<T, E>` over `Promise<Result<T, E>>`",
      recommended: true,
    },
    messages: {
      preferAsyncResult: "Use `AsyncResult<T, E>` instead of `Promise<Result<T, E>>`.",
    },
    fixable: "code",
  },
  createOnce: (context) => {
    // Spans of return-type annotations on `async` functions: a report inside
    // one carries no autofix, because an `async` function must return a
    // native `Promise` — rewriting the annotation to `AsyncResult<…>` would
    // not compile. Function nodes are visited before their return-type
    // children, so the set is populated in time.
    const asyncReturnSpans = new Set<string>();
    const trackAsyncFunction = (node: ESTree.Function | ESTree.ArrowFunctionExpression) => {
      if (node.async && node.returnType) {
        const t = node.returnType.typeAnnotation;
        asyncReturnSpans.add(`${t.start}:${t.end}`);
      }
    };

    return {
      // Spans are file-relative, but `createOnce` runs once per lint *run* (not
      // per file) — without a reset, a non-async annotation in a later file at
      // the same offsets as an earlier file's async one would wrongly lose its
      // autofix, and the set would grow unbounded across a whole project lint.
      before: () => {
        asyncReturnSpans.clear();
      },
      FunctionDeclaration: trackAsyncFunction,
      FunctionExpression: trackAsyncFunction,
      ArrowFunctionExpression: trackAsyncFunction,
      TSTypeReference: (node) => {
        if (!isIdentifierTypeName(node, ["Promise"])) return;
        if (!hasTypeArguments(node, 1)) return;

        const inner = node.typeArguments.params[0];
        if (inner.type !== "TSTypeReference") return;
        if (!hasTypeArguments(inner, 2)) return;

        const scope = context.sourceCode.getScope(node);
        // A locally-declared `Promise` (a user's own type alias or a generic
        // parameter literally named `Promise`) is not the global — same
        // resolve-by-scope rule as the bare-`Error` check next door.
        if (isLocallyBound(scope, node.typeName)) return;
        if (resolveResultType(scope, inner) !== "Result") return;

        // Withhold the fix when this annotation is an `async` function's
        // return type (see the `asyncReturnSpans` comment above) or a function
        // *type*'s return position (the implementer may be `async` — see
        // `isFunctionTypeReturn`). Both must stay a native `Promise`.
        const inAsyncReturn = asyncReturnSpans.has(`${node.start}:${node.end}`);
        const positionAllowsFix = !inAsyncReturn && !isFunctionTypeReturn(node);

        // `AsyncResult` already in scope under that name → rewrite alone.
        const imported = hasNamedImport(scope, "AsyncResult", MODULE);
        // Otherwise the fix can still apply, by ALSO adding the specifier to an
        // existing `unthrown` import — the common case, since a file importing
        // `Result` trips the rule without ever having needed `AsyncResult`.
        //
        // Two things must hold. `AsyncResult` must not be locally bound to
        // something else: a shadowing declaration means adding a specifier
        // would collide rather than help, so the fix stays withheld (the
        // `hasNamedImport` check above is stricter than "is bound", so a
        // *decoy* import like `Ok as AsyncResult` lands here too). And there
        // must be a specifier list to extend — see `unthrownImport`.
        //
        // A file with NO `unthrown` import at all is deliberately out of scope:
        // inserting a whole import statement raises placement and `import type`
        // questions this rule should not answer.
        const declaration =
          imported || nameIsTaken(scope) ? undefined : unthrownImport(context.sourceCode.ast);
        const canFix = positionAllowsFix && (imported || declaration !== undefined);

        context.report({
          node,
          messageId: "preferAsyncResult",
          ...(canFix && {
            fix: (fixer) => {
              const value = context.sourceCode.getText(inner.typeArguments.params[0]);
              const error = context.sourceCode.getText(inner.typeArguments.params[1]);
              const rewrite = fixer.replaceText(node, `AsyncResult<${value}, ${error}>`);
              if (declaration === undefined) return rewrite;
              // Anchor on the LAST specifier rather than the brace, so the
              // insertion is indifferent to spacing and to whether the existing
              // specifiers are `type`-qualified individually.
              const specifiers = declaration.specifiers.filter(
                (specifier) => specifier.type === "ImportSpecifier",
              );
              const last = specifiers[specifiers.length - 1];
              // `unthrownImport` only returns a declaration with at least one
              // ImportSpecifier, so `last` is present; the guard is here
              // because `noUncheckedIndexedAccess` types the access as
              // possibly-undefined.
              if (last === undefined) return rewrite;
              // Carry a `type` qualifier unless the declaration is already
              // `import type { … }`, where every specifier is a type and
              // repeating it is a syntax error.
              //
              // This matters under `verbatimModuleSyntax` (which this repo's
              // shared tsconfig enables): adding a bare `AsyncResult` to a
              // value declaration like `import { type Result } from "unthrown"`
              // makes the declaration value-bearing, so TypeScript emits a
              // runtime `import "unthrown"` the file never had — an autofix
              // that silently adds a runtime dependency to a types-only module.
              const qualifier = declaration.importKind === "type" ? "" : "type ";
              return [rewrite, fixer.insertTextAfter(last, `, ${qualifier}AsyncResult`)];
            },
          }),
        });
      },
    };
  },
});
