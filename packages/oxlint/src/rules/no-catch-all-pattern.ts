import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { declaredReturnType } from "../helpers/declared-return-type.js";
import { getImportBinding } from "../helpers/get-import-binding.js";
import { hasTypeArguments } from "../helpers/has-type-arguments.js";
import { resolveResultType } from "../helpers/resolve-result-type.js";

// `P` is re-exported by core, but a codebase may also import it straight from
// ts-pattern — a `P._` from either is the same catch-all, so both count.
const SOURCES: ReadonlySet<string> = new Set(["unthrown", "ts-pattern"]);

// The universal patterns: unthrown's `P._`, plus ts-pattern's `P.any` alias.
// Both match anything, so both defeat exhaustive enumeration. Every other `P.*`
// is a *specific* matcher and is left alone.
//
// `any` is kept even though unthrown's own `P` no longer carries it: this rule
// also covers a `P` imported straight from ts-pattern, where the alias is very
// much alive, and dropping it would let that catch-all through unreported.
const CATCH_ALL_PROPS: ReadonlySet<string> = new Set(["_", "any"]);

/**
 * Disallow the matcher catch-all `P._` (and ts-pattern's `P.any` alias) in an
 * unthrown matcher. The exhaustive error matcher exists so every failure is
 * *accounted for by name* — a catch-all re-opens the blanket-handling hole it
 * closes, silently absorbing any error the union grows later.
 *
 * This rule states unthrown's own default: every error case is enumerated by
 * name (`.with(P.tag("A"), P.tag("B"), …, handler)`, grouping cases that share a
 * handler), and `P._` is an **escape hatch**, not the sanctioned way to handle
 * the error channel. Hence its place in the `recommended` preset.
 *
 * Two uses are irreducible, and the rule *exempts them itself* when the file
 * proves them (issue #230). A helper **generic in `E`**: no list of arms can
 * prove exhaustiveness against an unresolved type parameter, and only `P._`'s
 * state transition can. And an **`E` that is a single type** rather than a
 * union of cases — a validator's issues array, say — where one arm *is* the
 * enumeration. The proof is syntactic: the matcher is traced to its receiver
 * (the `mapErrCases`-family call or `match`'s `errCases`), and the receiver to
 * an in-file `Result` / `AsyncResult` annotation — a variable or parameter
 * annotation, or the return annotation of an in-file function being called.
 * When the annotated `E` is not a union (in-file aliases are seen through), the
 * catch-all is the legitimate single arm and nothing is reported:
 *
 * ```ts
 * const toApiError = <T, E>(result: Result<T, E>): Result<T, ApiError> =>
 *   result.mapErrCases((matcher) =>
 *     matcher.returnType<ApiError>().with(P._, (error) => new ApiError({ error })), // exempt: `E` is a type parameter
 *   );
 * ```
 *
 * Where no annotation is in reach — a receiver imported from another module,
 * say — the rule cannot prove anything and still reports; keep the targeted
 * `oxlint-disable` with a reason there. An `E` written as a single *named* type
 * whose union-ness hides behind an imported alias is deliberately exempt too:
 * one name is one abstraction, and enumerating its internal arms would reach
 * through it.
 *
 * Resolves `P` by its imported name via scope analysis, so a rename
 * (`import { P as Pattern }`) still fires and a decoy (`const P = …`) does not.
 * A namespace import (`import * as ns from "unthrown"; ns.P._`) is a documented
 * limit — the object is not a bare identifier binding.
 */
export const noCatchAllPattern = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow the `P._` catch-all (and ts-pattern's `P.any` alias) in an unthrown matcher — enumerate every error case by name. Exempt when an in-file `Result` annotation proves `E` is a single non-union type or an unresolved generic; elsewhere the escape hatch is a targeted `oxlint-disable`",
      recommended: true,
    },
    messages: {
      noCatchAll:
        'Unexpected `P.{{prop}}` catch-all. Enumerate every error case by name — `.with(P.tag("A"), P.tag("B"), …, handler)`, grouping cases that share a handler — so a new error can\'t be silently absorbed. If `E` really is a single non-union type (or a helper\'s type parameter), an in-file `Result<_, E>` annotation on the receiver proves it and silences this rule; where no annotation is in reach, keep a targeted `oxlint-disable` with a reason.',
    },
  },
  createOnce: (context) => {
    return {
      MemberExpression: (node) => {
        if (node.object.type !== "Identifier") return;

        // The catch-all is written `P._` / `P.any` (dot access) or `P["_"]` /
        // `P["any"]` (computed access with a string literal) — the same pattern
        // either way, so every spelling is flagged. A computed access with a dynamic key
        // (`P[k]`) is left alone: it can't be resolved statically.
        const prop =
          !node.computed && node.property.type === "Identifier"
            ? node.property.name
            : node.computed &&
                node.property.type === "Literal" &&
                typeof node.property.value === "string"
              ? node.property.value
              : undefined;
        if (prop === undefined || !CATCH_ALL_PROPS.has(prop)) return;

        const scope = context.sourceCode.getScope(node);
        const binding = getImportBinding(scope, node.object);
        if (!binding || binding.imported !== "P" || !SOURCES.has(binding.source)) return;

        if (isProvenSingleTypeArm(context, node)) return;

        context.report({
          node,
          messageId: "noCatchAll",
          data: { prop },
        });
      },
    };
  },
});

// The combinators whose matcher callback enumerates `E` — the surfaces where a
// proven single-type `E` legitimises the catch-all arm. The free `match(value)`
// form is absent on purpose: it matches the whole Result, not `E`.
const ERR_MATCHER_METHODS: ReadonlySet<string> = new Set([
  "mapErrCases",
  "flatMapErrCases",
  "recoverErrCases",
  "tapErrCases",
  "flatTapErrCases",
]);

/**
 * Whether this catch-all is the arm of a matcher whose `E` the file proves to
 * be a single non-union type (or an unresolved type parameter). The trace is
 * receiver-first and entirely syntactic: catch-all → its `.with(…)` chain →
 * the chain's root identifier → the first parameter of a callback passed to a
 * `*ErrCases` combinator or `match`'s `errCases` → that call's receiver → an
 * in-file `Result` / `AsyncResult` annotation → its `E` argument. Any link the
 * file does not spell out breaks the proof, and the rule reports as before.
 */
function isProvenSingleTypeArm(
  context: { sourceCode: SourceCodeLike },
  node: ESTree.MemberExpression,
): boolean {
  // The catch-all must be a direct argument of a `.with(…)` call.
  const withCall = node.parent;
  if (withCall.type !== "CallExpression" || !withCall.arguments.includes(node)) return false;
  const withCallee = withCall.callee;
  if (
    withCallee.type !== "MemberExpression" ||
    withCallee.computed ||
    withCallee.property.type !== "Identifier" ||
    withCallee.property.name !== "with"
  ) {
    return false;
  }

  // Descend the builder chain (`m.returnType<R>().with(…).with(…)`) to its root.
  let root: ESTree.Node = withCallee.object;
  while (
    root.type === "CallExpression" &&
    root.callee.type === "MemberExpression" &&
    !root.callee.computed &&
    root.callee.property.type === "Identifier" &&
    (root.callee.property.name === "with" || root.callee.property.name === "returnType")
  ) {
    root = root.callee.object;
  }
  if (root.type !== "Identifier") return false;

  // The root must be the matcher: the first parameter of a callback handed
  // directly to an error-matcher surface.
  const def = context.sourceCode.getScope(root).references.find((ref) => ref.identifier === root)
    ?.resolved?.defs[0];
  if (def?.type !== "Parameter") return false;
  const fn = def.node;
  if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") return false;
  if (fn.params[0]?.type !== "Identifier" || fn.params[0].name !== def.name.name) return false;

  const receiver = matcherReceiver(fn);
  if (receiver === undefined) return false;

  const errorType = annotatedErrorType(context, receiver);
  if (errorType === undefined) return false;

  return !resolvesToUnion(errorType, topLevelTypeAliases(context.sourceCode.ast), new Set());
}

/**
 * The expression the matcher callback's combinator is called on: `receiver` in
 * `receiver.mapErrCases((m) => …)` and in
 * `receiver.match({ errCases: (m) => … })`. `undefined` for any other context.
 */
function matcherReceiver(fn: ESTree.Node): ESTree.Node | undefined {
  const parent = fn.parent;
  if (!parent) return undefined;

  if (parent.type === "CallExpression" && parent.arguments[0] === fn) {
    const { callee } = parent;
    if (
      callee.type === "MemberExpression" &&
      !callee.computed &&
      callee.property.type === "Identifier" &&
      ERR_MATCHER_METHODS.has(callee.property.name)
    ) {
      return callee.object;
    }
    return undefined;
  }

  // Several node kinds share `type: "Property"`; `kind` narrows to the object
  // literal's own `ObjectProperty` (`{ errCases: (m) => … }`).
  if (
    parent.type === "Property" &&
    "kind" in parent &&
    parent.value === fn &&
    !parent.computed &&
    parent.key.type === "Identifier" &&
    parent.key.name === "errCases" &&
    parent.parent?.type === "ObjectExpression"
  ) {
    const handlers = parent.parent;
    const call = handlers.parent;
    if (call?.type !== "CallExpression" || call.arguments[0] !== handlers) return undefined;
    const { callee } = call;
    if (
      callee.type === "MemberExpression" &&
      !callee.computed &&
      callee.property.type === "Identifier" &&
      callee.property.name === "match"
    ) {
      return callee.object;
    }
  }

  return undefined;
}

/**
 * The `E` argument of the receiver's in-file `Result` / `AsyncResult`
 * annotation: a variable or parameter annotation for an identifier receiver, or
 * the declared return annotation of an in-file function for a call receiver.
 */
function annotatedErrorType(
  context: { sourceCode: SourceCodeLike },
  receiver: ESTree.Node,
): ESTree.TSType | undefined {
  const target = receiver.type === "AwaitExpression" ? receiver.argument : receiver;

  let annotation: ESTree.Node | undefined;
  if (target.type === "Identifier") {
    const def = context.sourceCode
      .getScope(target)
      .references.find((ref) => ref.identifier === target)?.resolved?.defs[0];
    if (def?.type === "Variable" && def.node.type === "VariableDeclarator") {
      annotation =
        def.node.id.type === "Identifier" ? def.node.id.typeAnnotation?.typeAnnotation : undefined;
    } else if (def?.type === "Parameter") {
      annotation = def.name.typeAnnotation?.typeAnnotation;
    }
  } else if (target.type === "CallExpression" && target.callee.type === "Identifier") {
    const { callee } = target;
    const def = context.sourceCode
      .getScope(callee)
      .references.find((ref) => ref.identifier === callee)?.resolved?.defs[0];
    if (def) annotation = declaredReturnType(def.node);
  }

  if (annotation?.type !== "TSTypeReference") return undefined;
  if (resolveResultType(context.sourceCode.getScope(annotation), annotation) === undefined) {
    return undefined;
  }
  if (!hasTypeArguments(annotation, 2)) return undefined;
  return annotation.typeArguments.params[1];
}

/**
 * Whether a type node is (or resolves, through in-file top-level aliases, to) a
 * union. Everything else — a named reference, a type parameter, an array or
 * object literal type — counts as a single type: one name is one abstraction,
 * even when an *imported* alias hides a union behind it.
 */
function resolvesToUnion(
  node: ESTree.TSType,
  aliases: ReadonlyMap<string, ESTree.TSType>,
  seen: Set<string>,
): boolean {
  if (node.type === "TSUnionType") return true;
  if (node.type === "TSParenthesizedType")
    return resolvesToUnion(node.typeAnnotation, aliases, seen);
  if (node.type === "TSTypeReference" && node.typeName.type === "Identifier") {
    const { name } = node.typeName;
    const target = aliases.get(name);
    if (target === undefined || seen.has(name)) return false;
    seen.add(name);
    return resolvesToUnion(target, aliases, seen);
  }
  return false;
}

/** The file's top-level `type X = …` declarations, exported or not. */
function topLevelTypeAliases(ast: ESTree.Program): Map<string, ESTree.TSType> {
  const aliases = new Map<string, ESTree.TSType>();
  for (const statement of ast.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "TSTypeAliasDeclaration" && declaration.id.type === "Identifier") {
      aliases.set(declaration.id.name, declaration.typeAnnotation);
    }
  }
  return aliases;
}

type SourceCodeLike = {
  getScope: (node: ESTree.Node) => Scope;
  ast: ESTree.Program;
};
