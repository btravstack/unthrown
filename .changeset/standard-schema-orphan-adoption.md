---
"@unthrown/standard-schema": patch
---

`fromSchema`: when a sync-declared schema returns a thenable (the documented
deliberate `TypeError`), the in-flight validation promise is now adopted before
throwing, so its later rejection can no longer surface as an unhandled
rejection.
