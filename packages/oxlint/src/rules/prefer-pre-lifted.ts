import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { getImportBinding, importedName } from "../helpers/get-import-binding.js";
import { isLocallyBound } from "../helpers/is-locally-bound.js";

const MODULE = "unthrown";

/** The pre-lifted twin of each constructor this rule rewrites. */
const PRE_LIFTED = { Ok: "OkAsync", Err: "ErrAsync" } as const;

/**
 * The `unthrown` import declaration whose specifier list the fix can extend.
 * A namespace import has none, so it yields `undefined` and the fix stays
 * withheld rather than rewriting to a qualified name — a different edit.
 *
 * A types-only `import type { … }` is skipped even though it has specifiers:
 * the fix adds a VALUE, and a specifier added there is a type-only binding
 * used at runtime, which does not compile. A file can carry both declarations
 * — a types-only one first and the value one below — so this picks by kind,
 * never by position.
 */
const unthrownImport = (program: ESTree.Program): ESTree.ImportDeclaration | undefined =>
  program.body.find(
    (statement): statement is ESTree.ImportDeclaration =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === MODULE &&
      statement.importKind !== "type" &&
      statement.specifiers.some((specifier) => specifier.type === "ImportSpecifier"),
  );

/**
 * What the pre-lifted NAME already resolves to in scope. There is no node to
 * match by reference identity, because the name is one the fix would
 * introduce — so the lookup is by name up the scope chain, and the answer
 * decides between three different fixes:
 *
 * - `"imported"` — it is already unthrown's own `OkAsync`/`ErrAsync`, so the
 *   fix rewrites and adds nothing;
 * - `"taken"` — it is bound to something else, so adding a specifier would
 *   collide and the rewrite would resolve to the wrong value. Withhold;
 * - `"free"` — nothing holds the name, so the fix rewrites AND adds the
 *   specifier.
 */
const nameStatus = (scope: Scope, name: string): "imported" | "taken" | "free" => {
  for (let current: Scope | null = scope; current; current = current.upper) {
    const variable = current.variables.find((v) => v.name === name);
    if (!variable) continue;
    const def = variable.defs[0];
    if (def === undefined) continue;
    // A type-only binding of the right name is NOT the value the rewrite
    // needs — `import type { OkAsync }` compiles until something calls it.
    // Both spellings count: the whole declaration, and the single specifier.
    const isOwnValueImport =
      def.parent?.type === "ImportDeclaration" &&
      def.parent.source.value === MODULE &&
      def.parent.importKind !== "type" &&
      def.node.type === "ImportSpecifier" &&
      def.node.importKind !== "type" &&
      importedName(def.node.imported) === name;
    return isOwnValueImport ? "imported" : "taken";
  }
  return "free";
};

/**
 * Disallow `.toAsync()` on a **freshly constructed** `Ok(...)` / `Err(...)`.
 * `OkAsync(value)` and `ErrAsync(error)` are what unthrown ships for this;
 * `Ok(value).toAsync()` builds a `Result` and immediately throws it away for
 * its async twin.
 *
 * ```ts
 * Ok(value).toAsync(); // → OkAsync(value)
 * Err(error).toAsync(); // → ErrAsync(error)
 * Ok().toAsync(); // → OkAsync()
 * Ok(undefined).toAsync(); // → OkAsync()
 * ```
 *
 * **The receiver is the whole test**, which is what makes this rule safe where
 * `prefer-ensure` was not. `prefer-ensure` had to decide whether an `Ok(x)`
 * inside a callback carried the same `x` the callback was handed — an identity
 * judgement across a scope, and the source of its false positives. Here the
 * question is syntactic: a call to the imported `Ok` or `Err`, immediately
 * followed by `.toAsync()`. There is no context in which that spelling is
 * intended, so there is no case to exempt.
 *
 * `.toAsync()` on anything else is the combinator doing its job and is never
 * reported — a variable, a function's return, a ternary, a `fromNullable(...)`.
 * That is the majority use and it lifts a `Result` that already exists.
 *
 * The constructors are resolved through **scope**, not by name: a rename
 * (`Ok as ok`) still reports, and a decoy (`someOtherOk` from another module)
 * does not. Two documented misses, both deliberate evasions rather than
 * accidents: the namespace form (`u.Ok(v).toAsync()`, whose callee is a member
 * expression rather than the imported identifier) and a computed access
 * (`Ok(v)["toAsync"]()`).
 *
 * Autofixable: the replacement is the callee's pre-lifted name with the
 * arguments untouched, and the empty-argument and literal-`undefined` forms
 * collapsing to `OkAsync()`. When the pre-lifted name is not already in scope
 * the fix ALSO adds the specifier to the existing `unthrown` import — the
 * common case, since a file constructing `Ok(...)` has no reason to have
 * imported `OkAsync`. It is withheld when there is no VALUE specifier list to
 * extend — a namespace import, or an `unthrown` import that is types-only,
 * since a value specifier added to `import type { … }` would not compile.
 *
 * The fix adds a specifier but never prunes one: rewriting the last `Ok(...)`
 * in a file leaves the now-unused `Ok` import for `no-unused-vars` to report,
 * which is visible rather than silent. And since every fix in a file also edits
 * that file's import, oxlint lands them a few per pass — `--fix` wants running
 * until it reports nothing.
 *
 * Opt-in (not part of the `recommended` preset): it is a spelling preference
 * rather than a thesis about correctness, and a consumer who does not share it
 * should not be forced into it.
 */
export const preferPreLifted = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Disallow `.toAsync()` on a freshly constructed `Ok(...)` / `Err(...)` — use the pre-lifted `OkAsync(...)` / `ErrAsync(...)`",
      recommended: false,
    },
    messages: {
      preferPreLifted:
        "Unexpected `{{ constructor }}(…).toAsync()`. Building a `Result` only to lift it is what `{{ preLifted }}(…)` is for. `.toAsync()` is for lifting a `Result` that already exists.",
    },
  },
  createOnce: (context) => {
    return {
      CallExpression: (node) => {
        // `.toAsync()` takes no arguments; anything else is a different method.
        if (node.arguments.length > 0) return;

        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          // A computed access is a documented miss, not a target.
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "toAsync"
        )
          return;

        // The receiver must be a call to `Ok` or `Err` — a bare identifier
        // callee, so the namespace form falls out here by design.
        const receiver = callee.object;
        if (receiver.type !== "CallExpression" || receiver.callee.type !== "Identifier") return;

        const scope = context.sourceCode.getScope(receiver.callee);
        const binding = getImportBinding(scope, receiver.callee);
        if (binding?.source !== "unthrown") return;

        const preLifted = PRE_LIFTED[binding.imported as keyof typeof PRE_LIFTED];
        if (preLifted === undefined) return;

        const status = nameStatus(scope, preLifted);
        const declaration = status === "free" ? unthrownImport(context.sourceCode.ast) : undefined;
        const specifiers = declaration?.specifiers.filter(
          (specifier) => specifier.type === "ImportSpecifier",
        );
        const last = specifiers?.[specifiers.length - 1];
        const canFix = status === "imported" || last !== undefined;

        context.report({
          node,
          messageId: "preferPreLifted",
          data: { constructor: binding.imported, preLifted },
          ...(canFix && {
            fix: (fixer) => {
              // `Ok()` and `Ok(undefined)` are the same value, and `OkAsync()`
              // is how unthrown spells it.
              const [first] = receiver.arguments;
              const args =
                first === undefined || isGlobalUndefined(scope, first)
                  ? ""
                  : receiver.arguments
                      .map((argument) => context.sourceCode.getText(argument))
                      .join(", ");
              const rewrite = fixer.replaceText(node, `${preLifted}(${args})`);
              // Anchor on the LAST specifier rather than the brace, so the
              // insertion is indifferent to spacing.
              if (last === undefined) return rewrite;
              return [rewrite, fixer.insertTextAfter(last, `, ${preLifted}`)];
            },
          }),
        });
      },
    };
  },
});

/**
 * Whether an argument is the global `undefined` — `Ok(undefined)` is `Ok()`.
 *
 * `undefined` is not a reserved word, so a parameter or a `let` can shadow it
 * (`(undefined) => Ok(undefined).toAsync()`), and collapsing THAT to
 * `OkAsync()` would silently discard the value. Resolution goes through scope
 * for the same reason the bare-`Error` check does.
 */
const isGlobalUndefined = (scope: Scope, argument: ESTree.Node): boolean =>
  argument.type === "Identifier" &&
  argument.name === "undefined" &&
  !isLocallyBound(scope, argument);
