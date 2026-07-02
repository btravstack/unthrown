---
"unthrown": patch
---

Mark shipped packages as `"sideEffects": false` so bundlers can prune between
modules (all except `@unthrown/vitest`, whose `expect.extend` registration is a
genuine import-time effect). Also: `AsyncResult.unwrapOrElse` now delegates to the
sync eliminator (guarding the "unwrapOr\* throws on a Defect" invariant), `all`
short-circuits once a Defect is found, and `tapDefect`'s throw-to-Defect behaviour
is documented.
