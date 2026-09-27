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

/** Kinds a customer can book online. Custom is quoted; blocks are staff-only. */
export const ONLINE_KINDS = ["birthday", "coaching_one", "coaching_group"] as const;
export type OnlineKind = (typeof ONLINE_KINDS)[number];

export const MANUAL_KINDS = ["birthday", "coaching_one", "coaching_group", "custom"] as const;

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

export const PAYMENT_HANDLING = [
  "paid_bank_transfer",
  "paid_stripe_manual",
  "comp",
  "owed",
] as const;
export type PaymentHandling = (typeof PAYMENT_HANDLING)[number];

export const PAYMENT_HANDLING_LABELS: Record<PaymentHandling, string> = {
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

/** Staff-entered booking for something already agreed. */
export const privateManualSchema = z
  .object({
    kind: z.enum(MANUAL_KINDS),
    host_account_id: z.string().uuid(),
    starts_at: z.string().datetime({ offset: true }),
    hours: z.union([z.literal(1), z.literal(2)]),
    paid_places: z.number().int().min(1).max(200),
    places: z.array(placeSchema).max(50).default([]),
    payment_handling: z.enum(PAYMENT_HANDLING),
    price_pence: z.number().int().min(0).max(10_000_000).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.kind !== "custom" || d.price_pence !== undefined, {
    message: "A custom event needs its agreed price",
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
