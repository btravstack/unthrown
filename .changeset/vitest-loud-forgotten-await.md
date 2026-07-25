---
"@unthrown/vitest": minor
---

**A forgotten `await` on an `AsyncResult` matcher is now loud.** The matchers
track in-flight assertions, and an `afterEach` hook (registered at module load,
alongside `expect.extend`) fails the test at its end naming the matchers still
pending — previously a forgotten `await` passed the test silently, at best
surfacing as a mis-attributed file-level unhandled rejection, at worst not at
all. The abandoned assertion is reported exactly once and can never late-fire
as an unhandled rejection. Also: a rejecting non-`AsyncResult` thenable now
produces the friendly "expected an unthrown Result" failure instead of
surfacing the raw rejection cause.
