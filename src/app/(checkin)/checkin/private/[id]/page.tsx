// Door view of one private booking: who is registered, whether each is
// covered by a waiver, the safety information the session register shows,
// hire totals, and check-in. Door staff and admins (the (checkin) layout).
//
// Waiver status is resolved LIVE with checkWaivers(), grouped per account
// because it takes one account email at a time — the same approach the
// session register uses. A guest's waiver can lapse between registering and
// arriving, so the join-time check is not trusted here.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { checkWaivers } from "@/lib/waivers";
import { accountContact } from "@/lib/notifications";
import { ageOn } from "@/lib/age";
import { resolveEmergencyContact } from "@/lib/register-emergency-contact";
import { HIRE_SIZES, KIND_LABELS, formatPrivateSlot } from "@/lib/private-bookings";
import type { PrivateBookingRow } from "@/lib/private-bookings";
import { PrivateCheckinList, type CheckinAttendee } from "@/components/admin/PrivateCheckinList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Private booking check-in — Empowr" };

type PlaceRow = {
  id: string;
  account_id: string;
  equipment: "own" | "hire" | "gear";
  hire_size: string | null;
  is_birthday_person: boolean;
  checked_in_at: string | null;
  participant: {
    id: string;
    name: string;
    dob: string;
    person_id: string | null;
    medical_notes: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  } | null;
};

export default async function PrivateCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceClient();

  const { data, error } = await service
    .from("mem_private_bookings")
    .select(
      `*, host:mem_accounts(name),
       places:mem_private_booking_places(id, account_id, equipment, hire_size, is_birthday_person, checked_in_at,
         participant:mem_participants(id, name, dob, person_id, medical_notes, emergency_contact_name, emergency_contact_phone))`
    )
    .eq("id", id)
    .neq("kind", "block")
    .maybeSingle();
  if (error) {
    console.error("private check-in page read failed", id, error);
    throw new Error("private_checkin_read_failed");
  }
  if (!data) notFound();
  const booking = data as PrivateBookingRow & { host: { name: string } | null; places: PlaceRow[] };
  const startDate = new Date(booking.starts_at);

  // Live waiver status, one call per account.
  const signed = new Map<string, boolean>();
  const byAccount = new Map<string, PlaceRow[]>();
  for (const place of booking.places) {
    const list = byAccount.get(place.account_id) ?? [];
    list.push(place);
    byAccount.set(place.account_id, list);
  }
  await Promise.all(
    [...byAccount.entries()].map(async ([accountId, places]) => {
      const contact = await accountContact(service, accountId);
      const participants = places.flatMap((p) => (p.participant ? [p.participant] : []));
      const statuses = await checkWaivers(contact?.email ?? "", participants);
      for (const s of statuses) signed.set(s.participantId, s.signed);
    })
  );

  const attendees: CheckinAttendee[] = booking.places
    .filter((p) => p.participant)
    .map((p) => ({
      placeId: p.id,
      name: p.participant!.name,
      age: ageOn(p.participant!.dob, startDate),
      isBirthdayPerson: p.is_birthday_person,
      equipment:
        p.equipment === "hire" ? `Hire ${p.hire_size}` : p.equipment === "gear" ? "Gear only (own skates)" : "Own skates",
      waiverSigned: signed.get(p.participant!.id) ?? false,
      medicalNotes: p.participant!.medical_notes,
      emergencyContact: resolveEmergencyContact({
        name: p.participant!.name,
        emergencyContactName: p.participant!.emergency_contact_name,
        emergencyContactPhone: p.participant!.emergency_contact_phone,
      }),
      checkedInAt: p.checked_in_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cancelled = booking.status !== "confirmed";

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-black">
          {KIND_LABELS[booking.kind]} — {booking.host?.name || "(no name)"}
        </h1>
        <p className="mt-1 font-bold text-mid">{formatPrivateSlot(booking.starts_at, booking.ends_at)}</p>
        {cancelled && (
          <p className="mt-2 rounded-xl bg-red-soft p-3 text-sm font-bold text-red-dark">
            This booking is {booking.status === "pending_payment" ? "awaiting payment" : "cancelled"} — it is not confirmed.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-card p-3 shadow-sm">
          <p className="text-mid">Registered</p>
          <p className="text-xl font-black text-black">{attendees.length} / {booking.total_places}</p>
        </div>
        {HIRE_SIZES.map((size) => (
          <div key={size} className="rounded-xl bg-card p-3 shadow-sm">
            <p className="text-mid">Hire {size}</p>
            <p className="text-xl font-black text-black">
              {booking.places.filter((p) => p.hire_size === size).length}
            </p>
          </div>
        ))}
      </div>

      {booking.note && (
        <p className="rounded-xl bg-blue-pale/40 p-3 text-sm text-black">
          <span className="font-bold">Staff note:</span> {booking.note}
        </p>
      )}

      <PrivateCheckinList attendees={attendees} />
    </main>
  );
}
