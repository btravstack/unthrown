---
"@unthrown/prisma": minor
---

Error-channel, pagination and error-serialisation fixes.

- **`tryDelete` and `tryDeleteMany` carry `UniqueConstraintViolation`.** An
  `onDelete: SetDefault` / `SetNull` rewrite of the referencing rows can collide
  with a unique index, and P2002 was already mapped at runtime — so a
  type-exhaustive match on a delete's error turned that `Err` into a
  `NonExhaustiveError` defect. An exhaustive match on a delete now needs a
  `UniqueConstraintViolation` arm.
- **The default pagination cursor round-trips an all-digits string id.** It used
  to parse `"42"` back to the number `42`, so every cursor on a model with such
  ids came back `InvalidCursor`. A string id that looks numeric is now serialised
  as `~42`; every other id serialises as before.
- **Modeled errors no longer serialise the Prisma error.** `cause`, whose message
  quotes the failing call and its values, is non-enumerable, so
  `JSON.stringify(error)` leaves it out. It is still readable. Never send a
  modeled error to a client unmapped.
- `CreateError`, `CreateManyError`, `UpdateError`, `UpdateManyError`,
  `UpsertError`, `DeleteError`, `DeleteManyError`, `TxDenyList`,
  `TryTransaction` and `UnwrapPrismaTuple` are exported, since the public signatures name them.
