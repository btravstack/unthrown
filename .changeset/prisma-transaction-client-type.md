---
"@unthrown/prisma": minor
---

Export the `TransactionClient<C>` type helper.

Naming the `tx` parameter of a helper factored out of a `$tryTransaction`
callback had no type to reach for: the deny list is internal, and deriving it
from the method does not work — `Parameters<Parameters<C["$tryTransaction"]>[0]>[0]`
degrades to `Omit<unknown, …>`, because `C` is unresolved at that position. So
adopting services hand-copied the list, which then drifts silently: `Omit` of a
key that does not exist is not an error, so the copy keeps compiling after the
library's own list changes.

```ts
import type { TransactionClient } from "@unthrown/prisma";

type Tx = TransactionClient<typeof db>;

const chargeFees = (tx: Tx, id: number) =>
  tx.invoice.tryUpdate({ where: { id }, data: { charged: true } });
```

The deny list stays internal — `$tryTransaction`'s own signature uses this very
alias, so the two cannot drift.
