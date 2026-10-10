// Waivers hub (owner, 2026-10-10): one place to check whether someone has
// signed, see waiver coverage for each upcoming private booking, and reach
// the archive. Coverage is resolved live, with the booking gate's own check.
import Link from "next/link";
import type { Metadata } from "next";
import { Archive, PartyPopper, Search } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { membersUrl } from "@/lib/links";
import { KIND_LABELS, formatPrivateSlot, type PrivateKind } from "@/lib/private-bookings";
import { privateBookingWaivers } from "@/lib/private-booking-waivers";
import { WaiverSearch } from "@/components/admin/WaiverSearch";
import { InviteLinkCopy } from "@/components/admin/InviteLinkCopy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Waivers — Empowr Admin" };

const DAYS_AHEAD = 14;

type BookingRow = {
  id: string;
  kind: PrivateKind;
  starts_at: string;
  ends_at: string;
  total_places: number;
  invite_token: string | null;
  host: { name: string } | null;
  places: {
    account_id: string;
    participant: { id: string; name: string; person_id: string | null } | null;
  }[];
};

async function upcomingPrivateBookings() {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_private_bookings")
    .select(
      `id, kind, starts_at, ends_at, total_places, invite_token, host:mem_accounts(name),
       places:mem_private_booking_places(account_id, participant:mem_participants(id, name, person_id))`
    )
    .eq("status", "confirmed")
    .neq("kind", "block")
    .gte("ends_at", new Date().toISOString())
    .lte("starts_at", new Date(Date.now() + DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString())
    .order("starts_at");
  if (error) {
    console.error("waivers page: private bookings read failed", error);
    return null;
  }
  const rows = (data ?? []) as unknown as BookingRow[];
  return Promise.all(
    rows.map(async (b) => {
      const signed = await privateBookingWaivers(service, b.places);
      const guests = b.places.filter((p) => p.participant);
      return {
        ...b,
        registered: guests.length,
        signedCount: guests.filter((p) => signed.get(p.participant!.id)).length,
      };
    })
  );
}

export default async function WaiversPage() {
  const bookings = await upcomingPrivateBookings();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-3xl font-black">Waivers</h1>
        <p className="mt-1 text-mid">
          Check whether someone has signed, and see waiver cover for each private booking.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <Search className="h-5 w-5 text-blue" aria-hidden /> Has this person signed?
        </h2>
        <p className="text-sm text-mid">
          Searches skaters on Members accounts and signatures on the waiver site. A waiver counts
          for one year on the current wording — the same rule as booking. Every search is recorded
          with your email.
        </p>
        <WaiverSearch />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <PartyPopper className="h-5 w-5 text-blue" aria-hidden /> Private bookings — next {DAYS_AHEAD} days
        </h2>
        <p className="text-sm text-mid">
          Guests sign the waiver as part of joining through the invite link. Send the link to the
          host so their guests register before the day.
        </p>
        {bookings === null ? (
          <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm font-bold text-red-dark">
            Private bookings could not be loaded. Refresh before relying on this list.
          </p>
        ) : bookings.length === 0 ? (
          <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
            No private bookings in the next {DAYS_AHEAD} days.
          </p>
        ) : (
          <ul className="space-y-3">
            {bookings.map((b) => {
              const unsigned = b.registered - b.signedCount;
              return (
                <li key={b.id} className="space-y-3 rounded-2xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-black">
                        {KIND_LABELS[b.kind]} — {b.host?.name || "(no name)"}
                      </p>
                      <p className="text-sm font-semibold text-mid">{formatPrivateSlot(b.starts_at, b.ends_at)}</p>
                    </div>
                    <Link href={`/checkin/private/${b.id}`} className="text-sm font-bold text-blue underline">
                      Open guest list
                    </Link>
                  </div>
                  <p className="text-sm">
                    <span className="font-bold text-black">{b.registered} / {b.total_places}</span> registered ·{" "}
                    <span className="font-bold text-blue-dark">{b.signedCount} signed</span>
                    {unsigned > 0 && <span className="font-extrabold text-red-dark"> · {unsigned} not signed</span>}
                    {b.registered === 0 && (
                      <span className="font-extrabold text-red-dark"> · no guests have registered yet</span>
                    )}
                  </p>
                  {b.invite_token && (
                    <InviteLinkCopy url={membersUrl(`/private-bookings/join/${b.invite_token}`)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <Archive className="h-5 w-5 text-blue" aria-hidden /> Waiver archive
        </h2>
        <p className="text-sm text-mid">
          Signed waivers of people removed from a household, kept in case of a claim.{" "}
          <Link href="/admin/waiver-archive" className="font-bold text-blue underline">
            Search the archive
          </Link>
        </p>
      </section>
    </main>
  );
}
