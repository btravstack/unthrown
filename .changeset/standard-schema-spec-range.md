---
"@unthrown/standard-schema": patch
---

Publish the `@standard-schema/spec` dependency as `^1.1.0` instead of an exact
pin, so it can dedupe with a consumer's own copy of the (types-only) spec
package.
