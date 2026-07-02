<!--
Thanks for contributing! Keep PRs focused on one concern.
See CONTRIBUTING.md for the full workflow.
-->

## What & why

<!-- What does this change and why? Link any related issue (Closes #123). -->

## Checklist

- [ ] The full gate passes locally: `pnpm format --check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build`
- [ ] Added/updated tests (and invariant guards / type-level tests if behaviour changed)
- [ ] Added a changeset (`pnpm changeset`) for any user-facing change
- [ ] Updated TSDoc and `CLAUDE.md` if the public surface or a design rule changed
- [ ] Commits follow Conventional Commits
