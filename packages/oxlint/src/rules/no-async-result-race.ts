import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, Variable } from "@oxlint/plugins";

import { declaredReturnType } from "../helpers/declared-return-type.js";
import { getImportBinding } from "../helpers/get-import-binding.js";
import { resolveResultType } from "../helpers/resolve-result-type.js";

const MODULE = "unthrown";

// The `AsyncResult`-producing free functions core exports — the sync producers
// are deliberately absent: a `Result` holds a settled value, so two sibling
// `Ok(...)`s cannot race.
const ASYNC_FREE_PRODUCERS: ReadonlySet<string> = new Set([
  "OkAsync",
  "ErrAsync",
  "DoAsync",
  "fromPromise",
  "fromSafePromise",
  "fromExecutor",
  "allAsync",
  "allFromDictAsync",
]);

// The producing members of the `AsyncResult` facade companion.
const COMPANION_PRODUCERS: ReadonlySet<string> = new Set([
  "Ok",
  "Err",
  "Do",
  "fromExecutor",
  "fromPromise",
  "fromSafePromise",
  "all",
  "allFromDict",
]);

/**
 * Whether `callee` resolves to a locally-declared function whose declared
 * return type is unthrown's `AsyncResult` — `Result` is excluded on purpose:
 * only the async form starts work at construction.
 */
const isLocalAsyncResultFunction = (
  scope: Scope,
  callee: ESTree.Node,
  getScope: (node: ESTree.Node) => Scope,
): boolean => {
  const def = scope.references.find((ref) => ref.identifier === callee)?.resolved?.defs[0];
  if (!def) return false;
  const returnType = declaredReturnType(def.node);
  if (returnType?.type !== "TSTypeReference") return false;
  return resolveResultType(getScope(returnType), returnType) === "AsyncResult";
};

/**
 * Whether an initializer eagerly constructs an `AsyncResult`: its leftmost
 * call — walked through a combinator chain, so `OkAsync(1).flatMap(f)` roots
 * at `OkAsync(1)` — is an unthrown async free producer, an
 * `AsyncResult.<producer>` companion member, or a locally-declared function
 * whose return annotation is unthrown's `AsyncResult`. A producer inside a
 * nested function is NOT a construction — the closure defers it, which is
 * exactly the lazy spelling the combinators exist for.
 */
const isConstruction = (
  scope: Scope,
  node: ESTree.Node,
  getScope: (node: ESTree.Node) => Scope,
): boolean => {
  if (node.type !== "CallExpression") return false;
  const { callee } = node;
  if (callee.type === "Identifier") {
    const binding = getImportBinding(scope, callee);
    if (binding) return binding.source === MODULE && ASYNC_FREE_PRODUCERS.has(binding.imported);
    return isLocalAsyncResultFunction(scope, callee, getScope);
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    if (callee.object.type === "Identifier" && callee.property.type === "Identifier") {
      const binding = getImportBinding(scope, callee.object);
      if (binding?.source === MODULE && binding.imported === "AsyncResult") {
        return COMPANION_PRODUCERS.has(callee.property.name);
      }
    }
    // A combinator chain: root the check on what the chain hangs off.
    return isConstruction(scope, callee.object, getScope);
  }
  return false;
};

type Construction = {
  readonly name: string;
  readonly variable: Variable;
  /** The declarator's own identifier — a WRITE reference in scope analysis, excluded from consumption. */
  readonly id: ESTree.Node;
  /** Where the work starts — the initializer, which is where the race is reported. */
  readonly init: ESTree.Node;
  readonly start: number;
  /** `await`ed at construction: consumed on the spot, so it can trigger a report but never be raced against. */
  readonly awaited: boolean;
};

/**
 * Disallow the sibling-`const` `AsyncResult` sequence — the one spelling that
 * type-checks, returns a `Result`, and still races. An `AsyncResult` is
 * EAGER: constructing it starts the work, so
 *
 * ```ts
 * const a = repository.save(order);   // work already in flight
 * const b = outbox.append(event);    // ← starts concurrently with `a`
 * return a.flatMap(() => b);
 * ```
 *
 * reads as a sequence and runs as a race. The rule reports the later
 * construction while an earlier sibling binding in the same statement list is
 * still unconsumed — unless the two are first consumed TOGETHER in one
 * statement (`allAsync([a, b])`, a chain touching both), which is the
 * sanctioned join rather than a race. Deliberate start-both-await-both
 * concurrency is still reported: its sanctioned spelling is `allAsync([...])`
 * in one statement, and a site that genuinely wants the manual form carries a
 * targeted `oxlint-disable` with a reason.
 *
 * Purely syntactic: a construction is recognised by unthrown's own async
 * producers, the `AsyncResult` companion, a local function whose return
 * annotation is unthrown's `AsyncResult`, or a declarator annotated with it —
 * a method call on a service only the type checker could resolve is a
 * documented miss, and the annotation is its opt-in.
 */
export const noAsyncResultRace = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow starting a sibling `AsyncResult` while an earlier one is still unconsumed — eager construction makes the sequence a race",
      recommended: true,
    },
    messages: {
      noAsyncResultRace:
        "`{{ later }}` starts while `{{ earlier }}` is still unconsumed — an `AsyncResult` is eager, so this reads as a sequence and runs as a race. Chain them (`{{ earlier }}.flatTap(…)` / `flatMap` / `DoAsync().bind`), or make the concurrency explicit with `allAsync([…])` in one statement.",
    },
  },
  createOnce: (context) => {
    const getScope = (node: ESTree.Node) => context.sourceCode.getScope(node);

    /**
     * The first DIRECT reference consuming a construction — its own declarator
     * write excluded, and so is every reference inside a nested function: a
     * closure defers the read, which is precisely how `a.flatMap(() => b)`
     * consumes `b` without sequencing its already-started work. Deferral is
     * scope, not position: the reference's nearest function scope must be the
     * binding's own.
     */
    const firstDirectRef = (construction: Construction): number | undefined =>
      construction.variable.references
        .filter(
          (ref) =>
            ref.identifier !== construction.id &&
            ref.from.variableScope === construction.variable.scope.variableScope,
        )
        .map((ref) => ref.identifier.range[0])
        .sort((a, b) => a - b)[0];

    const check = (body: readonly ESTree.Statement[]): void => {
      const constructions: Construction[] = [];
      for (const statement of body) {
        if (statement.type !== "VariableDeclaration") continue;
        for (const declarator of statement.declarations) {
          if (declarator.id.type !== "Identifier" || !declarator.init) continue;
          const awaited = declarator.init.type === "AwaitExpression";
          const init =
            declarator.init.type === "AwaitExpression" ? declarator.init.argument : declarator.init;
          const scope = getScope(declarator);
          const annotated =
            declarator.id.typeAnnotation?.typeAnnotation.type === "TSTypeReference" &&
            resolveResultType(
              getScope(declarator.id.typeAnnotation.typeAnnotation),
              declarator.id.typeAnnotation.typeAnnotation,
            ) === "AsyncResult";
          if (!annotated && !isConstruction(scope, init, getScope)) continue;
          const variable = scope.set.get(declarator.id.name);
          if (!variable) continue;
          constructions.push({
            name: declarator.id.name,
            variable,
            id: declarator.id,
            init: declarator.init,
            start: declarator.init.range[0],
            awaited,
          });
        }
      }
      if (constructions.length < 2) return;

      /** The index of the top-level statement containing a source position. */
      const statementAt = (position: number): number =>
        body.findIndex((s) => s.range[0] <= position && position <= s.range[1]);

      for (const [index, later] of constructions.entries()) {
        // The LATEST earlier violation, so one fault yields one report.
        const earlier = constructions
          .slice(0, index)
          .reverse()
          .find((candidate) => {
            if (candidate.awaited) return false;
            const consumedAt = firstDirectRef(candidate);
            // Directly consumed before the later construction ENDS: an
            // ordinary sequence — or consumption by the construction itself
            // (`OkAsync(a)`, `allAsync([a, b])` as an initializer), which is a
            // join rather than a race. A DEFERRED reference does not count:
            // `a.flatMap(() => b)` reads as sequencing `b` and does not.
            if (consumedAt !== undefined && consumedAt < later.init.range[1]) return false;
            // Both first consumed DIRECTLY in one later statement:
            // `return allAsync([a, b])` — the explicit join. Not when the
            // later construction was awaited: its references are of the
            // settled `Result`, joining nothing.
            const laterConsumedAt = later.awaited ? undefined : firstDirectRef(later);
            if (
              consumedAt !== undefined &&
              laterConsumedAt !== undefined &&
              statementAt(consumedAt) !== -1 &&
              statementAt(consumedAt) === statementAt(laterConsumedAt)
            ) {
              return false;
            }
            return true;
          });
        if (!earlier) continue;
        context.report({
          node: later.init,
          messageId: "noAsyncResultRace",
          data: { earlier: earlier.name, later: later.name },
        });
      }
    };

    return {
      Program: (node) => check(node.body),
      BlockStatement: (node) => check(node.body),
    };
  },
});
