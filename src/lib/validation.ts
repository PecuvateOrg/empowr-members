// Zod schemas shared by client forms (react-hook-form resolvers) and
// API routes — every API route input is parsed with one of these.
import { z } from "zod";
import { isPlausibleDob } from "@/lib/age";

// UK-tolerant phone check: digits, spaces, +, (), -; 7–15 digits total.
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number")
  .refine((v) => (v.match(/\d/g)?.length ?? 0) >= 7, "Enter a valid phone number");

// Same field, but blank is a valid input too — for the waiver's emergency
// contact, which is only actually required when the waiver covers a minor
// (see waiverSchema below). Blank still round-trips as "" (not null) into
// waiver_responses, matching the standalone form's own behaviour: its
// self-mode never shows the field at all, so it submits "" into the
// NOT NULL emergency_contact_* columns.
const phoneOrBlank = z.union([z.literal(""), phone]);

// Same value set as the standalone waiver.empowrcic.org departure-consent
// step, since both write into the same Waivers-owned departure_consents
// table (see departureConsentEntrySchema below).
//
// Defined in lib/travel-methods, which is dependency-free, and re-exported
// here so existing `from "@/lib/validation"` imports keep working. They live
// there rather than here because client components need them too, and a
// value import of this file drags zod into the browser bundle — see the note
// in that module before moving them back.
export { DEFAULT_TRAVEL_METHODS, TRAVEL_METHODS } from "@/lib/travel-methods";
import { DEFAULT_TRAVEL_METHODS, TRAVEL_METHODS } from "@/lib/travel-methods";

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(200),
  phone: phone.nullable().or(z.literal("").transform(() => null)),
  whatsapp_opt_in: z.boolean(),
});

export const participantSchema = z.object({
  name: z.string().trim().min(1, "Enter the participant's name").max(200),
  dob: z
    .string()
    .refine(isPlausibleDob, "Enter a valid date of birth"),
  emergency_contact_name: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .or(z.literal("").transform(() => null)),
  emergency_contact_phone: phone
    .nullable()
    .or(z.literal("").transform(() => null)),
  medical_notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .or(z.literal("").transform(() => null)),
  // Pre-fill for the per-booking departure consent toggle. No "" ->  null
  // transform here (unlike the plain-string fields above) — z.enum's input
  // type is a literal union, not plain string, so a literal("") branch
  // wouldn't collapse away and would desync zodResolver's input type from
  // ParticipantInput (the output type useForm is pinned to). The empty
  // <option> in ParticipantForm is coerced to null via register()'s
  // setValueAs instead, so zod only ever sees enum | null.
  default_travel_method: z.enum(DEFAULT_TRAVEL_METHODS).nullable(),
});

// In-app waiver (Phase 1). Only captures what Members doesn't already
// hold — the signer, the participant names and whether any are minors are
// all derived server-side from the account and mem_participants, so this
// form is two steps rather than the standalone form's four.
const requiredConsent = (message: string) =>
  z.boolean().refine((v) => v === true, { message });

export const waiverSchema = z.object({
  participant_ids: z
    .array(z.string().uuid())
    .min(1, "Choose at least one person this waiver covers")
    .max(20, "Too many people in one waiver"),
  // Not required here — the standalone form only asks for these at all
  // when covering someone other than the signer, and even then leaves them
  // optional. Members mirrors that: required exactly when the waiver
  // covers a minor, enforced server-side in submitWaiver() against real
  // DOB data (never trust an age claim from the client). Bug found
  // 2026-08-18: this was previously unconditionally required, forcing an
  // emergency contact out of an adult signing for themselves alone.
  emergency_contact_name: z.string().trim().max(200),
  emergency_contact_phone: phoneOrBlank,
  emergency_contact_relationship: z.string().trim().max(100),
  // All three consents are required, and the messages are the standalone
  // form's verbatim (Empowr-Waivers WaiverForm.tsx validateStep step 3) so
  // the two surfaces cannot drift apart. NOTE: photo consent being
  // mandatory is inherited from that form deliberately, not by oversight —
  // see the note in planning/waiver/CONTEXT.md before changing it.
  agreed_tc: requiredConsent("You must agree to the terms and conditions."),
  agreed_waiver: requiredConsent("You must agree to the risk waiver."),
  agreed_photo: requiredConsent("Consent to photo and filming is required."),
});

// Per-booking departure consent (2026-08-10 decision): unlike the waiver
// itself, this is asked fresh at every booking rather than signed once —
// a parent's judgement on whether a child can leave unaccompanied can
// reasonably differ session to session. TRAVEL_METHODS is defined above,
// alongside DEFAULT_TRAVEL_METHODS. Same value set and confirm_* checklist
// as the standalone waiver.empowrcic.org departure-consent step, since
// both write into the same Waivers-owned departure_consents table.
const requiredConfirm = (message: string) =>
  z.boolean().refine((v) => v === true, { message });

export const departureConsentEntrySchema = z
  .object({
    participant_id: z.string().uuid(),
    travel_method: z.enum(TRAVEL_METHODS),
    travel_method_other: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .or(z.literal("").transform(() => null)),
    confirm_mature: requiredConfirm("Confirm the child is mature enough to leave unaccompanied."),
    confirm_knows_route: requiredConfirm("Confirm the child knows their route home."),
    confirm_will_inform_staff: requiredConfirm("Confirm you'll inform staff before they leave."),
    confirm_accepts_responsibility: requiredConfirm("Confirm you accept responsibility once they leave."),
    confirm_understands_staff_override: requiredConfirm("Confirm you understand staff can refuse to let them leave."),
  })
  .refine(
    (d) => d.travel_method !== "other" || !!d.travel_method_other,
    { message: "Describe the travel arrangement", path: ["travel_method_other"] }
  );

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(200),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const passwordLoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const magicLinkSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export const bookingSchema = z
  .object({
    occurrence_id: z.string().uuid().optional(),
    course_run_id: z.string().uuid().optional(),
    participant_ids: z
      .array(z.string().uuid())
      .min(1, "Choose at least one participant")
      .max(10, "Too many participants in one booking"),
    // Optional — most bookings carry none (child is collected in person).
    // Only present for participants whose "leaving unaccompanied" toggle
    // was switched on for this specific booking.
    departure_consents: z.array(departureConsentEntrySchema).default([]),
  })
  .refine(
    (d) => (d.occurrence_id === undefined) !== (d.course_run_id === undefined),
    "Choose a session date or a course to book"
  );

// --- Admin (Step 8) ---
// Number inputs round-trip empty as NaN (register(..., {valueAsNumber:
// true})); select inputs round-trip empty as "". zodResolver needs the
// schema's INPUT type to stay concrete (number | null, or string | null)
// for react-hook-form's defaultValues to typecheck — z.preprocess widens
// the input to `unknown` and breaks that, so these use the same
// base-schema + .transform()/.or() shape as the existing `phone` field
// below rather than preprocess.

const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).nullable().or(z.literal("").transform(() => null));

const nullableInt = (min: number, max?: number) => {
  const ranged = max !== undefined ? z.number().int().min(min).max(max) : z.number().int().min(min);
  return z
    .union([ranged, z.nan()])
    .nullable()
    .transform((v) => (v === null || Number.isNaN(v) ? null : v));
};

const nullableUuid = () =>
  z.string().uuid().nullable().or(z.literal("").transform(() => null));

export const venueSchema = z.object({
  name: z.string().trim().min(1, "Enter a venue name").max(200),
  address: optionalTrimmed(500),
  postcode: optionalTrimmed(20),
  default_capacity: nullableInt(1),
});

export const offeringSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Enter a URL slug")
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers, hyphens only"),
  title: z.string().trim().min(1, "Enter a title").max(200),
  type: z.enum(["drop_in", "lesson", "course", "camp", "event"]),
  description: optionalTrimmed(2000),
  age_min: nullableInt(0, 120),
  age_max: nullableInt(0, 120),
  price_pence: z.number().int().min(0),
  walk_in_price_pence: nullableInt(0),
  early_bird_price_pence: nullableInt(0),
  refund_policy: z.enum(["standard", "non_refundable"]),
  transferable: z.boolean(),
  enrolment_scope: z.enum(["per_occurrence", "per_run"]),
  venue_id: nullableUuid(),
  kit_list: optionalTrimmed(2000),
  active: z.boolean(),
});

export const occurrenceSchema = z.object({
  offering_id: z.string().uuid(),
  course_run_id: nullableUuid().optional(),
  starts_at: z.string().min(1, "Choose a start time"),
  ends_at: z.string().min(1, "Choose an end time"),
  venue_id: nullableUuid(),
  capacity: nullableInt(1),
});

export const courseRunSchema = z.object({
  offering_id: z.string().uuid(),
  label: z.string().trim().min(1, "Enter a label").max(200),
  starts_on: optionalTrimmed(20),
  ends_on: optionalTrimmed(20),
  price_pence: nullableInt(0),
  capacity: nullableInt(1),
  venue_id: nullableUuid(),
});

export const cancelOccurrenceSchema = z.object({
  outcome: z.enum(["refund", "credit"]),
  reason: optionalTrimmed(500),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type ParticipantInput = z.infer<typeof participantSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type WaiverInput = z.infer<typeof waiverSchema>;
export type DepartureConsentEntry = z.infer<typeof departureConsentEntrySchema>;
export type VenueInput = z.infer<typeof venueSchema>;
export type OfferingInput = z.infer<typeof offeringSchema>;
export type OccurrenceInput = z.infer<typeof occurrenceSchema>;
export type CourseRunInput = z.infer<typeof courseRunSchema>;
export type CancelOccurrenceInput = z.infer<typeof cancelOccurrenceSchema>;

// --- Door walk-ins ---
// Occurrence-only by design: mem_hold_bookings() refuses walk-ins on the
// course-run path, because walk_in_price_pence is a single-session door
// price and a course is sold as a whole block. Registers are per-occurrence
// anyway, so the UI can never produce a course target here.
//
// departure_consents mirrors bookingSchema exactly, and is the SAME entry
// schema — the door asks the question the online flow asks, rather than a
// door-shaped variant of it. Added 2026-08-29; until then the door captured
// nothing and the panel just told staff to collect it on paper, which meant
// the one surface where a child is most likely to be leaving imminently was
// the one surface with no record. Still optional, exactly as online: an
// empty array means "collected in person as normal", which is the default
// and the common case. What is NOT allowed is defaulting it from the
// participant's stored travel method — that would fabricate a parent's
// answer, which is the whole reason it is per-booking.
export const walkInSchema = z.object({
  occurrence_id: z.string().uuid(),
  participant_ids: z
    .array(z.string().uuid())
    .min(1, "Choose at least one person")
    .max(10, "Too many people in one walk-in"),
  departure_consents: z.array(departureConsentEntrySchema).default([]),
});
