import { expect } from "vitest";

import { ok } from "unthrown";

/**
 * Placeholder export. The `@unthrown/vitest` custom matchers (`toBeOk`,
 * `toBeOkWith`, `toBeErr`, `toBeErrTagged`, `toBeDefect`) are not implemented
 * yet — see the roadmap in CLAUDE.md. This exists so the package builds and the
 * `@unthrown` scope name is claimed.
 *
 * @internal
 */
export const __placeholder = { expect, ok } as const;
