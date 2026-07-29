import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { getImportBinding } from "../helpers/get-import-binding.js";

const MODULE = "unthrown";

// The success/failure constructors, in both their free and pre-lifted async
// spellings. A gate reads the same on either surface — `ensure` exists on both.
const OK_NAMES: ReadonlySet<string> = new Set(["Ok", "OkAsync"]);
const ERR_NAMES: ReadonlySet<string> = new Set(["Err", "ErrAsync"]);

// The facade companions carry the same constructors (`Result.Ok(...)`,
// `AsyncResult.Err(...)`), with the `Async` suffix dropped.
const COMPANIONS: ReadonlySet<string> = new Set(["Result", "AsyncResult"]);

type Producer = "ok" | "err";

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

const isFunction = (node: ESTree.Node): boolean =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

/** The AST children of a node — every nested node value, minus the `parent` back-edge. */
const childNodes = (node: ESTree.Node): ESTree.Node[] => {
  const children: ESTree.Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) children.push(item);
    } else if (isNode(value)) children.push(value);
  }
  return children;
};

/**
 * Which unthrown constructor a call expression is, resolved through the
 * *imported* name — so a rename resolves and a same-named local does not. The
 * receiver of the `flatMap` is deliberately NOT checked (that needs types): the
 * constructors carry the evidence.
 */
const classifyProducer = (scope: Scope, call: ESTree.CallExpression): Producer | undefined => {
  const { callee } = call;

  if (callee.type === "Identifier") {
    const binding = getImportBinding(scope, callee);
    if (binding?.source !== MODULE) return undefined;
    if (OK_NAMES.has(binding.imported)) return "ok";
    if (ERR_NAMES.has(binding.imported)) return "err";
    return undefined;
  }

  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.property.type === "Identifier"
  ) {
    const binding = getImportBinding(scope, callee.object);
    if (binding?.source !== MODULE || !COMPANIONS.has(binding.imported)) return undefined;
    if (callee.property.name === "Ok") return "ok";
    if (callee.property.name === "Err") return "err";
  }

  return undefined;
};

type Producers = {
  /** The `Ok(...)` calls in the callback's own body. */
  ok: ESTree.CallExpression[];
  /** How many `Err(...)` calls the body makes — one gate each. */
  errors: number;
  /** Whether any constructor call sits inside a *nested* function. */
  nested: boolean;
};

/**
 * Collect the constructor calls under `node`, separating the callback's own
 * body from anything inside a nested function — a nested `Ok`/`Err` belongs to
 * another callback's control flow, and any such call makes the body too complex
 * to call a gate.
 */
const collectProducers = (
  node: ESTree.Node,
  nested: boolean,
  found: Producers,
  classify: (call: ESTree.CallExpression) => Producer | undefined,
): void => {
  if (node.type === "CallExpression") {
    const kind = classify(node);
    if (kind !== undefined) {
      if (nested) found.nested = true;
      else if (kind === "ok") found.ok.push(node);
      else found.errors++;
    }
  }
  const inNested = nested || isFunction(node);
  for (const child of childNodes(node)) collectProducers(child, inNested, found, classify);
};

/**
 * Whether `identifier` is a read of `parameter` itself — resolved through scope
 * analysis, so a shadowing binding of the same name does not count — and the
 * parameter is never **reassigned**. A reassigned parameter is the one real
 * false positive the shape admits:
 *
 * ```ts
 * .flatMap((x) => { x = normalize(x); return c ? Ok(x) : Err(e); })
 * ```
 *
 * Every `Ok(...)` is literally `Ok(x)`, yet the value reaching it is not the
 * one `ensure` would pass through.
 */
const isUntouchedParameter = (
  scope: Scope,
  identifier: ESTree.Node,
  parameter: ESTree.Node,
): boolean => {
  const variable = scope.references.find((ref) => ref.identifier === identifier)?.resolved;
  const def = variable?.defs[0];
  if (!variable || def?.type !== "Parameter" || def.name !== parameter) return false;
  return !variable.references.some((ref) => ref.isWrite());
};

/**
 * Prefer `ensure` over a `flatMap` that is really a validation gate — a
 * callback whose success branch returns **its own parameter, untouched**:
 *
 * ```ts
 * // a predicate wearing a bind costume
 * .flatMap((user) => (user.active ? Ok(user) : Err(new Inactive({ id: user.id }))))
 *
 * // the same gate, named
 * .ensure(
 *   (user) => user.active,
 *   (user) => new Inactive({ id: user.id }),
 * )
 * ```
 *
 * `ensure` states the intent, and passes the *same* `Ok` through when the
 * predicate holds where the `flatMap` form allocates a fresh one on every
 * success. A body with several guards is several `ensure`s, chained.
 *
 * Anchored on the constructors, not on the method name: the `Ok(...)` /
 * `Err(...)` calls must resolve to `unthrown` imports (the pre-lifted
 * `OkAsync` / `ErrAsync` and the facade members `Result.Ok(...)` /
 * `AsyncResult.Err(...)` included). The receiver of the `flatMap` is not
 * checked — that would need type information — so the constructors carry the
 * whole of the evidence.
 *
 * Conservative by construction, and **not** autofixable. The rewrite is not
 * mechanical: `c ? Err(e) : Ok(x)` needs the condition negated, and `ensure`'s
 * boolean form requires a `boolean` predicate where a truthiness guard
 * (`x.name && x.count`) is a perfectly good `flatMap` condition and a type
 * error as a predicate. The report names the shape; the rewrite is written by
 * hand.
 *
 * Deliberately out of scope: an absence guard followed by a projection
 * (`if (doc === null) return Err(...); return Ok(project(doc))`). That is a
 * bind that opens with a null check, `fromNullable` answers it just as
 * idiomatically as a type-guard `ensure`, and the rewrite needs a hand-written
 * `doc is NonNullable<typeof doc>` annotation no syntactic rule can derive.
 *
 * Opt-in (not part of the `recommended` preset): unlike the preset's rules,
 * the shape it flags violates no thesis — it is correct code with a better name
 * available.
 */
export const preferEnsure = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer `ensure` over a `flatMap` that only gates its own parameter — a predicate wearing a bind costume",
      recommended: false,
    },
    messages: {
      preferEnsure:
        "This `flatMap` is a validation gate — its success branch returns `{{ parameter }}` untouched. Write it as `ensure(predicate, onFail)`: the intent is named, and a passing value flows through as the *same* `Ok` instead of a freshly allocated one.",
      preferEnsureChained:
        "This `flatMap` is a chain of {{ count }} validation gates — every success branch returns `{{ parameter }}` untouched. Write it as one `ensure(predicate, onFail)` per guard, chained: the intent is named, and a passing value flows through as the *same* `Ok` instead of a freshly allocated one.",
    },
  },
  createOnce: (context) => {
    const getScope = (node: ESTree.Node) => context.sourceCode.getScope(node);

    return {
      CallExpression: (node) => {
        // Cheap pre-filter — the evidence is the constructors below.
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "flatMap"
        )
          return;

        const [callback] = node.arguments;
        if (
          node.arguments.length !== 1 ||
          callback === undefined ||
          (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression")
        )
          return;

        // One parameter, bound to a plain name: a destructured or defaulted
        // parameter cannot be handed back untouched as `Ok(x)`.
        const [parameter] = callback.params;
        if (callback.params.length !== 1 || parameter?.type !== "Identifier") return;

        const body = callback.body;
        if (body === null) return;

        const found: Producers = { ok: [], errors: 0, nested: false };
        collectProducers(body, false, found, (call) => classifyProducer(getScope(call), call));

        // A gate returns the value on success and fails otherwise — both
        // channels must be present, and neither may hide in a nested callback.
        if (found.nested || found.ok.length === 0 || found.errors === 0) return;

        // Every success must be the parameter itself, handed back untouched.
        const gates = found.ok.every((call) => {
          const [argument] = call.arguments;
          return (
            call.arguments.length === 1 &&
            argument?.type === "Identifier" &&
            isUntouchedParameter(getScope(argument), argument, parameter)
          );
        });
        if (!gates) return;

        context.report({
          node: callee.property,
          messageId: found.errors === 1 ? "preferEnsure" : "preferEnsureChained",
          data: { parameter: parameter.name, count: String(found.errors) },
        });
      },
    };
  },
});
