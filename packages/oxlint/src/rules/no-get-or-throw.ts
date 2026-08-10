import { defineRule } from "@oxlint/plugins";

/**
 * Disallow `getOrThrow()`. It extracts `T` but **throws the modeled error
 * as-is** on `Err` — abandoning errors-as-values at the very last step, and
 * with it every guarantee the exhaustive matcher bought upstream. A caller of
 * the enclosing function sees a throw, not a channel.
 *
 * The replacement folds the error channel instead:
 *
 * ```ts
 * result
 *   .recoverErrCases((matcher, defect) =>
 *     matcher.with(P.tag("NotFound"), (e) => defect(e)),
 *   )
 *   .get();
 * ```
 *
 * `recoverErrCases` empties `E`, so `.get()` compiles; a case routed to
 * `defect(...)` panics with its original cause. Every case must still be
 * named, which is the point — `getOrThrow()` skips that decision entirely.
 *
 * `getOrThrow()` remains legitimate in **tests and scripts**, where "this
 * `Result` had better be `Ok`" is the assertion and a throw is the correct
 * failure mode. The rule is deliberately option-free: exempt those files with
 * oxlint's own `overrides` — an entry whose `files` globs your test paths and
 * turns this rule `"off"` — which is the host's mechanism for exactly this and
 * works with any test-file convention. The package README and the "Lint your
 * codebase" guide both carry a copy-pasteable config. (It is deliberately not
 * inlined here: a recursive glob contains `*` followed by `/`, which would
 * close this block comment, and escaping it would ship a sample that is wrong
 * the moment anyone copies it.)
 *
 * Purely syntactic, like the rest of the plugin: a **zero-argument**
 * `.getOrThrow()` member call, with no receiver typing. The arity is the
 * discriminator that matters — Effect's `Option.getOrThrow(self)` /
 * `Either.getOrThrow(self)` are data-first and take one argument, so a
 * codebase using both libraries stays clean. Two documented misses, both
 * deliberate evasions rather than accidents: a computed access
 * (`r["getOrThrow"]()`) and a detached reference (`const f = r.getOrThrow`).
 *
 * Opt-in (not part of the `recommended` preset): it is a whole-codebase
 * commitment, and — uniquely among the plugin's rules — an existing test suite
 * does not pass until an `overrides` entry is added. It pairs with `no-throw`;
 * with both on there is no escape left, which is the point.
 *
 * No autofix — the replacement requires enumerating every error case by hand.
 */
export const noGetOrThrow = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow `getOrThrow()` — it throws the modeled error, abandoning errors-as-values at the last step; fold the error channel with `recoverErrCases` + `get` instead",
      recommended: false,
    },
    messages: {
      noGetOrThrow:
        'Unexpected `getOrThrow()`. It throws the modeled error, abandoning errors-as-values at the last step. Fold the error channel instead — `.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"), (e) => defect(e)))` empties `E`, so `.get()` compiles and a case routed to `defect(...)` panics with its original cause. `getOrThrow()` belongs in tests; exempt them with an `overrides` entry for your test glob.',
    },
  },
  createOnce: (context) => {
    return {
      CallExpression: (node) => {
        // unthrown's `getOrThrow()` takes no arguments. Effect's
        // `Option.getOrThrow(self)` / `Either.getOrThrow(self)` are data-first
        // and take one — this is what keeps them out of the report.
        if (node.arguments.length > 0) return;

        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          // A computed access is a documented miss, not a target.
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "getOrThrow"
        )
          return;

        context.report({ node, messageId: "noGetOrThrow" });
      },
    };
  },
});
