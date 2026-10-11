---
"unthrown": patch
---

Guard fromNullable's onAbsent factory: throws become defects, and async or thenable returns are rejected at compile time and at runtime. Discarded Promise rejections are silenced without starting lazy thenables.
