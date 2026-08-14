import type { AsyncResult } from "unthrown";

/**
 * The error convention this codebase had *before* unthrown: an abstract base
 * class carrying a `kind` discriminant. Thousands of `instanceof` checks and
 * log lines already depend on it, so adopting a `Result` type must not mean
 * rewriting it.
 *
 * It doesn't. `Result<T, E>` is generic in `E` and unconstrained — there is no
 * `E extends { _tag: string }` anywhere in core — and the matcher matches by
 * *structure*. `TaggedError` is what unthrown offers a codebase with no
 * convention yet; this file is what happens when you already have one.
 */
export abstract class AppError extends Error {
  abstract readonly kind: string;
}

export class TicketNotFound extends AppError {
  readonly kind = "TicketNotFound" as const;

  constructor(readonly ticketId: string) {
    super(`no ticket ${ticketId}`);
  }
}

export class TicketLocked extends AppError {
  readonly kind = "TicketLocked" as const;

  constructor(
    readonly ticketId: string,
    readonly lockedBy: string,
  ) {
    super(`ticket ${ticketId} is locked by ${lockedBy}`);
  }
}

/** Exactly the union `E` needs to be: discriminable, and every case nameable. */
export type TicketError = TicketNotFound | TicketLocked;

export type Ticket = { readonly id: string; readonly assignee: string | null };

export type TicketStore = {
  readonly find: (id: string) => AsyncResult<Ticket, TicketNotFound>;
  readonly assign: (ticket: Ticket, to: string) => AsyncResult<Ticket, TicketLocked>;
};

/**
 * Two fallible steps composed. The error channel widens to the union on its
 * own — nothing here mentions a tag, and neither error class knows unthrown
 * exists.
 */
export function assignTicket(
  store: TicketStore,
  ticketId: string,
  to: string,
): AsyncResult<Ticket, TicketError> {
  return store.find(ticketId).flatMap((ticket) => store.assign(ticket, to));
}

export type HttpFailure = { readonly status: number; readonly detail: string };

/**
 * The payoff: `mapErrCases` drives the same exhaustive matcher the tagged path
 * uses, dispatching on `kind` through a plain object pattern. Each branch is
 * narrowed to its own class, so `ticketId` and `lockedBy` are both reachable
 * without a cast.
 *
 * Add a third `AppError` subclass to {@link TicketError} and this stops
 * compiling until it is named here — the guarantee is a property of the
 * union's shape, not of `TaggedError`.
 */
export function assignTicketForHttp(
  store: TicketStore,
  ticketId: string,
  to: string,
): AsyncResult<Ticket, HttpFailure> {
  return assignTicket(store, ticketId, to).mapErrCases((matcher) =>
    matcher
      .with({ kind: "TicketNotFound" }, (e) => ({ status: 404, detail: e.ticketId }))
      .with({ kind: "TicketLocked" }, (e) => ({ status: 423, detail: e.lockedBy })),
  );
}
