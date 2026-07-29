---
"@unthrown/oxlint": patch
---

Restore the `oxlint` peerDependency floor to `^1.69.0`, undoing the `^1.74.0`
raise shipped in `5.0.0-beta.10`. That raise was mechanical — it synced the peer
to the `@oxlint/plugins` version the package builds against, not to a host API
the rules actually need — and beta.10's plugin bundle is byte-identical to
beta.9's apart from a dropped sourcemap comment.

The rules only ever touch `context.report` (with `fix`), `context.sourceCode`,
`getScope`, and `defineConfig` from `oxlint`; all five rules and the
`prefer-async-result` autofix were re-verified against an `oxlint@1.69.0` host.

The tighter range was expensive downstream: under `strictPeerDependencies` it
failed installs outright, and satisfying it cascaded into `oxlint@1.74.0` →
`oxlint-tsgolint@0.24.0`, dragging a lint _and_ type-check engine upgrade across
every consuming project for a packaging-only release.

The peer floor now names the oldest host the rules are verified on, decoupled
from the `@oxlint/plugins` dependency, with a regression test guarding the
decoupling.
