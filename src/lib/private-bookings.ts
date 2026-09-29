// Private bookings — shared rules for client forms, API routes and tests.
//
// Deliberately free of server-only imports so the verify suites can load it.
// The database is the authority on price and availability
// (planning/architecture/private-bookings.md): everything here is either
// validation of what a client sends or a DISPLAY mirror of a SQL rule.
import { z } from "zod";
import { TIMEZONE } from "@/lib/business-rules";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type PrivateKind =
  | "birthday"
  | "coaching_one"
  | "coaching_group"
  | "custom"
  | "block";

/** Kinds a customer can book online. Blocks are staff-only. */
export const ONLINE_KINDS = ["birthday", "coaching_one", "coaching_group"] as const;
export type OnlineKind = (typeof ONLINE_KINDS)[number];

// No "custom": every private booking is one of the three online types
// (owner decision 2026-09-29). The database still knows the kind; nothing
// here offers it.
export const MANUAL_KINDS = ONLINE_KINDS;

export const KIND_LABELS: Record<PrivateKind, string> = {
  birthday: "Birthday party",
  coaching_one: "1:1 coaching",
  coaching_group: "Group coaching",
  custom: "Custom event",
  block: "Unavailable (blocked)",
};

/** `?type=` values used by the EELA "Book now" links and the prototype. */
export const TYPE_PARAM: Record<string, OnlineKind> = {
  party: "birthday",
  one: "coaching_one",
  group: "coaching_group",
};

export const HIRE_SIZES = ["C10-UK1", "UK1-UK3", "UK4-UK7"] as const;
export type HireSize = (typeof HIRE_SIZES)[number];

// ---------------------------------------------------------------------------
// Choices carried through sign-in. A visitor chooses and sees the price
// signed out; pressing Book sends them to /login with these in `next`, and
// the page restores them. Skaters are NOT carried: they are picked from the
// member's own household once signed in.
// ---------------------------------------------------------------------------

export type PrivateDraft = {
  kind: OnlineKind;
  hours: 1 | 2;
  paidPlaces: number;
  startsAt: string | null;
  equipment: { equipment: "own" | "hire"; hire_size: HireSize | "" }[];
};

const PARAM_FOR_KIND = Object.fromEntries(
  Object.entries(TYPE_PARAM).map(([param, kind]) => [kind, param])
) as Record<OnlineKind, string>;

/** `/private-bookings?...` for a draft, used as the sign-in `next`. */
export function privateDraftPath(d: PrivateDraft): string {
  const q = new URLSearchParams({ type: PARAM_FOR_KIND[d.kind], h: String(d.hours), n: String(d.paidPlaces) });
  if (d.startsAt) q.set("at", d.startsAt);
  if (d.equipment.length > 0) {
    q.set("eq", d.equipment.map((e) => (e.equipment === "hire" ? `hire:${e.hire_size}` : "own")).join(","));
  }
  return `/private-bookings?${q.toString()}`;
}

/** Reads a draft back. Anything malformed is dropped, never trusted: the
 *  hold re-validates everything, this only pre-fills the form. */
export function parsePrivateDraft(params: Record<string, string | undefined>): PrivateDraft | null {
  const kind = params.type ? TYPE_PARAM[params.type] : undefined;
  if (!kind || params.n === undefined) return null;
  const paidPlaces = Number(params.n);
  if (!Number.isInteger(paidPlaces) || paidPlaces < 1 || paidPlaces > 200) return null;
  const hours = params.h === "2" ? 2 : 1;
  const startsAt = params.at && !Number.isNaN(Date.parse(params.at)) ? params.at : null;
  const equipment = (params.eq ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, 50)
    .map((e) => {
      const [kindPart, size] = e.split(":");
      return kindPart === "hire" && (HIRE_SIZES as readonly string[]).includes(size ?? "")
        ? { equipment: "hire" as const, hire_size: size as HireSize }
        : { equipment: "own" as const, hire_size: "" as const };
    });
  return { kind, hours: kind === "birthday" ? 2 : hours, paidPlaces, startsAt, equipment };
}

// Every new booking is paid through Stripe checkout (owner decision
// 2026-09-29). The staff form exists only for bookings agreed and paid before
// online booking opened, so that is the one value it records. The older
// values below can still be READ on rows, never written from here.
export const MANUAL_PAYMENT_HANDLING = "paid_before_launch" as const;

export type PaymentHandling =
  | typeof MANUAL_PAYMENT_HANDLING
  | "paid_bank_transfer"
  | "paid_stripe_manual"
  | "comp"
  | "owed";

export const PAYMENT_HANDLING_LABELS: Record<PaymentHandling, string> = {
  paid_before_launch: "Paid before online booking",
  paid_bank_transfer: "Paid by bank transfer",
  paid_stripe_manual: "Paid in Stripe (outside this app)",
  comp: "Complimentary",
  owed: "Owed — not yet paid",
};

/** A row of mem_private_booking_types, as the pages read it. */
export type PrivateBookingType = {
  kind: Exclude<PrivateKind, "block">;
  title: string;
  unit_price_pence: number | null;
  min_places: number;
  max_places: number | null;
  hire_price_pence: number | null;
  active: boolean;
};

/** One open interval from mem_public_private_availability(). */
export type AvailableSlot = {
  kind: OnlineKind;
  hours: number;
  starts_at: string;
  ends_at: string;
};

/**
 * Display mirror of the price mem_hold_private_booking() computes. The hold
 * is the authority and snapshots its own figure; this exists so the form can
 * show a total before submitting. verify:private-bookings pins the two to the
 * same worked examples.
 */
export function privateBookingPrice(
  type: Pick<PrivateBookingType, "kind" | "unit_price_pence" | "hire_price_pence">,
  hours: number,
  paidPlaces: number,
  hireCount: number
): { totalPence: number; hirePence: number } | null {
  if (type.unit_price_pence === null) return null;
  const unit = type.unit_price_pence;
  // Hire is per skater per BOOKING, never per hour. Birthday hire is included.
  const hirePence =
    type.kind === "birthday" ? 0 : (type.hire_price_pence ?? 0) * hireCount;
  switch (type.kind) {
    case "birthday":
      return { totalPence: unit * paidPlaces, hirePence: 0 };
    case "coaching_one":
      return { totalPence: unit * hours + hirePence, hirePence };
    case "coaching_group":
      return { totalPence: unit * paidPlaces * hours + hirePence, hirePence };
    default:
      return null;
  }
}

/** Birthday places: the paid tickets plus the free place for the birthday person. */
export function totalPlaces(kind: PrivateKind, paidPlaces: number): number {
  return kind === "birthday" ? paidPlaces + 1 : paidPlaces;
}

/** The KB's equipment deadline: two weeks before the booking. */
export function equipmentDeadline(startsAt: string): string {
  const deadline = new Date(new Date(startsAt).getTime() - 14 * 24 * 60 * 60 * 1000);
  return formatInTimeZone(deadline, TIMEZONE, "EEE d MMM yyyy");
}

/** A London wall-clock start ("2026-10-24", 15) as an ISO instant. Staff
 *  pick a date and 3pm or 4pm; the offset (BST or GMT) is decided here, not
 *  by the browser's own timezone. */
export function londonSlotIso(date: string, hour: 15 | 16): string {
  return fromZonedTime(`${date}T${hour}:00:00`, TIMEZONE).toISOString();
}

/** "Sat 31 Oct 2026, 3–5pm" — private slots are always on the hour. */
export function formatPrivateSlot(startsAt: string, endsAt: string): string {
  const day = formatInTimeZone(startsAt, TIMEZONE, "EEE d MMM yyyy");
  const start = formatInTimeZone(startsAt, TIMEZONE, "h");
  const end = formatInTimeZone(endsAt, TIMEZONE, "haaa");
  return `${day}, ${start}–${end}`;
}

// ---------------------------------------------------------------------------
// Customer-facing wording. One copy, used by the form, the pages and emails.
// ---------------------------------------------------------------------------

export const PRIVATE_TERMS =
  "Private bookings are reserved only once paid in full, and are non-refundable and non-transferable — they cannot be cancelled or moved to another date.";

export const COACHING_SAFETY = [
  "Under 18s must wear full protective gear, including a helmet. Adults are advised to wear full protective gear, especially beginners.",
  "Inline skates aren’t permitted for these Sk8 Skool coaching sessions. Please use quad skates.",
] as const;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const placeSchema = z
  .object({
    participant_id: z.string().uuid(),
    equipment: z.enum(["own", "hire"]),
    hire_size: z.enum(HIRE_SIZES).optional(),
  })
  .refine((p) => p.equipment !== "hire" || p.hire_size !== undefined, {
    message: "Choose a hire size for each skater hiring skates",
  });

/** Customer checkout. Every rule here is re-checked by the database. */
export const privateBookingRequestSchema = z
  .object({
    kind: z.enum(ONLINE_KINDS),
    starts_at: z.string().datetime({ offset: true }),
    hours: z.union([z.literal(1), z.literal(2)]),
    paid_places: z.number().int().min(1).max(200),
    places: z.array(placeSchema).max(50).default([]),
  })
  .refine((d) => d.kind !== "birthday" || (d.hours === 2 && d.places.length === 0), {
    message: "A birthday party runs the full two hours; guests register after booking",
  })
  .refine(
    (d) => d.kind === "birthday" || d.places.length === d.paid_places,
    { message: "Choose a skater for every place" }
  )
  .refine((d) => d.kind !== "coaching_one" || d.paid_places === 1, {
    message: "1:1 coaching is for one skater",
  })
  .refine(
    (d) => new Set(d.places.map((p) => p.participant_id)).size === d.places.length,
    { message: "Choose a different skater for each place" }
  );
export type PrivateBookingRequest = z.infer<typeof privateBookingRequestSchema>;

/** Birthday guest joining through the invite link. */
export const privateJoinSchema = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/),
    participant_id: z.string().uuid(),
    equipment: z.enum(["own", "hire"]),
    hire_size: z.enum(HIRE_SIZES).optional(),
    is_birthday_person: z.boolean().default(false),
  })
  .refine((p) => p.equipment !== "hire" || p.hire_size !== undefined, {
    message: "Choose a hire size",
  });

/** Staff-entered booking, agreed and paid before online booking opened. */
export const privateManualSchema = z.object({
  kind: z.enum(MANUAL_KINDS),
  host_account_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  hours: z.union([z.literal(1), z.literal(2)]),
  paid_places: z.number().int().min(1).max(200),
  places: z.array(placeSchema).max(50).default([]),
  note: z.string().trim().max(1000).optional(),
});

export const privateBlockSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  hours: z.union([z.literal(1), z.literal(2)]),
  note: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Database refusals -> what a person is told. Mapped, never echoed: an unknown
// message must not leak a Postgres error to a customer.
// ---------------------------------------------------------------------------

type Refusal = { status: number; message: string };

export const PRIVATE_RPC_ERRORS: Record<string, Refusal> = {
  mem_private_unavailable: { status: 409, message: "That time has just been taken. Please choose another." },
  mem_private_second_hour_locked: {
    status: 409,
    message: "4–5pm opens only once 3–4pm is booked for coaching that day. Please choose 3pm or another date.",
  },
  mem_private_session_clash: { status: 409, message: "Empowr has a session in the space at that time. Please choose another date." },
  mem_private_too_soon: { status: 409, message: "Private bookings must be made at least two weeks in advance." },
  mem_private_in_past: { status: 409, message: "That time has already passed." },
  mem_private_not_saturday: { status: 400, message: "Private bookings run on Saturdays only." },
  mem_private_bad_start: { status: 400, message: "Private bookings start at 3pm or 4pm." },
  mem_private_past_window: { status: 400, message: "Private bookings finish by 5pm." },
  mem_private_bad_duration: { status: 400, message: "That length isn’t available for this kind of booking." },
  mem_private_not_offered: { status: 409, message: "This kind of private booking isn’t open for online booking yet." },
  mem_private_bad_kind: { status: 400, message: "This kind of booking can’t be made here." },
  mem_private_below_minimum: { status: 400, message: "That’s below the minimum number of places for this booking." },
  mem_private_above_maximum: { status: 400, message: "That’s more places than this booking allows." },
  mem_private_bad_places: { status: 400, message: "Check each skater’s equipment and hire size." },
  mem_private_duplicate_participant: { status: 400, message: "Choose a different skater for each place." },
  mem_private_participant_mismatch: { status: 400, message: "One of those skaters isn’t on your account." },
  mem_private_price_required: { status: 400, message: "Enter the agreed price." },
  mem_private_payment_handling_required: { status: 400, message: "Record how this booking was paid." },
  mem_private_not_found: { status: 404, message: "We couldn’t find that booking." },
  mem_private_not_joinable: { status: 409, message: "This party is no longer taking registrations." },
  mem_private_full: { status: 409, message: "Every place on this booking has been taken. Please ask the host." },
  mem_private_already_joined: { status: 409, message: "That skater is already registered for this party." },
  mem_private_birthday_person_taken: { status: 409, message: "The birthday person is already registered." },
  mem_private_venue_not_configured: { status: 500, message: "Private bookings aren’t set up yet." },
};

/** Matches the most specific code first: `mem_private_unavailable` must not
 *  be read as a prefix of anything else, and vice versa. */
export function privateRpcRefusal(message: string | undefined): Refusal | null {
  if (!message) return null;
  const key = Object.keys(PRIVATE_RPC_ERRORS)
    .filter((k) => message.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRIVATE_RPC_ERRORS[key] : null;
}

// ---------------------------------------------------------------------------
// Row shapes shared by the pages, the routes and the confirmation sender
// ---------------------------------------------------------------------------

export type PrivateBookingRow = {
  id: string;
  kind: PrivateKind;
  status: "pending_payment" | "confirmed" | "cancelled";
  source: "online" | "manual";
  venue_id: string;
  starts_at: string;
  ends_at: string;
  host_account_id: string | null;
  paid_places: number;
  total_places: number;
  price_pence: number;
  hire_pence: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  expires_at: string | null;
  payment_handling: string | null;
  created_by_user_id: string | null;
  note: string | null;
  invite_token: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type PrivatePlaceRow = {
  id: string;
  account_id: string;
  participant_id: string;
  equipment: "own" | "hire";
  hire_size: string | null;
  is_birthday_person: boolean;
  checked_in_at: string | null;
  participant: { name: string } | null;
};

export const PRIVATE_PLACE_SELECT =
  "id, account_id, participant_id, equipment, hire_size, is_birthday_person, checked_in_at, participant:mem_participants(name)";

export function equipmentLabel(place: Pick<PrivatePlaceRow, "equipment" | "hire_size">): string {
  return place.equipment === "hire" ? `Skate hire, size ${place.hire_size}` : "Own skates and gear";
}
