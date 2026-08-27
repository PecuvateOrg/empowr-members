// Admin reads — service client (bypasses RLS) since admin needs inactive
// offerings, past/cancelled occurrences, and full venue detail that the
// public catalogue policies deliberately hide. Callers must already be
// past the (admin) layout's allowlist gate.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { OfferingType } from "@/lib/offering-types";
import type { BookingStatus } from "@/lib/types";
import { formatOccurrence, courseRunWhen } from "@/lib/format";

export type AdminVenue = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  default_capacity: number | null;
};

export async function listAdminVenues(): Promise<AdminVenue[]> {
  const { data, error } = await createServiceClient()
    .from("mem_venues")
    .select("id, name, address, postcode, default_capacity")
    .order("name");
  if (error) {
    console.error("listAdminVenues failed", error);
    return [];
  }
  return data ?? [];
}

export type AdminOffering = {
  id: string;
  slug: string;
  title: string;
  type: OfferingType;
  description: string | null;
  age_min: number | null;
  age_max: number | null;
  price_pence: number;
  walk_in_price_pence: number | null;
  early_bird_price_pence: number | null;
  refund_policy: "standard" | "non_refundable";
  transferable: boolean;
  enrolment_scope: "per_occurrence" | "per_run";
  venue_id: string | null;
  kit_list: string | null;
  active: boolean;
};

const OFFERING_COLUMNS =
  "id, slug, title, type, description, age_min, age_max, price_pence, walk_in_price_pence, early_bird_price_pence, refund_policy, transferable, enrolment_scope, venue_id, kit_list, active";

export async function listAdminOfferings(): Promise<AdminOffering[]> {
  const { data, error } = await createServiceClient()
    .from("mem_offerings")
    .select(OFFERING_COLUMNS)
    .order("title");
  if (error) {
    console.error("listAdminOfferings failed", error);
    return [];
  }
  return data ?? [];
}

export async function getAdminOffering(
  id: string
): Promise<AdminOffering | null> {
  const { data, error } = await createServiceClient()
    .from("mem_offerings")
    .select(OFFERING_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getAdminOffering failed", id, error);
    return null;
  }
  return data;
}

export type AdminOccurrence = {
  id: string;
  starts_at: string;
  ends_at: string;
  venue_id: string | null;
  capacity: number | null;
  status: "scheduled" | "cancelled_by_empowr" | "completed";
  course_run_id: string | null;
  booked_count: number;
};

export async function listAdminOccurrences(
  offeringId: string
): Promise<AdminOccurrence[]> {
  const { data, error } = await createServiceClient()
    .from("mem_occurrences")
    .select(
      "id, starts_at, ends_at, venue_id, capacity, status, course_run_id, bookings:mem_bookings(count)"
    )
    .eq("offering_id", offeringId)
    .order("starts_at", { ascending: false });
  if (error) {
    console.error("listAdminOccurrences failed", offeringId, error);
    return [];
  }
  return (data ?? []).map((row) => {
    const { bookings, ...rest } = row as typeof row & {
      bookings: { count: number }[];
    };
    return { ...rest, booked_count: bookings?.[0]?.count ?? 0 };
  });
}

export type AdminCourseRun = {
  id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  price_pence: number | null;
  capacity: number | null;
  venue_id: string | null;
};

export async function listAdminCourseRuns(
  offeringId: string
): Promise<AdminCourseRun[]> {
  const { data, error } = await createServiceClient()
    .from("mem_course_runs")
    .select("id, label, starts_on, ends_on, price_pence, capacity, venue_id")
    .eq("offering_id", offeringId)
    .order("starts_on", { ascending: false, nullsFirst: true });
  if (error) {
    console.error("listAdminCourseRuns failed", offeringId, error);
    return [];
  }
  return data ?? [];
}

export type DashboardOccurrence = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "cancelled_by_empowr" | "completed";
  offering: { title: string } | null;
  booked_count: number;
};

/** Scheduled occurrences in the next `days` days, soonest first — the
 *  admin dashboard's at-a-glance list. */
export async function listUpcomingOccurrencesForDashboard(
  days = 7
): Promise<DashboardOccurrence[]> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);
  const { data, error } = await createServiceClient()
    .from("mem_occurrences")
    .select(
      "id, starts_at, ends_at, status, offering:mem_offerings(title), bookings:mem_bookings(count)"
    )
    .eq("status", "scheduled")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString())
    .order("starts_at");
  if (error) {
    console.error("listUpcomingOccurrencesForDashboard failed", error);
    return [];
  }
  const rows = (data ?? []) as unknown as (Omit<DashboardOccurrence, "booked_count"> & {
    bookings: { count: number }[];
  })[];
  return rows.map(({ bookings, ...rest }) => ({
    ...rest,
    booked_count: bookings?.[0]?.count ?? 0,
  }));
}

export type RegisterRow = {
  id: string;
  status: BookingStatus;
  price_paid_pence: number | null;
  participant: { name: string; medical_notes: string | null } | null;
};

export type RegisterOccurrence = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "cancelled_by_empowr" | "completed";
  offering: { title: string } | null;
  bookings: RegisterRow[];
};

export async function getRegister(
  occurrenceId: string
): Promise<RegisterOccurrence | null> {
  const service = createServiceClient();
  const { data: occurrence, error: occError } = await service
    .from("mem_occurrences")
    .select("id, starts_at, ends_at, status, offering:mem_offerings(title)")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (occError || !occurrence) {
    if (occError) console.error("getRegister occurrence read failed", occurrenceId, occError);
    return null;
  }

  const { data: bookings, error: bookingsError } = await service
    .from("mem_bookings")
    .select(
      "id, status, price_paid_pence, participant:mem_participants(name, medical_notes)"
    )
    .eq("occurrence_id", occurrenceId)
    .order("created_at");
  if (bookingsError) {
    console.error("getRegister bookings read failed", occurrenceId, bookingsError);
    return null;
  }

  return {
    ...(occurrence as unknown as Omit<RegisterOccurrence, "bookings">),
    bookings: (bookings ?? []) as unknown as RegisterRow[],
  };
}

// --- Check-in (QR scan landing page) ---
// Deliberately its own selector, not shared with lib/ticket.ts's public
// getTicket() — this one is only ever reached from an ADMIN_EMAILS-gated
// route, so it's fine to include medical_notes; ticket.ts must never gain
// that field, which is exactly why the two aren't merged into one.

export type BookingForCheckin = {
  id: string;
  status: BookingStatus;
  /** course_run bookings have no per-week attendance concept in the
   *  schema — the check-in page hides "Mark attended" when this is true
   *  rather than letting one week's scan mark the whole run done. */
  isCourseRun: boolean;
  offeringTitle: string;
  when: string;
  participantName: string;
  medicalNotes: string | null;
};

type CheckinRow = {
  id: string;
  status: BookingStatus;
  occurrence_id: string | null;
  course_run_id: string | null;
  participant: { name: string; medical_notes: string | null } | null;
  occurrence: {
    starts_at: string;
    ends_at: string;
    offering: { title: string } | null;
  } | null;
  course_run: {
    label: string;
    starts_on: string | null;
    ends_on: string | null;
    offering: { title: string } | null;
  } | null;
};

export async function getBookingForCheckin(
  bookingId: string
): Promise<BookingForCheckin | null> {
  const { data, error } = await createServiceClient()
    .from("mem_bookings")
    .select(
      `id, status, occurrence_id, course_run_id,
       participant:mem_participants(name, medical_notes),
       occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title)),
       course_run:mem_course_runs(label, starts_on, ends_on, offering:mem_offerings(title))`
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    console.error("getBookingForCheckin failed", bookingId, error);
    return null;
  }
  const row = data as unknown as CheckinRow | null;
  if (!row) return null;

  const offering = row.occurrence?.offering ?? row.course_run?.offering;
  if (!offering) return null;

  const when = row.occurrence
    ? formatOccurrence(row.occurrence.starts_at, row.occurrence.ends_at)
    : row.course_run
      ? courseRunWhen(row.course_run)
      : "";

  return {
    id: row.id,
    status: row.status,
    isCourseRun: Boolean(row.course_run_id),
    offeringTitle: offering.title,
    when,
    participantName: row.participant?.name ?? "—",
    medicalNotes: row.participant?.medical_notes ?? null,
  };
}
