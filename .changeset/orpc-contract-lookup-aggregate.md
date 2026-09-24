---
"@unthrown/orpc": patch
---

`createResultClient(client, { contract })`: when reconciling a rejection against the contract itself fails (a contract that lacks the called path), the Defect's cause is now an `AggregateError([thatFailure, originalRejection])` instead of the lookup's `TypeError` alone, so the original `ORPCError` is no longer lost. The docs now state prominently that without a `contract` (and always with `fromCall`) the server's `defined` flag decides the channel and `error.data` is not validated — pass the contract against a server you do not fully trust.
