import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { listBookingParticipants } from "@/lib/booking";
import { equipmentDeadline, formatPrivateSlot } from "@/lib/private-bookings";
import { PrivateJoinForm } from "@/components/private-bookings/PrivateJoinForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Birthday party invitation — Empowr Members" };

// A guest reaches a booking ONLY through its invite token. This page reads
// what a guest needs — the date, the host's first name, places left — and
// nothing about the host's payment, receipt or account.
export default async function PrivateJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();

  const authed = await getAuthedAccount();
  if (!authed) redirect(`/login?next=${encodeURIComponent(`/private-bookings/join/${token}`)}`);

  const service = createServiceClient();
  const { data: booking, error } = await service
    .from("mem_private_bookings")
    .select("id, status, starts_at, ends_at, total_places, host_account_id, venue:mem_venues(name, address, postcode)")
    .eq("invite_token", token)
    .eq("kind", "birthday")
    .maybeSingle();
  if (error) {
    console.error("private join page read failed", error);
    throw new Error("private_join_read_failed");
  }
  if (!booking) notFound();

  const [{ data: host }, { data: places, error: placesError }] = await Promise.all([
    service.from("mem_accounts").select("name").eq("id", booking.host_account_id).maybeSingle(),
    service
      .from("mem_private_booking_places")
      .select("participant_id, account_id, is_birthday_person")
      .eq("private_booking_id", booking.id),
  ]);
  if (placesError) {
    console.error("private join page places read failed", placesError);
    throw new Error("private_join_read_failed");
  }
  const taken = places ?? [];
  const hostFirstName = ((host?.name as string) || "").trim().split(/\s+/)[0] || "Your host";
  const venue = booking.venue as unknown as { name: string; address: string | null; postcode: string | null } | null;
  const joinable = booking.status === "confirmed" && new Date(booking.starts_at) > new Date();
  const remaining = Math.max(0, booking.total_places - taken.length);

  const participants = await listBookingParticipants(
    { id: authed.account.id, email: authed.user.email ?? "" },
    { age_min: null, age_max: null },
    new Date(booking.starts_at)
  );
  const mine = new Set(
    taken.filter((p) => p.account_id === authed.account.id).map((p) => p.participant_id)
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-black">You’re invited</h1>
      <p className="mt-2 text-mid">
        {hostFirstName} has invited you to a private roller disco birthday party.
      </p>

      <section className="mt-6 space-y-1 rounded-2xl bg-card p-6 text-sm shadow-sm">
        <p className="font-bold text-black">{formatPrivateSlot(booking.starts_at, booking.ends_at)}</p>
        {venue && (
          <p className="text-mid">{[venue.name, venue.address, venue.postcode].filter(Boolean).join(", ")}</p>
        )}
        <p className="pt-2 text-black">Your place is covered by the host — there’s nothing to pay.</p>
      </section>

      <section className="mt-6 rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        {!joinable ? (
          <p className="text-mid">This party is no longer taking registrations.</p>
        ) : (
          <>
            <h2 className="text-xl font-extrabold text-black">Register a skater</h2>
            <p className="mt-2 text-sm text-mid">
              {remaining} {remaining === 1 ? "place" : "places"} left. Skate sizes are needed by{" "}
              {equipmentDeadline(booking.starts_at)}.
            </p>
            <div className="mt-4">
              <PrivateJoinForm
                token={token}
                participants={participants.map((p) => ({
                  id: p.id,
                  name: p.name,
                  waiverSigned: p.waiverSigned,
                  joined: mine.has(p.id),
                }))}
                birthdayPersonTaken={taken.some((p) => p.is_birthday_person)}
                full={remaining === 0}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
