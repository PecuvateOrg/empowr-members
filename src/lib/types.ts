// Row types for the mem_ tables this app reads. Keep in sync with
// src/supabase/migrations/ — extend as later phases touch more tables.

export type Account = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  whatsapp_opt_in: boolean;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "credited"
  | "refunded"
  | "attended"
  | "no_show";

export type Booking = {
  id: string;
  account_id: string;
  participant_id: string;
  occurrence_id: string | null;
  course_run_id: string | null;
  status: BookingStatus;
  price_paid_pence: number | null;
  source: "online" | "walk_in" | "member";
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Participant = {
  id: string;
  account_id: string;
  name: string;
  dob: string; // ISO date
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  person_id: string | null; // waiver system link
  default_travel_method: string | null; // pre-fill for per-booking departure consent
  created_at: string;
  updated_at: string;
};
