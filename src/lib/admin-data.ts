// Admin reads — service client (bypasses RLS) since admin needs inactive
// offerings, past/cancelled occurrences, and full venue detail that the
// public catalogue policies deliberately hide. Callers must already be
// past the (admin) layout's allowlist gate.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { OfferingType } from "@/lib/offering-types";
import type { BookingStatus, Participant } from "@/lib/types";
import { formatOccurrence, courseRunWhen } from "@/lib/format";
import { isAgeEligible } from "@/lib/age";
import { checkWaivers } from "@/lib/waivers";
import { coverForOccurrence, type OccurrenceCover } from "@/lib/membership";

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
 *  admin dashboard's at-a-glance list.
 *
 *  `includeStarted` widens the lower bound back 24 hours so a session that
 *  has ALREADY STARTED is still returned. The check-in page needs that and
 *  says so in its own doc comment ("a rolling window would hide a session
 *  that began ten minutes ago — exactly when the register is most needed"),
 *  but the query contradicted it: `starts_at >= now()` dropped a session the
 *  moment it began, so staff lost the register mid-session and a walk-in
 *  could not be added at all. 24 hours is deliberately generous — callers
 *  filter to a London calendar day afterwards, which is the precise cut. */
export async function listUpcomingOccurrencesForDashboard(
  days = 7,
  includeStarted = false
): Promise<DashboardOccurrence[]> {
  const now = new Date();
  const from = includeStarted ? new Date(now.getTime() - 86_400_000) : now;
  const until = new Date(now.getTime() + days * 86_400_000);
  const { data, error } = await createServiceClient()
    .from("mem_occurrences")
    .select(
      "id, starts_at, ends_at, status, offering:mem_offerings(title), bookings:mem_bookings(count)"
    )
    .eq("status", "scheduled")
    .gte("starts_at", from.toISOString())
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
  /** 'walk_in' rows are shown as paid at the door, so staff can tell a
   *  door payment from an online one without opening Stripe. */
  source: "online" | "walk_in" | "member";
  /** Only meaningful while pending_payment — when the hold lapses. */
  expires_at: string | null;
  participant: { name: string; medical_notes: string | null } | null;
  /** Always true for 'online'/'walk_in' — both gate on a signed waiver
   *  before the row can exist. 'member' rows are materialised (Phase 2 Step
   *  4) with no such gate — a Subscription reserves a place regardless of
   *  waiver status — so this is resolved LIVE via checkWaivers() for those,
   *  the same function every other booking path gates on. Without this, a
   *  materialised row would silently drop the "no waiver" warning that used
   *  to come from the separate live-only subscribers list. */
  waiverSigned: boolean;
};

/** A subscriber whose Subscription covers this occurrence. They hold no
 *  booking row — Phase 2 Step 4 (the Q5 auto-booking build) is what will
 *  create those. Until it ships this is how a subscriber becomes visible at
 *  the door, and it is resolved LIVE from mem_memberships, so a cancellation
 *  removes them from the register with no admin action at all. */
export type RegisterSubscriber = {
  participantId: string;
  name: string;
  planName: string;
  medicalNotes: string | null;
  /** Resolved by calling checkWaivers() — the SAME function the booking and
   *  walk-in routes gate on, never a reimplementation. A subscriber never
   *  passes through the booking flow, so this register is the ONLY place an
   *  unsigned waiver surfaces for them. Fails closed to unsigned. */
  waiverSigned: boolean;
};

export type RegisterOccurrence = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "cancelled_by_empowr" | "completed";
  /** Everything the door walk-in panel needs to decide what it can offer:
   *  the door price (null means walk-ins are refused for this offering)
   *  and the age bounds it must enforce. */
  offering: {
    title: string;
    walk_in_price_pence: number | null;
    age_min: number | null;
    age_max: number | null;
  } | null;
  bookings: RegisterRow[];
  subscribers: RegisterSubscriber[];
  /** Places on this occurrence, resolved occurrence -> venue default, with
   *  null meaning unlimited — the same rule mem_hold_bookings() applies.
   *  Kept in step with that function deliberately: a register that computed
   *  capacity its own way would disagree with the thing actually enforcing
   *  it, which is worse than not showing it at all. */
  capacity: number | null;
};

export async function getRegister(
  occurrenceId: string
): Promise<RegisterOccurrence | null> {
  const service = createServiceClient();
  const { data: occurrence, error: occError } = await service
    .from("mem_occurrences")
    .select(
      "id, starts_at, ends_at, status, offering_id, capacity, venue_id, offering:mem_offerings(title, walk_in_price_pence, age_min, age_max, venue_id, venue:mem_venues(default_capacity))"
    )
    .eq("id", occurrenceId)
    .maybeSingle();
  if (occError || !occurrence) {
    if (occError) console.error("getRegister occurrence read failed", occurrenceId, occError);
    return null;
  }

  // A cancelled booking is a person who is NOT coming, so it must never
  // appear on a door register. This read had no status filter at all: the
  // page's confirmed/attended filters feed only the COUNTS, while the table
  // renders register.bookings unfiltered — so every cancelled row was listed
  // for staff working the door. Found 2026-09-02 on the 2026-09-03 Skate Jam
  // register, which was showing four cancelled test bookings.
  //
  // Newly urgent that day: member self-serve cancellation went live the same
  // afternoon, so from then on every real cancellation would have stayed on
  // the register it had just left.
  //
  // Excluded rather than included: a status not yet invented should default
  // to VISIBLE on a door list. Missing someone who turns up is worse than
  // showing a row staff can read and ignore. `no_show` stays for the same
  // reason — it is an attendance record for this session, not an absence
  // from it.
  const NOT_ATTENDING = ["cancelled", "credited", "refunded"];
  const { data: bookings, error: bookingsError } = await service
    .from("mem_bookings")
    .select(
      "id, status, price_paid_pence, source, expires_at, " +
        "participant:mem_participants(id, name, medical_notes, person_id, account_id, account:mem_accounts(user_id))"
    )
    .eq("occurrence_id", occurrenceId)
    .not("status", "in", `(${NOT_ATTENDING.join(",")})`)
    .order("created_at");
  if (bookingsError) {
    console.error("getRegister bookings read failed", occurrenceId, bookingsError);
    return null;
  }
  type RawBookingRow = Omit<RegisterRow, "waiverSigned" | "participant"> & {
    participant: (WaiverCheckRow & { medical_notes: string | null }) | null;
  };
  const bookingRows = (bookings ?? []) as unknown as RawBookingRow[];

  // Only 'member' rows need a live check — 'online'/'walk_in' rows already
  // gated on a signed waiver before they could exist.
  const memberRowParticipants = bookingRows
    .filter((b): b is RawBookingRow & { participant: WaiverCheckRow } =>
      b.source === "member" && b.participant !== null
    )
    .map((b) => b.participant);
  const signedMemberParticipants = await resolveSignedParticipants(
    service,
    memberRowParticipants
  );

  return {
    ...(occurrence as unknown as Omit<
      RegisterOccurrence,
      "bookings" | "subscribers"
    >),
    bookings: bookingRows.map((b) => ({
      ...b,
      participant: b.participant
        ? { name: b.participant.name, medical_notes: b.participant.medical_notes }
        : null,
      waiverSigned:
        b.source !== "member" || signedMemberParticipants.has(b.participant?.id ?? ""),
    })),
    capacity: await registerCapacity(occurrence),
    subscribers: await registerSubscribers(
      occurrenceId,
      occurrence.offering_id as string,
      occurrence.starts_at as string
    ),
  };
}

/**
 * Places on this occurrence: the occurrence's own capacity, else the venue
 * default, else unlimited.
 *
 * This mirrors mem_hold_bookings():
 *   coalesce(o.capacity, v.default_capacity)
 *   from venue coalesce(o.venue_id, f.venue_id)
 * and must keep mirroring it. The register is only useful here if it agrees
 * with the function that actually refuses bookings.
 *
 * The occurrence's own venue wins over the offering's, because an occurrence
 * can be moved to a different room without changing the offering.
 */
async function registerCapacity(occurrence: {
  capacity: number | null;
  venue_id: string | null;
  offering: unknown;
}): Promise<number | null> {
  if (occurrence.capacity !== null) return occurrence.capacity;

  const offering = occurrence.offering as {
    venue_id: string | null;
    venue: { default_capacity: number | null } | null;
  } | null;

  // The occurrence's own venue overrides the offering's. When it does, the
  // venue joined through the offering is the wrong row, so read the right one.
  if (occurrence.venue_id && occurrence.venue_id !== offering?.venue_id) {
    const service = createServiceClient();
    const { data } = await service
      .from("mem_venues")
      .select("default_capacity")
      .eq("id", occurrence.venue_id)
      .maybeSingle();
    return data?.default_capacity ?? null;
  }

  return offering?.venue?.default_capacity ?? null;
}

type WaiverCheckRow = Pick<Participant, "id" | "name" | "person_id"> & {
  account_id: string;
  account: { user_id: string } | null;
};

/**
 * Which of these participants have a signed waiver, resolved live via
 * checkWaivers() — the SAME function every booking path gates on, grouped
 * per account since checkWaivers() takes one account email at a time.
 * Shared by getRegister() (for materialised 'member' rows) and
 * registerSubscribers() (for not-yet-materialised ones) so there is exactly
 * one place this email-lookup-then-check dance happens.
 */
async function resolveSignedParticipants(
  service: ReturnType<typeof createServiceClient>,
  rows: WaiverCheckRow[]
): Promise<Set<string>> {
  if (rows.length === 0) return new Set();

  const byAccount = new Map<string, WaiverCheckRow[]>();
  for (const row of rows) {
    const group = byAccount.get(row.account_id);
    if (group) group.push(row);
    else byAccount.set(row.account_id, [row]);
  }

  const signed = new Set<string>();
  await Promise.all(
    [...byAccount.entries()].map(async ([accountId, group]) => {
      const userId = group[0].account?.user_id;
      if (!userId) return;
      const { data: authUser, error: authError } =
        await service.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (authError || !email) {
        console.error("resolveSignedParticipants: email lookup failed", accountId, authError);
        return;
      }
      const statuses = await checkWaivers(email, group);
      for (const status of statuses) {
        if (status.signed) signed.add(status.participantId);
      }
    })
  );
  return signed;
}

/**
 * Subscribers entitled to this occurrence who hold no booking row.
 *
 * This exists because a Subscription reserves a place with no booking action
 * (Q5, Empowr 2026-08-31) while capacity, the waiver gate and this register
 * all key off mem_bookings. Until Step 4 materialises those rows, a
 * subscriber would simply not appear at check-in.
 *
 * Read LIVE rather than maintained: status comes from mem_memberships, which
 * the Stripe webhook keeps current, so cancelling a subscription removes the
 * person from every future register immediately and no one has to remember to
 * update anything. That is the whole point — the manual register it replaces
 * drifted every time somebody cancelled.
 *
 * Anyone who ALSO has a live booking row is omitted: they are already in
 * `bookings`, and listing them twice would have staff check one line and
 * leave the other showing as a no-show.
 */
async function registerSubscribers(
  occurrenceId: string,
  offeringId: string,
  startsAt: string
): Promise<RegisterSubscriber[]> {
  const service = createServiceClient();

  // Who is covered is resolved by coverForOccurrence() — the SAME function
  // the booking and walk-in routes use to refuse a double charge. Never
  // reimplement this read: if the two ever disagreed, a subscriber would be
  // charged for a place they already hold and still show here as unbooked.
  //
  // It throws on a read failure; the register deliberately degrades instead.
  // A door with a queue is the wrong place to fail the whole page, and the
  // bookings list above is the part staff cannot do without. The cost is
  // real and worth naming: a transient failure here shows a subscriber as
  // absent, so staff may turn away someone who has paid.
  let memberships: OccurrenceCover[];
  try {
    memberships = await coverForOccurrence({
      offering_id: offeringId,
      starts_at: startsAt,
    });
  } catch (error) {
    console.error("register subscribers read failed", occurrenceId, error);
    return [];
  }
  if (memberships.length === 0) return [];

  const participantIds = memberships.map((m) => m.participant_id);

  // Exclude anyone already holding a live booking on this occurrence.
  const { data: live } = await service
    .from("mem_bookings")
    .select("participant_id")
    .eq("occurrence_id", occurrenceId)
    .in("participant_id", participantIds)
    .in("status", ["pending_payment", "confirmed", "attended"]);
  const booked = new Set((live ?? []).map((b) => b.participant_id as string));

  const pending = memberships.filter((m) => !booked.has(m.participant_id));
  if (pending.length === 0) return [];

  const { data: participants, error: participantsError } = await service
    .from("mem_participants")
    .select("id, name, medical_notes, person_id, account_id, account:mem_accounts(user_id)")
    .in("id", pending.map((m) => m.participant_id));
  if (participantsError || !participants) {
    console.error("register subscribers participant read failed", participantsError);
    return [];
  }

  const signed = await resolveSignedParticipants(
    service,
    participants as unknown as WaiverCheckRow[]
  );

  const planNameFor = new Map(
    pending.map((m) => [m.participant_id, m.plan_name])
  );

  return participants
    .map((row) => ({
      participantId: row.id as string,
      name: row.name as string,
      planName: planNameFor.get(row.id as string) ?? "Subscription",
      medicalNotes: (row.medical_notes as string | null) ?? null,
      waiverSigned: signed.has(row.id as string),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- Door: participant lookup for walk-ins ---

export type WalkInCandidate = {
  id: string;
  name: string;
  dob: string;
  accountId: string;
  accountName: string;
  /** Age bounds for THIS occurrence, evaluated on its start date. */
  ageEligible: boolean;
  /** A live booking (pending_payment/confirmed/attended) already exists on
   *  this occurrence — adding a walk-in would duplicate it, and the unique
   *  index would reject the pending/confirmed cases anyway. */
  alreadyBooked: boolean;
  /** Resolved by calling checkWaivers() — the SAME function the walk-in
   *  route gates on, never a reimplementation. See the note below. */
  waiverSigned: boolean;
  /** Name of the plan already covering this occurrence for them, or null.
   *  WARNS, it does not block — same call as the waiver status beside it,
   *  and for the same reason: this resolves once at search time, so a
   *  transient failure must never leave staff unable to take money at a
   *  door with a queue. Taking payment anyway is a double charge, so the
   *  UI has to make it loud. */
  coveredByPlan: string | null;
};

/**
 * Name search across participants for the door, scoped to one occurrence so
 * every result can carry its own eligibility verdict.
 *
 * Waiver status IS returned, as of 2026-08-29 — but read the reason it did
 * not used to be, because the constraint still holds. The original note said
 * a "cheap advisory copy" of the waiver logic here would be a second gate
 * free to drift from the real one. That was right, and the fix is not to
 * skip the question but to call the same function: checkWaivers() is invoked
 * below exactly as POST /api/admin/walk-ins invokes it, so there is one
 * implementation and it cannot drift from itself. Do NOT replace this with a
 * direct mem_waiver_consents lookup for speed — that reintroduces the copy,
 * and it would silently miss everyone covered only by the legacy fallback
 * path (anyone who signed on the standalone waiver app).
 *
 * Why it is worth the queries: staff previously learned a member had no
 * waiver only after pressing Take payment and getting a 409, at a door with
 * a queue. Search is manual and capped at 10 rows, and the per-account work
 * runs in parallel, so the cost lands on a button press rather than a
 * keystroke.
 *
 * This stays ADVISORY. The authoritative gate remains in the route, before
 * any hold and long before any card is charged — a member who signs on their
 * phone thirty seconds after this search will pass there and be refused here
 * until staff search again, which is the correct way round.
 */
export async function searchWalkInCandidates(
  query: string,
  occurrenceId: string
): Promise<WalkInCandidate[]> {
  const service = createServiceClient();

  const { data: occurrence, error: occError } = await service
    .from("mem_occurrences")
    .select("starts_at, offering:mem_offerings(id, age_min, age_max)")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (occError || !occurrence) {
    if (occError) console.error("searchWalkInCandidates occurrence read failed", occError);
    return [];
  }
  const target = occurrence as unknown as {
    starts_at: string;
    offering: { id: string; age_min: number | null; age_max: number | null } | null;
  };

  // escape PostgREST's ilike wildcards so a literal % or _ in a name can't
  // widen the search into "everyone".
  const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await service
    .from("mem_participants")
    // person_id and account.user_id are here for the waiver check below:
    // checkWaivers() needs the participant's linked signer, and it matches
    // signers on the ACCOUNT'S auth email, which lives in auth.users.
    .select("id, name, dob, person_id, account_id, account:mem_accounts(name, user_id)")
    .ilike("name", pattern)
    .order("name")
    .limit(10);
  if (error) {
    console.error("searchWalkInCandidates failed", error);
    return [];
  }
  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    dob: string;
    person_id: string | null;
    account_id: string;
    account: { name: string; user_id: string } | null;
  }[];
  if (rows.length === 0) return [];

  const { data: live } = await service
    .from("mem_bookings")
    .select("participant_id")
    .eq("occurrence_id", occurrenceId)
    .in("participant_id", rows.map((r) => r.id))
    .in("status", ["pending_payment", "confirmed", "attended"]);
  const booked = new Set((live ?? []).map((b) => b.participant_id as string));

  // Waiver cover, per account — checkWaivers() takes one account email and
  // that account's participants, so results are grouped rather than checked
  // row by row. Accounts run in parallel: a door search is capped at 10 rows,
  // so this is a handful of concurrent lookups on a button press.
  const byAccount = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byAccount.get(row.account_id);
    if (group) group.push(row);
    else byAccount.set(row.account_id, [row]);
  }

  const signed = new Set<string>();
  await Promise.all(
    [...byAccount.entries()].map(async ([accountId, group]) => {
      const userId = group[0].account?.user_id;
      if (!userId) return;
      // auth.users is not exposed through PostgREST, so the email comes from
      // the admin API. No email means checkWaivers() would fail every match
      // closed — leave the group unsigned rather than guessing, which is the
      // same direction the route fails.
      const { data: authUser, error: authError } =
        await service.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (authError || !email) {
        console.error("walk-in search: account email lookup failed", accountId, authError);
        return;
      }
      const statuses = await checkWaivers(email, group);
      for (const status of statuses) {
        if (status.signed) signed.add(status.participantId);
      }
    })
  );

  // Subscription cover — coverForOccurrence(), the same function the member
  // booking route refuses on. Degrades to "not covered" on failure, which is
  // the direction that keeps the door working; the cost is that staff could
  // take a payment a subscriber did not owe, which is refundable. Failing the
  // whole search is not recoverable at a door.
  const covered = new Map<string, string>();
  if (target.offering) {
    try {
      for (const c of await coverForOccurrence(
        { offering_id: target.offering.id, starts_at: target.starts_at },
        { participantIds: rows.map((r) => r.id) }
      )) {
        covered.set(c.participant_id, c.plan_name);
      }
    } catch (error) {
      console.error("walk-in search cover read failed", occurrenceId, error);
    }
  }

  const on = new Date(target.starts_at);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dob: row.dob,
    accountId: row.account_id,
    accountName: row.account?.name ?? "—",
    ageEligible: isAgeEligible(
      row.dob,
      target.offering?.age_min ?? null,
      target.offering?.age_max ?? null,
      on
    ),
    alreadyBooked: booked.has(row.id),
    waiverSigned: signed.has(row.id),
    coveredByPlan: covered.get(row.id) ?? null,
  }));
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
