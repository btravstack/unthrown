import { defineRule } from "@oxlint/plugins";

/**
 * Disallow `throw`. unthrown's thesis is errors-as-values: a modeled failure is
 * *returned* (`Err(...)`), never flung up the stack — only a true defect ever
 * throws, and the library's boundaries (`fromThrowable` / `fromPromise` / the
 * throw→defect net) own that channel. This rule bans the raw statement so the
 * sanctioned forms stand out:
 *
 * - a modeled failure → `return Err(...)`;
 * - a failure that is genuinely unmodeled here → route it to the defect
 *   channel in expression position:
 *   `.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"), (e) => defect(e))).get()`;
 * - a known-technical precondition throw → a plain helper wrapped once at its
 *   origin with `fromSafeThrowable`;
 * - a genuinely deliberate remaining `throw` site → a targeted
 *   `oxlint-disable` comment with a reason.
 *
 * Deliberately option-free and not autofixable — the disable comment is the
 * escape hatch. Opt-in (not part of the `recommended` preset): it bans a core
 * language statement, so it suits codebases that have committed to the
 * convention end-to-end.
 */
export const noThrow = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow `throw` statements — return `Err(...)` instead; only a true defect ever throws",
      recommended: false,
    },
    messages: {
      noThrow:
        'Unexpected `throw`. Return `Err(...)` for a modeled failure. When the failure is genuinely unmodeled here, route it to the defect channel in expression position — `.recoverErrCases((matcher, defect) => matcher.with(P.tag("…"), (e) => defect(e))).get()`. A known-technical precondition throw belongs in a plain helper wrapped once with `fromSafeThrowable`; a genuinely deliberate `throw` carries a targeted `oxlint-disable` with a reason.',
    },
  },
  createOnce: (context) => {
    return {
      ThrowStatement: (node) => {
        context.report({ node, messageId: "noThrow" });
      },
    };
  },
});
