// Booking-page reads — RLS-scoped server client. The catalogue policies
// already hide inactive offerings and non-scheduled occurrences, so a
// null here means "not bookable" as far as the member is concerned.
// The authoritative gate is mem_hold_bookings() behind the API route.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OfferingType, Venue } from "@/lib/catalogue";
import type { Participant } from "@/lib/types";
import type { BookingFormParticipant } from "@/components/booking/BookingForm";
import { ageOn, isAgeEligible } from "@/lib/age";
import { checkWaivers } from "@/lib/waivers";
import { coverForOccurrence } from "@/lib/membership";

export type BookableOffering = {
  id: string;
  slug: string;
  title: string;
  type: OfferingType;
  age_min: number | null;
  age_max: number | null;
  price_pence: number;
  refund_policy: "standard" | "non_refundable";
  enrolment_scope: "per_occurrence" | "per_run";
  venue: Venue | null;
};

const OFFERING_JOIN =
  "offering:mem_offerings(id, slug, title, type, age_min, age_max, price_pence, refund_policy, enrolment_scope, venue:mem_venues(id, name, address, postcode))";

export type BookableOccurrence = {
  id: string;
  starts_at: string;
  ends_at: string;
  venue: Venue | null; // override; fall back to offering venue
  offering: BookableOffering;
};

export type BookableCourseRun = {
  id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  price_pence: number | null; // null = offering price
  offering: BookableOffering;
};

/** A future, scheduled occurrence of an active per_occurrence offering. */
export async function getBookableOccurrence(
  id: string
): Promise<BookableOccurrence | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_occurrences")
    .select(
      `id, starts_at, ends_at, venue:mem_venues(id, name, address, postcode), ${OFFERING_JOIN}`
    )
    .eq("id", id)
    .eq("status", "scheduled")
    .gt("starts_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("getBookableOccurrence failed", error);
    return null;
  }
  const occurrence = data as unknown as BookableOccurrence | null;
  if (!occurrence || occurrence.offering.enrolment_scope !== "per_occurrence") {
    return null;
  }
  return occurrence;
}

/** A course run of an active per_run offering that hasn't ended. */
export async function getBookableCourseRun(
  id: string
): Promise<BookableCourseRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_course_runs")
    .select(`id, label, starts_on, ends_on, price_pence, ${OFFERING_JOIN}`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getBookableCourseRun failed", error);
    return null;
  }
  const run = data as unknown as BookableCourseRun | null;
  if (!run || run.offering.enrolment_scope !== "per_run") return null;
  if (run.ends_on && run.ends_on < new Date().toISOString().slice(0, 10)) {
    return null;
  }
  return run;
}

/** The member's household with age eligibility (on the session start
 *  date), waiver status and Subscription cover resolved — view model for
 *  BookingForm.
 *
 *  `occurrence` is optional because course runs cannot be covered by a
 *  Subscription (Q1) — omit it there and nobody comes back covered. */
export async function listBookingParticipants(
  account: { id: string; email: string },
  offering: Pick<BookableOffering, "age_min" | "age_max">,
  startDate: Date,
  occurrence?: { offering_id: string; starts_at: string }
): Promise<BookingFormParticipant[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mem_participants")
    .select("id, name, dob, person_id, default_travel_method")
    .eq("account_id", account.id)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Pick<
    Participant,
    "id" | "name" | "dob" | "person_id" | "default_travel_method"
  >[];
  if (rows.length === 0) return [];

  const waivers = await checkWaivers(account.email, rows);
  const signed = new Map(waivers.map((w) => [w.participantId, w.signed]));

  // Subscription cover, so an already-covered child is never offered a
  // second payment. This is presentation only — /api/bookings runs the same
  // check and is the authority. A failure here therefore degrades to
  // "not covered" and lets the route refuse: the alternative is a booking
  // page that will not render at all, and the money is still protected.
  const covered = new Map<string, string>();
  if (occurrence) {
    try {
      for (const c of await coverForOccurrence(occurrence, {
        participantIds: rows.map((p) => p.id),
      })) {
        covered.set(c.participant_id, c.plan_name);
      }
    } catch (error) {
      console.error("booking page cover read failed", occurrence, error);
    }
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    age: ageOn(p.dob, startDate),
    eligible: isAgeEligible(p.dob, offering.age_min, offering.age_max, startDate),
    waiverSigned: signed.get(p.id) ?? false,
    isMinor: ageOn(p.dob, startDate) < 18,
    defaultTravelMethod: p.default_travel_method,
    coveredByPlan: covered.get(p.id) ?? null,
  }));
}
