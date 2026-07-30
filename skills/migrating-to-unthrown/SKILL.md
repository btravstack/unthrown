---
name: migrating-to-unthrown
description: Use when migrating a codebase, package, or module from neverthrow or Boxed (@bloodyowl/boxed) to unthrown — porting ok/err/ResultAsync/andThen/mapErr/orElse/safeTry or Option/Future/AsyncData code, planning an incremental multi-file migration, deciding what an old `E = Error`/`unknown` becomes, or keeping not-yet-migrated callers compiling mid-migration.
---

# Migrating to unthrown

Port neverthrow or Boxed code to unthrown consistently, at repo scale.

**REQUIRED BACKGROUND:** the `unthrown` skill (write/review unthrown code). This
skill adds only what a _migration_ needs on top: the policy decided once up
front, the mid-migration seam, and the per-source mapping tables — so eighty
files get the same answers, not eighty locally-reasonable ones.

Full docs: https://btravstack.github.io/unthrown/ (how-to guides
"Migrate from neverthrow" / "Migrate from Boxed" are the human-facing pages of
this skill).

## Decide once, before the first file

These questions recur in every file. Answer them once, write the answers down
(a `MIGRATION.md` in the repo works), and apply them mechanically — do not
re-derive per file.

1. **Per boundary: model or defect?** The old code blanket-cast rejections
   (`(e) => e as Error`). For each boundary kind (db driver, http client,
   JSON.parse, …), ask: **does anything recover from this error today**
   (an `orElse`, `unwrapOr`, `getWithDefault`, a rendered fallback)?
   - Recovered → model it: a `TaggedError` with `{ cause: unknown }` payload
     (the `@unthrown/prisma` `DriverError` pattern). Behavior is preserved.
   - Never recovered, only logged/500'd → `defect(cause)`. That blanket path
     _is_ the defect channel now.
   - Mixed per cause → triage in `qualify`: named case for the recoverable
     causes, `defect(cause)` for the rest.
2. **Error classes are exported.** Under exhaustive matching, a function's
   error union is part of its public contract — callers need the classes for
   `P.tag(…)` arms. Export them next to the function.
3. **Tag naming + payload conventions.** Pick them now (payloads carry typed
   fields, never `message`; `cause: unknown` is legal). One collision-safe
   scheme beats eighty ad-hoc ones.
4. **Boxed only — where does UI state live?** `AsyncData` has no unthrown
   target. Decide once: hand-rolled `{ tag: "NotAsked" | "Loading" | "Done" }`
   union, or keep Boxed's `AsyncData` in the view layer holding an unthrown
   `Result` in `Done`. Never both.

## Migration order and the seam

Migrate **module by module, dependency-leaves first**, keeping the build green
after every file:

1. Add the bridge package once: `@unthrown/neverthrow` or `@unthrown/boxed`.
2. Migrate a module fully (see the mapping reference for the source library).
3. **Untouched callers keep compiling through a seam**: a small compat file
   that re-exports the migrated functions under their _legacy_ type
   (`toNeverthrowAsync(result, onDefect)` / `toBoxedFuture(result, onDefect)`).
   `onDefect` is mandatory — fold the defect into the legacy blanket `Error`
   to reproduce pre-migration behavior exactly, and mark the seam file as the
   quarantined un-triage point. Incoming still-legacy dependencies lift with
   `fromNeverthrow(Async)` / `fromBoxed` / `fromBoxedFuture` (never a Defect —
   two-channel sources).
4. Ratchet with lint: enable `@unthrown/oxlint`'s `recommended` preset on
   migrated paths — it catches the migration's characteristic leftovers
   (`E = Error`/`unknown`, dropped results, `P._` blanket arms).
5. When a seam's last legacy caller migrates: delete the seam file, grep for
   its import and the `to*`/`from*` bridge calls, drop the bridge (and the old
   library once nothing imports it).

## Verify each file

- `tsc` against the real packages — every migrated file must compile clean
  under `strict` before moving on.
- Grep for names that no longer exist (they signal an incomplete port, not a
  missing import): `unwrap`, `unwrapOr`, `orElse`, `andThen`, `mapErr(`,
  `safeTry`, `okAsync`, `errAsync`, `matchTags`, `Option.`, `getWithDefault`,
  `mapOk`, `fromExecution`.
- Behavior deltas to state in the PR, not discover in prod: extractors panic
  on a Defect (old code may have swallowed bugs into a fallback), and throws
  inside combinators now surface at `match`'s `defect` arm instead of
  escaping.

## References

- **[references/from-neverthrow.md](references/from-neverthrow.md)** — the
  neverthrow→unthrown mapping table, the `mapErr`/`orElse`/`safeTry`/`match`
  rewrites, the `combineWithAllErrors` gap, and a worked seam.
- **[references/from-boxed.md](references/from-boxed.md)** — the Boxed→unthrown
  mapping table (Result, Future, statics), the `Option` decision tree, and the
  `AsyncData`/`retry`/`concurrent` gaps.
