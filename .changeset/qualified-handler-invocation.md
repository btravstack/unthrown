---
"@unthrown/orpc": patch
---

Qualify handlerResult callback invocation and settlement before eliminating its Result. Thrown or rejected declared ORPCErrors remain defects and expose no message or data on the wire; returned Err values remain modeled failures.
