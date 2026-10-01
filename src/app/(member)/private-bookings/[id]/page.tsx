import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { formatPrice } from "@/lib/format";
import { membersUrl } from "@/lib/links";
import {
  HIRE_SIZES,
  KIND_LABELS,
  PRIVATE_PLACE_SELECT,
  PRIVATE_TERMS,
  equipmentDeadline,
  equipmentLabel,
  formatPrivateSlot,
  type PrivateBookingRow,
  type PrivatePlaceRow,
} from "@/lib/private-bookings";
import { CopyLink } from "@/components/private-bookings/CopyLink";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your private booking — Empowr Members" };

/** Guests belong to other families. The host sees a first name, never the
 *  full record — and nothing from the guest's waiver. */
function firstName(name: string | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "Guest";
}

export default async function PrivateBookingHostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authed = await getAuthedAccount();
  if (!authed) redirect(`/login?next=/private-bookings/${id}`);

  // Service client with an explicit host check: guest places belong to other
  // accounts, which the host's own RLS would (correctly) hide.
  const { data, error } = await createServiceClient()
    .from("mem_private_bookings")
    .select(`*, places:mem_private_booking_places(${PRIVATE_PLACE_SELECT})`)
    .eq("id", id)
    .eq("host_account_id", authed.account.id)
    .maybeSingle();
  if (error) {
    console.error("private host page read failed", id, error);
    throw new Error("private_booking_read_failed");
  }
  if (!data || data.status === "cancelled") notFound();
  const booking = data as PrivateBookingRow & { places: PrivatePlaceRow[] };
  const isBirthday = booking.kind === "birthday";
  const registered = booking.places.length;
  const missing = Math.max(0, booking.total_places - registered);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-black">{KIND_LABELS[booking.kind]}</h1>
      <p className="mt-2 font-bold text-mid">{formatPrivateSlot(booking.starts_at, booking.ends_at)}</p>

      {booking.status === "pending_payment" && (
        <p className="mt-4 rounded-xl bg-blue-pale/40 p-4 text-sm text-black">
          We’re waiting for your payment to confirm. This page updates once it does.
        </p>
      )}

      <section className="mt-6 space-y-2 rounded-2xl bg-card p-6 text-sm shadow-sm">
        <p>
          <span className="font-bold text-black">Places:</span>{" "}
          {isBirthday
            ? `${booking.total_places} (${booking.paid_places} + 1 free for the birthday person)`
            : booking.total_places}
        </p>
        {booking.source === "online" && booking.status === "confirmed" && (
          <p>
            <span className="font-bold text-black">Paid:</span> {formatPrice(booking.price_pence)}
          </p>
        )}
        <p className="text-mid">{PRIVATE_TERMS}</p>
      </section>

      {isBirthday && booking.status === "confirmed" && (
        <section className="mt-6 rounded-2xl bg-card p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-black">Guests</h2>
          {booking.invite_token && (
            <>
              <p className="mt-2 text-sm text-mid">
                Share this link with each skater’s parent or guardian. The birthday person uses it too.
              </p>
              <CopyLink url={membersUrl(`/private-bookings/join/${booking.invite_token}`)} />
            </>
          )}
          <p className="mt-4 text-sm font-bold text-black">
            {registered} of {booking.total_places} registered
            {missing > 0 ? ` — ${missing} still to register` : ""}
          </p>
          <p className="mt-1 text-sm text-mid">
            Skate sizes are needed by {equipmentDeadline(booking.starts_at)}.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {HIRE_SIZES.map((size) => (
              <div key={size} className="rounded-xl bg-white p-3">
                <p className="text-mid">{size}</p>
                <p className="text-lg font-black text-black">
                  {booking.places.filter((p) => p.hire_size === size).length}
                </p>
              </div>
            ))}
            <div className="rounded-xl bg-white p-3">
              <p className="text-mid">Own skates</p>
              <p className="text-lg font-black text-black">
                {booking.places.filter((p) => p.equipment === "own").length}
              </p>
            </div>
          </div>
          {registered > 0 && (
            <ul className="mt-4 divide-y divide-line text-sm">
              {booking.places.map((p) => (
                <li key={p.id} className="flex justify-between py-2">
                  <span className="font-bold text-black">
                    {p.account_id === authed.account.id ? p.participant?.name : firstName(p.participant?.name)}
                    {p.is_birthday_person ? " (birthday person)" : ""}
                  </span>
                  <span className="text-mid">{equipmentLabel(p)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!isBirthday && (
        <section className="mt-6 rounded-2xl bg-card p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-black">Skaters</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {booking.places.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span className="font-bold text-black">{p.participant?.name}</span>
                <span className="text-mid">{equipmentLabel(p)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
