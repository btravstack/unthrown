---
"unthrown": major
---

`TaggedError` now reserves `message` in the payload, alongside `name`. A payload
field named `message` is rejected at compile time (`message?: never`), and the
base constructor no longer forwards a payload `message` to `Error`. Define an
error's message once per subclass the standard way — `override message = "…"`
(it may interpolate the payload via `this`, since the base populates the fields
before the subclass field initialiser runs) — so the payload carries only
structured domain fields, never the human string.

**Breaking:** an error declaring `<{ message: string; … }>` and constructed with
`new E({ message, … })` no longer type-checks, and the message is no longer taken
from the payload at runtime. Move the message to an `override message` field and
drop it from the payload:

```ts
// before
class TicketNotFound extends TaggedError("TICKET_NOT_FOUND")<{
  message: string;
  ticketId: string;
}> {}
new TicketNotFound({ message: "Ticket not found", ticketId });

// after
class TicketNotFound extends TaggedError("TICKET_NOT_FOUND")<{ ticketId: string }> {
  override message = "Ticket not found";
}
new TicketNotFound({ ticketId });
```
