---
"@unthrown/oxlint": patch
---

Raise the `oxlint` peerDependency floor from `^1.69.0` to `^1.74.0`, matching
the `@oxlint/plugins` runtime the rules are built against — a host older than
the plugin runtime was never a supported combination.
