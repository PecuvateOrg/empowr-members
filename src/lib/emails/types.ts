// Shared shapes for email template builders. Templates are PURE — they
// take these plain objects (no DB rows, no Supabase types) and return
// { subject, html }, so they can be rendered and snapshot-tested without
// a database. The orchestrators in lib/notifications.ts map DB rows to
// these shapes.

export type EmailVenue = {
  name: string;
  address: string | null;
  postcode: string | null;
};

/** One participant's ticket, with the name it must be labelled by. The
 *  name is whatever the booking row carries, including "" — the template
 *  decides how to label a nameless ticket, and never by looking at a
 *  different row. */
export type EmailTicket = {
  name: string;
  url: string;
};

/** A booking as an email cares about it — one offering, one date/run,
 *  one or more participants (a multi-child booking is a single email). */
export type BookingEmailSummary = {
  offeringTitle: string;
  /** Human date/time line, already formatted in Europe/London, e.g.
   *  "Mon 13 Jul, 4:00–5:00pm", or a course-run label. */
  when: string;
  venue: EmailVenue | null;
  kitList: string | null;
  /** Display-only, for the "Who" line. Blanks are dropped here because an
   *  empty entry would render as a stray comma — safe precisely because
   *  nothing is paired against this list by position. */
  participantNames: string[];
  /** One entry per booking row, each carrying its OWN name alongside its
   *  own ticket URL.
   *
   *  ⚠️ NEVER split this back into two parallel arrays. It was
   *  `participantNames: string[]` + `ticketUrls: string[]` paired by index
   *  until 2026-09-17, while the producer filtered blanks out of the names
   *  and not the URLs. One empty name therefore shifted every later button
   *  onto the previous child's LIVE ticket and dropped the last ticket
   *  entirely — so a member could scan a ticket that marked the wrong child
   *  present on the door register. `NOT NULL` on the name column does not
   *  prevent this: it permits the empty string, which `Boolean('')` filters
   *  out. Keeping name and URL in one object is what makes the two
   *  impossible to misalign. */
  tickets: EmailTicket[];
  amountPaidPence: number;
  refundPolicy: "standard" | "non_refundable";
  /** mem_offerings.transferable — the same flag /api/bookings/[id]/transfer
   *  gates on. Carried here so the email's policy paragraph cannot promise
   *  a move the member will not be offered. */
  transferable: boolean;
  /** Courses are sold as one block and cannot be moved a date at a time,
   *  so they never get the move line even when the flag is on. */
  enrolmentScope: "per_occurrence" | "per_run";
};

/** A paid Checkout can now contain several distinct sessions. Each group
 * stays separate so its venue, kit and cancellation policy cannot leak from
 * the first item onto the rest of the order. */
export type BookingOrderEmailGroup = BookingEmailSummary;

export type BookingOrderEmailSummary = {
  groups: BookingOrderEmailGroup[];
  amountPaidPence: number;
};

export type BuiltEmail = { subject: string; html: string };

/** An internal staff notification for a new paid booking — deliberately
 *  NOT a BookingEmailSummary. That type carries tickets, which are
 *  per-participant credentials meant only for the booking member; a
 *  staff-facing alert needs to identify who booked instead. Scoped to the
 *  Stripe-paid ("online") path only — walk-ins are witnessed live by
 *  staff, and materialised subscriber bookings are a bulk mechanical
 *  event that would flood this inbox if it triggered per row. */
export type StaffBookingAlertData = {
  offeringTitle: string;
  when: string;
  venue: EmailVenue | null;
  participantNames: string[];
  amountPaidPence: number;
  accountName: string;
  accountEmail: string;
};

/** Internal staff notification for a new SUBSCRIPTION (as distinct from a
 *  one-off booking, above). One per subscribe event — never per occurrence
 *  a subscriber is later materialised into (Phase 2 Step 4), which would
 *  fire dozens of these from a single subscribe. */
export type StaffSubscriptionAlertData = {
  planName: string;
  pricePence: number;
  participantName: string;
  accountName: string;
  accountEmail: string;
};

/** Why a checkout needs a human. The three are NOT interchangeable — each
 *  leaves the member in a different place, so the email tells staff a
 *  different thing to do:
 *
 *  - `paid_holds_released` — money taken, places already swept. The member
 *    has been charged and holds NO booking. Refund or rebook.
 *  - `check_failed` — money taken and the database read that would have
 *    told us whether the places survived failed. We do not know. Check by
 *    hand.
 *  - `completed_unpaid` — Stripe closed the checkout without payment
 *    settling. The booking routes pin `["card"]` on the assumption that
 *    payment is synchronous, so nothing in this app will ever confirm it;
 *    if the payment later succeeds the member is charged with no booking
 *    and no further webhook we handle.
 *
 *  ⚠️ Deliberately carries NOTHING that needs a database read. `check_failed`
 *  fires precisely when the database is not answering, so an alert that had
 *  to look up the member's name would fail in the one case it exists for.
 *  Every field here comes off the Stripe session object we already hold. */
export type StrandedHoldReason =
  | "paid_holds_released"
  | "check_failed"
  | "completed_unpaid";

export type StaffStrandedHoldAlertData = {
  reason: StrandedHoldReason;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  amountPence: number | null;
  /** From Stripe's own `customer_details`, not our accounts table. */
  memberEmail: string | null;
  /** Booking ids and the status each was found in, where we could read
   *  them. Empty is meaningful, not missing: on `check_failed` we could
   *  not look. */
  bookings: { id: string; status: string }[];
};

/** The remedy Empowr chose for an occurrence cancellation — refund or
 *  credit. Members have no self-serve path to either; this is always an
 *  admin decision (see occurrence-cancelled.ts). */
export type CancellationOutcome =
  | { kind: "refund"; amountPence: number }
  | { kind: "credit"; amountPence: number; expiresOn: string }; // ISO date

/** Internal staff notification that a plan's "every slot of this offering"
 *  entitlement has stopped being safe — the offering now runs more than one
 *  weekly slot, so subscribers to that plan are entitled to all of them.
 *  Config drift, not a member event: it repeats nightly until someone acts,
 *  because the remedy is a pricing decision nobody can make automatically.
 *  See lib/slot-ambiguity.ts for why this is not auto-fixed. */
export type StaffSlotAmbiguityAlertData = {
  findings: {
    planName: string;
    offeringTitle: string;
    activeSubscribers: number;
    slots: string[];
  }[];
};
