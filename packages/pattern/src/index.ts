import { match } from "ts-pattern";

import { ok } from "unthrown";

/**
 * Placeholder export. The `@unthrown/pattern` ts-pattern integration
 * (`P.tag` sugar + ok/err/defect adapter) is not implemented yet — see the
 * roadmap in CLAUDE.md. This exists so the package builds and the
 * `@unthrown` scope name is claimed.
 *
 * @internal
 */
export const __placeholder = { match, ok } as const;
