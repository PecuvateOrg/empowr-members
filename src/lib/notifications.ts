// Notification/side-effect orchestrators — map booking rows to email
// template data, resolve the recipient's login email, and send. These
// sit between the pure builders in lib/emails/ and the DB. The webhook
// calls sendBookingConfirmationForSession; the admin occurrence-cancel
// route (Step 8) calls sendOccurrenceCancelledEmail. There is no
// member-initiated cancellation sender — members have no self-serve
// cancellation path.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { formatOccurrence, courseRunWhen } from "@/lib/format";
import { buildBookingConfirmationEmail } from "@/lib/emails/booking-confirmation";
import {
  buildOccurrenceCancelledEmail,
  type OccurrenceCancelledEmailData,
} from "@/lib/emails/occurrence-cancelled";
import type { BookingEmailSummary, EmailVenue } from "@/lib/emails/types";
import { membersUrl } from "@/lib/links";

// The joined shape returned for a booking. Supabase types embeds as
// arrays or objects depending on the relationship; we normalise below.
type OfferingJoin = {
  title: string;
  kit_list: string | null;
  refund_policy: "standard" | "non_refundable";
  venue: EmailVenue | null;
};
type BookingRow = {
  id: string;
  account_id: string;
  price_paid_pence: number | null;
  participant: { name: string } | null;
  occurrence: {
    starts_at: string;
    ends_at: string;
    venue: EmailVenue | null;
    offering: OfferingJoin | null;
  } | null;
  course_run: {
    label: string;
    starts_on: string | null;
    ends_on: string | null;
    offering: OfferingJoin | null;
  } | null;
};

const BOOKING_EMAIL_SELECT = `
  id, account_id, price_paid_pence,
  participant:mem_participants(name),
  occurrence:mem_occurrences(
    starts_at, ends_at,
    venue:mem_venues(name, address, postcode),
    offering:mem_offerings(title, kit_list, refund_policy, venue:mem_venues(name, address, postcode))
  ),
  course_run:mem_course_runs(
    label, starts_on, ends_on,
    offering:mem_offerings(title, kit_list, refund_policy, venue:mem_venues(name, address, postcode))
  )
`;

/** Resolve the account holder's login email via the auth admin API. */
async function accountEmail(
  service: SupabaseClient,
  accountId: string
): Promise<string | null> {
  const { data: account } = await service
    .from("mem_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account?.user_id) return null;
  const { data, error } = await service.auth.admin.getUserById(account.user_id);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

/** Fold the booking rows of one Checkout session into a single email
 *  summary (one email covers a multi-child booking). Returns null if the
 *  rows carry no recognisable offering. */
function summariseRows(rows: BookingRow[]): BookingEmailSummary | null {
  const first = rows[0];
  if (!first) return null;

  const offering = first.occurrence?.offering ?? first.course_run?.offering;
  if (!offering) return null;

  const when = first.occurrence
    ? formatOccurrence(first.occurrence.starts_at, first.occurrence.ends_at)
    : first.course_run
      ? courseRunWhen(first.course_run)
      : "";

  // Occurrence override wins, else the offering's own venue.
  const venue = first.occurrence
    ? (first.occurrence.venue ?? offering.venue)
    : offering.venue;

  return {
    offeringTitle: offering.title,
    when,
    venue,
    kitList: offering.kit_list,
    participantNames: rows
      .map((r) => r.participant?.name)
      .filter((n): n is string => Boolean(n)),
    ticketUrls: rows.map((r) => membersUrl(`/ticket/${r.id}`)),
    amountPaidPence: rows.reduce((sum, r) => sum + (r.price_paid_pence ?? 0), 0),
    refundPolicy: offering.refund_policy,
  };
}

/** Send the booking-confirmation email for a paid Checkout session.
 *  Called from the Stripe webhook after holds flip to confirmed. Never
 *  throws — a failed email must not fail the webhook. Returns true if an
 *  email was sent. */
export async function sendBookingConfirmationForSession(
  service: SupabaseClient,
  checkoutSessionId: string
): Promise<boolean> {
  try {
    const { data, error } = await service
      .from("mem_bookings")
      .select(BOOKING_EMAIL_SELECT)
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .eq("status", "confirmed");
    if (error) {
      console.error("confirmation email: booking read failed", checkoutSessionId, error);
      return false;
    }
    const rows = (data ?? []) as unknown as BookingRow[];
    const summary = summariseRows(rows);
    if (!summary) {
      console.error("confirmation email: no summarisable rows", checkoutSessionId);
      return false;
    }

    const to = await accountEmail(service, rows[0].account_id);
    if (!to) {
      console.error("confirmation email: no recipient email", checkoutSessionId);
      return false;
    }

    const { subject, html } = buildBookingConfirmationEmail(summary);
    return await sendEmail({ to, subject, html });
  } catch (err) {
    console.error("confirmation email threw", checkoutSessionId, err);
    return false;
  }
}

/** Send an Empowr-cancelled-the-session notice. Step 8 supplies the
 *  per-booking outcome. Never throws. */
export async function sendOccurrenceCancelledEmail(
  to: string,
  data: OccurrenceCancelledEmailData
): Promise<boolean> {
  const { subject, html } = buildOccurrenceCancelledEmail(data);
  return sendEmail({ to, subject, html });
}
