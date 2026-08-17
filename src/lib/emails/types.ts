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

/** A booking as an email cares about it — one offering, one date/run,
 *  one or more participants (a multi-child booking is a single email). */
export type BookingEmailSummary = {
  offeringTitle: string;
  /** Human date/time line, already formatted in Europe/London, e.g.
   *  "Mon 13 Jul, 4:00–5:00pm", or a course-run label. */
  when: string;
  venue: EmailVenue | null;
  kitList: string | null;
  participantNames: string[];
  /** In-house ticket page URL per participant, same order as
   *  participantNames — always populated, one row per booking. */
  ticketUrls: string[];
  amountPaidPence: number;
  refundPolicy: "standard" | "non_refundable";
};

export type BuiltEmail = { subject: string; html: string };

/** The remedy Empowr chose for an occurrence cancellation — refund or
 *  credit. Members have no self-serve path to either; this is always an
 *  admin decision (see occurrence-cancelled.ts). */
export type CancellationOutcome =
  | { kind: "refund"; amountPence: number }
  | { kind: "credit"; amountPence: number; expiresOn: string }; // ISO date
