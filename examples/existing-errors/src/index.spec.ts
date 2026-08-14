import { Err, Ok } from "unthrown";
import { expect, test } from "vitest";
import "@unthrown/vitest";

import {
  TicketLocked,
  TicketNotFound,
  VendorSyntaxError,
  VendorTimeoutError,
  assignTicketForHttp,
  chargeForHttp,
  readableRenderFailure,
  render,
  type BillingClient,
  type BillingError,
  type Ticket,
  type TicketStore,
} from "./index.js";

const TICKET: Ticket = { id: "t_1", assignee: null };

const store = (over: Partial<TicketStore> = {}): TicketStore => ({
  find: () => Ok(TICKET).toAsync(),
  assign: (ticket, to) => Ok({ ...ticket, assignee: to }).toAsync(),
  ...over,
});

// --- your own classes, discriminated by `kind` -------------------------------

test("a `kind`-discriminated class union composes with no tag anywhere", async () => {
  const result = await assignTicketForHttp(store(), "t_1", "ada");
  await expect(result).toBeOkWith({ id: "t_1", assignee: "ada" });
});

test("the not-found branch narrows to TicketNotFound and reads `ticketId`", async () => {
  const result = await assignTicketForHttp(
    store({ find: (id) => Err(new TicketNotFound(id)).toAsync() }),
    "t_missing",
    "ada",
  );
  await expect(result).toBeErrWith({ status: 404, detail: "t_missing" });
});

test("the locked branch narrows to TicketLocked and reads `lockedBy`", async () => {
  const result = await assignTicketForHttp(
    store({ assign: (ticket) => Err(new TicketLocked(ticket.id, "grace")).toAsync() }),
    "t_1",
    "ada",
  );
  await expect(result).toBeErrWith({ status: 423, detail: "grace" });
});

// --- a plain `code` union, no classes at all ---------------------------------

const billing = (charge: BillingClient["charge"]): BillingClient => ({ charge });

const DECLINED = { code: "CARD_DECLINED", declineCode: "51" } satisfies BillingError;
const BROKE = { code: "INSUFFICIENT_FUNDS" } satisfies BillingError;
const THROTTLED = { code: "RATE_LIMITED", retryAfter: 30 } satisfies BillingError;

test("a plain object union folds at the edge, grouped arms included", async () => {
  const declined = billing(() => Err(DECLINED).toAsync());
  const broke = billing(() => Err(BROKE).toAsync());
  const throttled = billing(() => Err(THROTTLED).toAsync());
  const paid = billing(() => Ok({ reference: "pay_1" }).toAsync());

  // the two grouped codes share one arm — both still named
  expect(await chargeForHttp(declined, 100)).toBe(402);
  expect(await chargeForHttp(broke, 100)).toBe(402);
  expect(await chargeForHttp(throttled, 100)).toBe(429);
  expect(await chargeForHttp(paid, 100)).toBe(200);
});

test("a transport blow-up is a defect, not a fourth billing code", async () => {
  const exploding = billing(() =>
    Ok(0)
      .toAsync()
      .map((): { reference: string } => {
        throw new Error("socket hang up");
      }),
  );

  expect(await chargeForHttp(exploding, 100)).toBe(500);
});

// --- untagged third-party classes, matched with P.instanceOf -----------------

test("qualify puts the two known vendor classes in E, and nothing else", () => {
  expect(render("hello")).toBeOkWith({ rendered: "HELLO" });
  expect(render("{{? oops")).toBeErrWith(expect.any(VendorSyntaxError));
  expect(render("{{slow}}")).toBeErrWith(expect.any(VendorTimeoutError));
  // an unmodelled throw never lands in `E`
  expect(render("{{boom}}")).toBeDefectWith(expect.any(RangeError));
});

test("P.instanceOf narrows each vendor class to its own fields", () => {
  expect(readableRenderFailure(render("{{? oops"))).toBeErrWith({
    detail: "bad template syntax at offset 0",
  });
  expect(readableRenderFailure(render("{{slow}}"))).toBeErrWith({
    detail: "renderer timed out after 5000ms",
  });
});
